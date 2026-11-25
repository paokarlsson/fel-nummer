// Motorn: klocka, händelsekö, jobbkö (pump) och agentturer.
import type { CaseEvent, CaseFile, CaseCharacter, ChatId, CharId } from './types';
import type { GameState, LogEntry, Message, EndingResult } from './state';
import { parseAt, nextWake, isAwake, dayIndex } from './time';
import { between, type Rng } from './rng';
import { buildPrompt, buildSystem, REPLY_SCHEMA, type Situation } from './prompt';
import { cleanText, parseAgentReply, splitSms, violatedGuard } from './guards';
import { canAct, groupScores, isAlive, pickGroupTurns, pickInitiative, MAX_DEPTH } from './turns';
import { LlmError, type LlmProvider } from '../llm/provider';

export type Tempo = 'lugnt' | 'normalt' | 'snabbt';
export const TEMPO: Record<Tempo, { factor: number; silence: number }> = {
  lugnt: { factor: 1, silence: 50 },
  normalt: { factor: 0.75, silence: 40 },
  snabbt: { factor: 0.5, silence: 30 },
};

type Job =
  | { kind: 'event'; ev: CaseEvent }
  | { kind: 'turn'; who: CharId; situation: Situation; chat: ChatId; depth: number }
  | { kind: 'service'; id: string; text: string };

export type EngineNotice = 'auth' | 'rate' | 'rate-ok' | 'budget' | 'end';

export interface EngineDeps {
  provider: LlmProvider;
  model: () => string;
  rng: Rng;
  sleep: (ms: number) => Promise<void>;
  tempo: () => Tempo;
  now?: () => number;
  /** Max antal anrop per spel, eller 0 för obegränsat. */
  callLimit?: () => number;
  onChange?: () => void;
  onIncoming?: (chat: ChatId, msg: Message) => void;
  onNotice?: (kind: EngineNotice, text?: string) => void;
}

const digits = (s: string) => s.replace(/\D/g, '');

export class Engine {
  readonly events: CaseEvent[];
  private queue: Job[] = [];
  private running: Promise<void> | null = null;
  private halted = false;
  /** Vem som skriver i varje chatt just nu (visas som "skriver…"). */
  typing: Record<ChatId, CharId | undefined> = {};
  lastActivity: number;

  constructor(
    readonly c: CaseFile,
    readonly s: GameState,
    private d: EngineDeps,
  ) {
    // Händelserna sorteras på tid. Samma tid behåller filens ordning.
    this.events = c.events
      .map((ev, i) => ({ ev, i, t: parseAt(ev.at) }))
      .sort((a, b) => a.t - b.t || a.i - b.i)
      .map((x) => x.ev);
    this.lastActivity = this.now();
  }

  // ---------- hjälpare ----------

  private now() {
    return this.d.now ? this.d.now() : Date.now();
  }
  private get f() {
    return TEMPO[this.d.tempo()].factor;
  }
  char(id: string): CaseCharacter | undefined {
    return this.c.characters.find((x) => x.id === id);
  }
  isGroup(chat: ChatId) {
    return chat in this.s.groups;
  }
  log(who: string, kind: LogEntry['kind'], text: string) {
    this.s.log.push({ t: this.s.t, who, kind, text });
    if (this.s.log.length > 500) this.s.log.splice(0, this.s.log.length - 500);
  }
  private changed() {
    this.d.onChange?.();
  }
  get busy(): boolean {
    return this.running !== null || this.queue.length > 0 || Object.values(this.typing).some(Boolean);
  }
  nextEventTime(): number | null {
    const ev = this.events[this.s.eventIdx];
    return ev ? parseAt(ev.at) : null;
  }

  private push(chat: ChatId, m: Omit<Message, 'id' | 't'> & { t?: number }): Message {
    const msg: Message = { id: this.s.nextId++, t: m.t ?? this.s.t, ...m };
    (this.s.chats[chat] ??= []).push(msg);
    if (m.from !== 'player' && m.from !== 'system') {
      this.s.unread[chat] = (this.s.unread[chat] ?? 0) + 1;
      this.d.onIncoming?.(chat, msg);
    }
    this.changed();
    return msg;
  }

  /** Spelarens nummer för en avsändare: sparat namn eller numret. */
  label(id: string): string {
    if (id === 'player') return 'Du';
    const saved = this.s.contacts[id]?.name;
    if (saved) return saved;
    return this.c.characters.find((x) => x.id === id)?.number ?? this.c.services.find((x) => x.id === id)?.number ?? id;
  }

  /** Numret bakom en chatt eller avsändare. */
  numberOf(id: string): string {
    if (id.startsWith('num:')) return id.slice(4);
    return this.c.characters.find((x) => x.id === id)?.number ?? this.c.services.find((x) => x.id === id)?.number ?? '';
  }

  // ---------- spelarens handlingar ----------

  playerSend(chat: ChatId, text: string, extra: Partial<Message> = {}) {
    if (this.s.ended) return;
    const ch = this.char(chat);
    const dead = ch ? !isAlive(ch, this.s.t) : false;
    const unknown = chat.startsWith('num:');
    const left = this.isGroup(chat) ? false : dead || unknown;
    this.push(chat, { from: 'player', text, status: left ? 'sent' : 'delivered', ...extra });
    this.lastActivity = this.now();
    this.afterPlayerMessage(chat);
  }

  forward(msg: Message, fromChat: ChatId, toChat: ChatId) {
    const origin = msg.fwdFrom ?? (msg.from === 'player' ? this.c.player.number : this.numberOf(msg.from === 'system' ? fromChat : msg.from));
    this.playerSend(toChat, msg.text ?? '', {
      fwdFrom: msg.news ? msg.news.paper : origin,
      news: msg.news,
      image: msg.image,
      alt: msg.alt,
    });
  }

  /** Öppnar (eller hittar) en chatt för ett nummer som spelaren skriver in. */
  chatForNumber(raw: string): ChatId | null {
    const d = digits(raw);
    if (d.length < 5) return null;
    if (d === digits(this.c.player.number)) return null;
    const ch = this.c.characters.find((x) => digits(x.number) === d);
    if (ch) return ch.id;
    const sv = this.c.services.find((x) => digits(x.number) === d);
    if (sv) return sv.id;
    return `num:${raw.trim()}`;
  }

  private afterPlayerMessage(chat: ChatId) {
    const sv = this.c.services.find((x) => x.id === chat);
    if (sv) {
      const reply = sv.autoReply ?? (sv.replies?.length ? sv.replies[Math.floor(this.d.rng() * sv.replies.length)] : null);
      if (reply) this.enqueue({ kind: 'service', id: sv.id, text: reply });
      return;
    }
    if (this.isGroup(chat)) {
      this.groupReact(chat, 0);
      return;
    }
    const ch = this.char(chat);
    if (!ch || !isAlive(ch, this.s.t)) return;
    if (!isAwake(ch.schedule, this.s.t)) {
      const p = this.s.agents[ch.id].pending;
      if (!p.includes(chat)) p.push(chat);
      this.log(ch.name, 'info', 'sover, svarar när hen vaknar');
      return;
    }
    this.enqueueTurn(ch.id, 'reply', chat, 0);
  }

  // ---------- köer ----------

  private enqueue(job: Job) {
    this.queue.push(job);
    this.pump();
  }

  private enqueueTurn(who: CharId, situation: Situation, chat: ChatId, depth: number) {
    const dupe = this.queue.some((j) => j.kind === 'turn' && j.who === who && j.chat === chat);
    if (!dupe) this.enqueue({ kind: 'turn', who, situation, chat, depth });
  }

  /** Lägger in passerade händelser i jobbkön. */
  private fireDue() {
    while (this.s.eventIdx < this.events.length && parseAt(this.events[this.s.eventIdx].at) <= this.s.t) {
      this.queue.unshift({ kind: 'event', ev: this.events[this.s.eventIdx++] });
    }
  }

  /** Kör jobben ett i taget. Returnerar när kön är tom. */
  pump(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        for (;;) {
          if (this.halted || this.s.ended) break;
          this.fireDue();
          const job = this.queue.shift();
          if (!job) break;
          await this.run(job);
          this.lastActivity = this.now();
          if (this.queue.length) await this.d.sleep(1500 * this.f);
        }
      } finally {
        this.running = null;
        this.lastActivity = this.now();
        this.changed();
      }
    })();
    return this.running;
  }

  /** Väntar tills allt som är på gång är klart (används i tester). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  /** Stoppar körningen (t.ex. utan giltig nyckel). Jobbet som pågick läggs tillbaka. */
  halt() {
    this.halted = true;
  }
  resume() {
    this.halted = false;
    this.lastActivity = this.now();
    this.pump();
  }

  private async run(job: Job) {
    if (job.kind === 'event') return this.runEvent(job.ev);
    if (job.kind === 'service') {
      await this.d.sleep(2500 * this.f);
      this.push(job.id, { from: job.id, text: job.text });
      return;
    }
    return this.runTurn(job);
  }

  // ---------- händelser ----------

  private conditionHolds(ev: CaseEvent): boolean {
    const cond = ev.if;
    if (!cond) return true;
    if (cond.playerRevealed && !this.s.agents[cond.playerRevealed]?.revealed) return false;
    if (cond.flag && !this.s.flags[cond.flag]) return false;
    if (cond.notFlag && this.s.flags[cond.notFlag]) return false;
    return true;
  }

  private async runEvent(ev: CaseEvent) {
    if (!this.conditionHolds(ev)) {
      this.log('händelse', 'event', `hoppade över ${ev.at} (villkor)`);
      return;
    }
    if (ev.stress) {
      for (const [id, delta] of Object.entries(ev.stress)) {
        const ids = id === 'all' ? Object.keys(this.s.agents) : [id];
        for (const x of ids) if (this.s.agents[x]) this.s.agents[x].stress = clamp(this.s.agents[x].stress + delta, 0, 10);
      }
    }
    if (ev.createGroup) {
      const g = ev.createGroup;
      const members =
        g.members === 'allAlive' ? this.c.characters.filter((ch) => isAlive(ch, this.s.t)).map((ch) => ch.id) : g.members;
      this.s.groups[g.id] = { name: g.name, members, createdBy: g.createdBy };
      this.push(g.id, { from: 'system', text: `${this.label(g.createdBy)} skapade gruppen "${g.name}" och lade till dig` });
      this.s.unread[g.id] = (this.s.unread[g.id] ?? 0) + 1;
    }
    if (ev.from && (ev.text || ev.news || ev.image)) {
      const chat = ev.to ?? ev.from;
      const ch = this.char(ev.from);
      if (ch) {
        this.typing[chat] = ch.id;
        this.changed();
        await this.d.sleep(typingMs(ev.text ?? '') * this.f);
        this.typing[chat] = undefined;
      }
      const msg = this.push(chat, { from: ev.from, text: ev.text, news: ev.news, image: ev.image, alt: ev.alt });
      this.log(ch?.name ?? ev.from, 'event', ev.text ?? ev.news?.head ?? '[bild]');
      if (ev.deleteAfter) this.scheduleDelete(msg, ev.deleteAfter * 1000);
      if (ev.react && this.isGroup(chat)) this.groupReact(chat, 0);
    }
    if (ev.end) {
      this.s.endReached = true;
      this.log('händelse', 'event', 'fallets slutpunkt');
      this.d.onNotice?.('end');
    }
    this.changed();
  }

  private scheduleDelete(msg: Message, ms: number) {
    void this.d.sleep(ms).then(() => {
      msg.deleted = true;
      this.changed();
    });
  }

  // ---------- grupper ----------

  private groupReact(chat: ChatId, depth: number) {
    if (depth > MAX_DEPTH) return;
    const scores = groupScores(this.c, this.s, chat, this.d.rng);
    if (scores.length) {
      this.log(
        this.s.groups[chat].name,
        'score',
        scores.map((x) => `${this.char(x.id)?.name} ${x.score.toFixed(2)}`).join(', ') + ` (gräns ${(0.95 + 0.3 * depth).toFixed(2)})`,
      );
    }
    for (const id of pickGroupTurns(scores, depth, this.d.rng)) this.enqueueTurn(id, 'group', chat, depth);
  }

  // ---------- agentturer ----------

  private async runTurn(job: Extract<Job, { kind: 'turn' }>) {
    const ch = this.char(job.who);
    if (!ch) return;
    const a = this.s.agents[ch.id];
    await this.d.sleep(between(this.d.rng, 1500, 4000) * this.f);
    if (!isAlive(ch, this.s.t)) return;
    if (!canAct(ch, this.s)) {
      if (job.situation === 'reply' && !a.pending.includes(job.chat)) a.pending.push(job.chat);
      this.log(ch.name, 'abstain', isAwake(ch.schedule, this.s.t) ? 'slut på dagens kvot' : 'sover');
      return;
    }
    const limit = this.d.callLimit?.() ?? 0;
    if (limit > 0 && this.s.usage.calls >= limit) {
      this.queue.unshift(job);
      this.halt();
      this.d.onNotice?.('budget');
      return;
    }

    // Visa "skriver…" medan agenten formulerar sig.
    const typingChat = job.situation === 'group' ? job.chat : ch.id;
    this.typing[typingChat] = ch.id;
    this.changed();

    let raw: string | null = null;
    try {
      raw = await this.callWithBackoff(ch, job);
    } catch (e) {
      this.typing[typingChat] = undefined;
      const err = e instanceof LlmError ? e : new LlmError('other', String(e));
      if (err.kind === 'auth') {
        this.queue.unshift(job);
        this.halt();
        this.d.onNotice?.('auth', err.message);
        return;
      }
      this.log(ch.name, 'error', `${err.kind}: ${err.message} (räknas som att hen avstår)`);
      return;
    }

    const reply = raw ? parseAgentReply(raw) : null;
    if (!reply || !reply.text) {
      this.typing[typingChat] = undefined;
      this.changed();
      this.log(ch.name, 'abstain', reply ? 'avstod' : 'ogiltigt svar, avstår');
      this.applyMood(ch, reply?.stress ?? 0, reply?.forstar ?? false);
      return;
    }
    const text = cleanText(reply.text);
    const guard = violatedGuard(ch, text);
    if (guard) {
      this.typing[typingChat] = undefined;
      this.changed();
      this.log(ch.name, 'guard', `${guard.log ?? 'stoppad av spärr'}: "${text}"`);
      return;
    }

    // Kanal: bara grupper personen är med i, annars privat till spelaren.
    let chat: ChatId = ch.id;
    const wantsGroup = reply.kanal === 'grupp' || (reply.kanal === 'samma' && job.situation === 'group');
    if (wantsGroup && this.isGroup(job.chat) && this.s.groups[job.chat].members.includes(ch.id)) chat = job.chat;
    if (chat !== typingChat) {
      this.typing[typingChat] = undefined;
      this.typing[chat] = ch.id;
    }

    const parts = splitSms(text);
    let last: Message | null = null;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        this.typing[chat] = ch.id;
        this.changed();
      }
      await this.d.sleep(typingMs(parts[i]) * this.f);
      this.typing[chat] = undefined;
      last = this.push(chat, { from: ch.id, text: parts[i] });
    }
    this.typing[chat] = undefined;

    a.used[dayIndex(this.s.t)] = (a.used[dayIndex(this.s.t)] ?? 0) + 1;
    a.last = text;
    a.pending = a.pending.filter((x) => x !== chat && x !== job.chat);
    this.applyMood(ch, reply.stress, reply.forstar);
    this.log(ch.name, 'turn', `${chat === ch.id ? 'privat' : this.s.groups[chat].name}: ${text.replace(/\n/g, ' / ')}`);
    if (reply.radera && a.stress >= 6 && last) this.scheduleDelete(last, 3500);

    // Tiden går lite medan folk skriver, men aldrig förbi nästa händelse.
    const next = this.nextEventTime();
    this.s.t = next == null ? this.s.t + 1 : Math.min(this.s.t + 1, Math.max(this.s.t, next));
    this.changed();
    if (this.isGroup(chat)) this.groupReact(chat, job.depth + 1);
  }

  private applyMood(ch: CaseCharacter, stress: number, forstar: boolean) {
    const a = this.s.agents[ch.id];
    a.stress = clamp(a.stress + stress, 0, 10);
    if (forstar && !a.revealed) {
      a.revealed = true;
      this.s.flags[`playerRevealed:${ch.id}`] = true;
      this.log(ch.name, 'info', 'förstår nu att numret tillhör en främling');
    }
  }

  private async callWithBackoff(ch: CaseCharacter, job: Extract<Job, { kind: 'turn' }>): Promise<string> {
    const req = {
      system: buildSystem(this.c, ch),
      prompt: buildPrompt(this.c, this.s, ch, job.situation, job.chat),
      model: this.d.model(),
      maxTokens: 1024,
      schema: REPLY_SCHEMA as unknown as Record<string, unknown>,
      meta: { charId: ch.id, situation: job.situation },
    };
    const waits = [2000, 4000, 8000];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.d.provider.complete(req);
        this.s.usage.calls++;
        this.s.usage.inputTokens += res.usage?.input ?? 0;
        this.s.usage.outputTokens += res.usage?.output ?? 0;
        if (attempt > 0) this.d.onNotice?.('rate-ok');
        return res.text;
      } catch (e) {
        if (e instanceof LlmError && e.kind === 'rate' && attempt < waits.length) {
          this.d.onNotice?.('rate', `Väntar ${waits[attempt] / 1000} s …`);
          await this.d.sleep(waits[attempt]);
          continue;
        }
        throw e;
      }
    }
  }

  // ---------- klockan ----------

  /** Anropas varje sekund. Hoppar fram i tiden efter en stunds tystnad. */
  tick(playerTyping = false) {
    if (this.s.paused || this.s.ended || this.halted) return;
    const now = this.now();
    if (this.busy || playerTyping) {
      this.lastActivity = now;
      return;
    }
    if (now - this.lastActivity < TEMPO[this.d.tempo()].silence * 1000) return;
    this.lastActivity = now;
    this.jump(true);
  }

  /** Flyttar klockan 20–45 min (eller till nästa uppvaknande om alla sover), men aldrig förbi nästa händelse. */
  jump(initiative: boolean) {
    const t = this.s.t;
    const next = this.nextEventTime();
    let target = t + Math.round(between(this.d.rng, 20, 45));
    const alive = this.c.characters.filter((ch) => isAlive(ch, t));
    if (alive.length && alive.every((ch) => !isAwake(ch.schedule, t))) {
      target = Math.max(target, Math.min(...alive.map((ch) => nextWake(ch.schedule, t))));
    }
    if (next != null) target = Math.min(target, Math.max(next, t));
    if (next == null && this.s.endReached) return;
    this.advance(target, initiative);
  }

  /** Spola fram: hoppa direkt till nästa schemalagda händelse. */
  skip() {
    if (this.s.ended || this.busy) return false;
    const next = this.nextEventTime();
    if (next == null) return false;
    this.advance(Math.max(next, this.s.t), false);
    return true;
  }

  private advance(target: number, initiative: boolean) {
    this.s.t = Math.max(this.s.t, target);
    this.lastActivity = this.now();
    // Obesvarade sms får svar när personen har vaknat.
    for (const ch of this.c.characters) {
      const a = this.s.agents[ch.id];
      if (a.pending.length && canAct(ch, this.s)) {
        const chats = a.pending;
        a.pending = [];
        for (const chat of chats) this.enqueueTurn(ch.id, this.isGroup(chat) ? 'group' : 'reply', chat, 0);
      }
    }
    if (initiative) {
      const who = pickInitiative(this.c, this.s, this.d.rng);
      if (who) {
        this.log(this.char(who)!.name, 'info', 'får chansen att höra av sig');
        this.enqueueTurn(who, 'initiative', who, 0);
      }
    }
    this.changed();
    this.pump();
  }

  // ---------- slut ----------

  accuse(id: CharId, choice?: string): EndingResult {
    const result: EndingResult = { accused: id, right: id === this.c.endings.culprit, choice };
    this.s.ended = result;
    this.queue = [];
    this.typing = {};
    this.changed();
    return result;
  }
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

/** Skrivtid för ett sms: 900 ms + 45 ms/tecken, 1,3–6,5 s. */
export function typingMs(text: string) {
  return clamp(900 + 45 * text.length, 1300, 6500);
}

// Kopplar ihop motorn, leverantören, lagringen och gränssnittet.
import type { CaseFile, ChatId } from './engine/types';
import { newGame, type GameState, type Message } from './engine/state';
import { Engine, type EngineNotice } from './engine/engine';
import { seeded } from './engine/rng';
import { validateCase } from './engine/validate';
import { AnthropicProvider } from './llm/anthropic';
import { MockProvider } from './llm/mock';
import type { LlmProvider } from './llm/provider';
import { loadKey, loadSettings, saveSettings, type Settings } from './storage/settings';
import { autosaver, loadGame } from './storage/db';

export const BASE = import.meta.env.BASE_URL;

/** ?speed=N snabbar upp alla väntetider (för automatiska tester). */
const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);

export async function fetchCases(): Promise<{ cases: CaseFile[]; errors: string[] }> {
  const errors: string[] = [];
  const cases: CaseFile[] = [];
  const ids = (await (await fetch(`${BASE}cases/index.json`)).json()) as string[];
  for (const id of ids) {
    try {
      const c = (await (await fetch(`${BASE}cases/${id}/case.json`)).json()) as CaseFile;
      const errs = validateCase(c);
      if (errs.length) errors.push(`${id}: ${errs.join('; ')}`);
      else cases.push(c);
    } catch (e) {
      errors.push(`${id}: ${String(e)}`);
    }
  }
  return { cases, errors };
}

export type Listener = () => void;

export class Game {
  engine: Engine;
  settings: Settings;
  demo: boolean;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | undefined;
  playerTypingUntil = 0;
  /** Chatten som spelaren har öppen (olästa räknas inte upp där). */
  openChat: ChatId | null = null;
  onNotice: (kind: EngineNotice, text?: string) => void = () => {};
  onIncoming: (chat: ChatId, msg: Message) => void = () => {};
  private save: () => void;

  constructor(
    readonly c: CaseFile,
    readonly state: GameState,
    provider: LlmProvider,
  ) {
    this.settings = loadSettings();
    this.demo = provider.id === 'mock';
    this.save = autosaver(
      () => this.state,
      () => this.onNotice('rate', 'Kunde inte spara spelet. Spelet fortsätter, men utan sparning.'),
    );
    this.engine = new Engine(c, state, {
      provider,
      model: () => this.settings.model,
      rng: Math.random,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms / SPEED)),
      tempo: () => this.settings.tempo,
      callLimit: () => (this.demo ? 0 : this.settings.callLimit),
      onChange: () => this.changed(),
      onIncoming: (chat, msg) => {
        if (chat === this.openChat && document.visibilityState === 'visible') this.state.unread[chat] = 0;
        this.onIncoming(chat, msg);
      },
      onNotice: (k, t) => this.onNotice(k, t),
    });
  }

  static async start(c: CaseFile, opts: { fresh: boolean; demo: boolean; state?: GameState }): Promise<Game> {
    let state = opts.state ?? (opts.fresh ? null : await loadGame(c.id));
    if (!state || state.caseId !== c.id) state = newGame(c);
    const key = loadKey();
    const provider: LlmProvider = opts.demo || !key ? new MockProvider(c, seeded(Date.now() % 100000)) : new AnthropicProvider(key);
    const g = new Game(c, state, provider);
    g.changed();
    return g;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    this.save();
    for (const fn of this.listeners) fn();
  }

  run() {
    this.stop();
    this.timer = setInterval(() => {
      // Klockan hoppar bara när appen syns och spelaren inte skriver.
      if (document.visibilityState !== 'visible') {
        this.engine.lastActivity = Date.now();
        return;
      }
      this.engine.tick(Date.now() < this.playerTypingUntil);
    }, 1000);
    this.engine.pump();
  }

  stop() {
    clearInterval(this.timer);
  }

  setProvider(p: LlmProvider) {
    this.demo = p.id === 'mock';
    this.engine.setProvider(p);
    this.engine.resume();
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    this.changed();
  }

  setPaused(p: boolean) {
    this.state.paused = p;
    this.engine.lastActivity = Date.now();
    this.changed();
  }
}

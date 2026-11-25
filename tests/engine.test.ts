import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseFile } from '../src/engine/types';
import { newGame } from '../src/engine/state';
import { Engine, type EngineDeps } from '../src/engine/engine';
import { seeded } from '../src/engine/rng';
import { isAwake, nextWake, parseAt, clock, weekday } from '../src/engine/time';
import { MockProvider } from '../src/llm/mock';
import { parseAgentReply, splitSms, violatedGuard, cleanText } from '../src/engine/guards';
import { groupScores, pickGroupTurns, mentions } from '../src/engine/turns';
import { validateCase } from '../src/engine/validate';
import { buildPrompt } from '../src/engine/prompt';
import { LlmError, type LlmProvider } from '../src/llm/provider';

const casesDir = 'public/cases';
const load = (id: string) => JSON.parse(readFileSync(join(casesDir, id, 'case.json'), 'utf8')) as CaseFile;
const lotto = load('lottoganget');

function engine(c = lotto, opts: Partial<EngineDeps> = {}) {
  const s = newGame(c);
  let now = 0;
  const e = new Engine(c, s, {
    provider: new MockProvider(c, seeded(7)),
    model: () => 'mock',
    rng: seeded(42),
    sleep: async () => {},
    tempo: () => 'snabbt',
    now: () => now,
    ...opts,
  });
  return { e, s, advance: (ms: number) => (now += ms) };
}

describe('tid', () => {
  it('tolkar "D HH:MM"', () => {
    expect(parseAt('0 00:00')).toBe(0);
    expect(parseAt('1 23:26')).toBe(1440 + 23 * 60 + 26);
    expect(clock(parseAt('4 20:20'))).toBe('20:20');
    expect(weekday('lördag', parseAt('2 07:31'))).toBe('Måndag');
  });
  it('hanterar sovtid över midnatt', () => {
    const s = { wake: '07:00', sleep: '01:00' };
    expect(isAwake(s, parseAt('0 00:30'))).toBe(true);
    expect(isAwake(s, parseAt('0 03:00'))).toBe(false);
    expect(isAwake(s, parseAt('0 23:00'))).toBe(true);
    expect(nextWake(s, parseAt('0 03:00'))).toBe(parseAt('0 07:00'));
    const n = { wake: '06:30', sleep: '23:30' };
    expect(isAwake(n, parseAt('0 23:45'))).toBe(false);
    expect(nextWake(n, parseAt('0 23:45'))).toBe(parseAt('1 06:30'));
  });
});

describe('spärrar', () => {
  const cecilia = lotto.characters.find((c) => c.id === 'cecilia')!;
  it('stoppar erkännanden', () => {
    expect(violatedGuard(cecilia, 'Det var jag som knuffade honom.')).not.toBeNull();
    expect(violatedGuard(cecilia, 'Jag var hemma hela kvällen.')).toBeNull();
  });
  it('delar upp i högst fyra sms om högst 400 tecken', () => {
    const parts = splitSms(['a', 'b', 'c', 'd', 'e'].join('\n'));
    expect(parts).toEqual(['a', 'b', 'c', 'd']);
    expect(splitSms('x '.repeat(400))[0].length).toBeLessThanOrEqual(401);
  });
  it('tolkar svaret med reserv', () => {
    expect(parseAgentReply('blabla {"text":"hej","kanal":"privat","stress":5,"radera":false,"forstar":true} slut')).toMatchObject({
      text: 'hej',
      stress: 2,
      forstar: true,
    });
    expect(parseAgentReply('inget json')).toBeNull();
    expect(parseAgentReply('{"text":null}')?.text).toBeNull();
  });
  it('tar bort berättartext', () => {
    expect(cleanText('*suckar* ok då')).toBe('ok då');
  });
});

describe('turordning', () => {
  it('känner igen alias', () => {
    const jenny = lotto.characters.find((c) => c.id === 'jenny')!;
    expect(mentions(jenny, 'vad tycker jen?')).toBe(true);
    expect(mentions(jenny, 'jenga')).toBe(false);
  });
  it('ger turen till den som nämns och högst två på djup 0', () => {
    const { s } = engine();
    s.t = parseAt('4 16:05');
    s.groups.minne = { name: 'M', members: ['cecilia', 'rogge', 'goran', 'matte', 'jenny'], createdBy: 'jenny' };
    s.chats.minne = [{ id: 1, t: s.t, from: 'player', text: 'matte, vad såg du?' }];
    const scores = groupScores(lotto, s, 'minne', seeded(1));
    expect(scores[0].id).toBe('matte');
    const picks = pickGroupTurns(scores, 0, seeded(1));
    expect(picks.length).toBeGreaterThanOrEqual(1);
    expect(picks.length).toBeLessThanOrEqual(2);
    expect(pickGroupTurns(scores, 3, seeded(1))).toEqual([]);
  });
});

describe('prompten', () => {
  it('visar bara det personen vet just nu', () => {
    const { s } = engine();
    const cecilia = lotto.characters.find((c) => c.id === 'cecilia')!;
    s.t = parseAt('1 12:00');
    expect(buildPrompt(lotto, s, cecilia, 'reply', 'cecilia')).not.toContain('Kenta är död');
    s.t = parseAt('2 12:00');
    expect(buildPrompt(lotto, s, cecilia, 'reply', 'cecilia')).toContain('Kenta är död');
  });
});

describe('motorn', () => {
  it('svarar på sms från spelaren', async () => {
    const { e, s } = engine();
    e.playerSend('matte', 'hej, vem är du?');
    await e.idle();
    expect(s.chats.matte.some((m) => m.from === 'matte')).toBe(true);
    expect(s.agents.matte.used[0]).toBe(1);
  });

  it('sparar svaret till morgonen när personen sover', async () => {
    const { e, s } = engine();
    s.t = parseAt('0 23:00'); // Göran sover 22–05:30
    e.playerSend('goran', 'hallå?');
    await e.idle();
    expect(s.chats.goran.filter((m) => m.from === 'goran')).toHaveLength(0);
    expect(s.agents.goran.pending).toEqual(['goran']);
    s.t = parseAt('1 06:00');
    e.jump(false);
    await e.idle();
    expect(s.chats.goran.some((m) => m.from === 'goran')).toBe(true);
  });

  it('ger ✓ i stället för ✓✓ till en död persons nummer', async () => {
    const { e, s } = engine();
    s.t = parseAt('2 10:00');
    e.playerSend('kenta', 'hallå?');
    await e.idle();
    expect(s.chats.kenta[0].status).toBe('sent');
    expect(s.chats.kenta).toHaveLength(1);
  });

  it('tjänster svarar automatiskt', async () => {
    const { e, s } = engine();
    e.playerSend('spel', 'hur hämtar jag ut vinsten?');
    await e.idle();
    expect(s.chats.spel.at(-1)!.text).toMatch(/kan inte ta emot svar/);
  });

  it('vidarebefordrar med ursprungsnumret', async () => {
    const { e, s } = engine();
    e.playerSend('matte', 'test');
    await e.idle();
    const m = s.chats.matte.find((x) => x.from === 'matte')!;
    e.forward(m, 'matte', 'cecilia');
    await e.idle();
    expect(s.chats.cecilia[0].fwdFrom).toBe('070-388 19 04');
  });

  it('spärren stoppar ett erkännande', async () => {
    const confess: LlmProvider = {
      id: 'x',
      validateKey: async () => true,
      complete: async () => ({ text: '{"text":"det var jag som knuffade honom","kanal":"privat","stress":0,"radera":false,"forstar":false}' }),
    };
    const { e, s } = engine(lotto, { provider: confess });
    s.t = parseAt('2 10:00');
    e.playerSend('cecilia', 'var det du?');
    await e.idle();
    expect(s.chats.cecilia.some((m) => /knuffade/.test(m.text ?? ''))).toBe(false);
    expect(s.log.some((l) => l.kind === 'guard')).toBe(true);
  });

  it('nätverksfel räknas som att agenten avstår', async () => {
    const broken: LlmProvider = {
      id: 'x',
      validateKey: async () => true,
      complete: async () => {
        throw new LlmError('network', 'nere');
      },
    };
    const { e, s } = engine(lotto, { provider: broken });
    e.playerSend('matte', 'hej');
    await e.idle();
    expect(s.log.some((l) => l.kind === 'error')).toBe(true);
  });

  it('ogiltig nyckel stoppar spelet och sparar turen', async () => {
    let notice = '';
    const bad: LlmProvider = {
      id: 'x',
      validateKey: async () => false,
      complete: async () => {
        throw new LlmError('auth', 'fel nyckel');
      },
    };
    const { e } = engine(lotto, { provider: bad, onNotice: (k) => (notice = k) });
    e.playerSend('matte', 'hej');
    await e.idle();
    expect(notice).toBe('auth');
  });

  it('hoppar fram efter tystnad men aldrig förbi nästa händelse', async () => {
    const { e, s, advance } = engine();
    const next = e.nextEventTime()!;
    advance(31_000);
    e.tick();
    await e.idle();
    expect(s.t).toBeLessThanOrEqual(next);
    expect(s.t).toBeGreaterThan(parseAt(lotto.start));
  });

  it('kan spelas igenom med Spola fram från start till slut', async () => {
    const { e, s } = engine();
    let guard = 0;
    while (!s.endReached && guard++ < 500) {
      // Spelaren skriver ibland till någon, som i ett riktigt spel.
      if (guard % 7 === 0) e.playerSend('matte', 'vad hände egentligen?');
      await e.idle();
      e.skip();
      await e.idle();
    }
    expect(s.endReached).toBe(true);
    expect(s.groups.minne.members).not.toContain('kenta');
    expect(s.chats.cecilia.some((m) => m.deleted)).toBe(true);
    const r = e.accuse('cecilia', 'stuga');
    expect(r.right).toBe(true);
    expect(s.ended?.choice).toBe('stuga');
  });
});

describe('fallen', () => {
  const ids = readdirSync(casesDir).filter((d) => existsSync(join(casesDir, d, 'case.json')));
  it('finns i index.json', () => {
    const index = JSON.parse(readFileSync(join(casesDir, 'index.json'), 'utf8')) as string[];
    expect(index.sort()).toEqual(ids.sort());
  });
  for (const id of ids) {
    it(`${id} är giltigt`, () => {
      const c = load(id);
      expect(validateCase(c)).toEqual([]);
      for (const ev of c.events) if (ev.image) expect(existsSync(join(casesDir, id, ev.image))).toBe(true);
    });
  }
  it('validering hittar fel', () => {
    const broken = { ...lotto, endings: { ...lotto.endings, culprit: 'nobody' }, events: [{ at: '0 20:00', from: 'okänd', text: 'x' }] };
    const errs = validateCase(broken as CaseFile);
    expect(errs.join('\n')).toMatch(/culprit/);
    expect(errs.join('\n')).toMatch(/okänd avsändare/);
    expect(errs.join('\n')).toMatch(/end/);
  });
});

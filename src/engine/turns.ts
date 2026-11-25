// Turordning utan regissör: poäng, spärrar och slump.
import type { CaseFile, CaseCharacter, ChatId, CharId } from './types';
import type { GameState, Message } from './state';
import { isAwake, parseAt, dayIndex } from './time';
import { weightedPick, type Rng } from './rng';

export const MAX_DEPTH = 2;

export function isAlive(ch: CaseCharacter, t: number): boolean {
  return ch.aliveUntil == null || t < parseAt(ch.aliveUntil);
}

export function hasBudget(ch: CaseCharacter, s: GameState): boolean {
  return (s.agents[ch.id].used[dayIndex(s.t)] ?? 0) < ch.dailyBudget;
}

export function canAct(ch: CaseCharacter, s: GameState): boolean {
  return isAlive(ch, s.t) && isAwake(ch.schedule, s.t) && hasBudget(ch, s);
}

export function mentions(ch: CaseCharacter, text: string): boolean {
  const lower = text.toLowerCase();
  return [ch.name, ...ch.aliases].some((a) => {
    const w = a.toLowerCase();
    return new RegExp(`(^|[^a-zåäö])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zåäö]|$)`, 'u').test(lower);
  });
}

const digits = (s: string) => s.replace(/\D/g, '');

export interface Score {
  id: CharId;
  score: number;
}

/** Poäng för varje medlem som kan svara i gruppen efter ett nytt meddelande. */
export function groupScores(c: CaseFile, s: GameState, groupId: ChatId, rng: Rng): Score[] {
  const group = s.groups[groupId];
  const msgs = s.chats[groupId] ?? [];
  const last = msgs[msgs.length - 1] as Message | undefined;
  if (!group || !last) return [];
  const text = last.text ?? (last.news ? `${last.news.head} ${last.news.sub ?? ''}` : '');
  const recent = msgs.slice(-3).map((m) => m.from);
  const playerInvolved = last.from === 'player' || digits(text).includes(digits(c.player.number));
  const out: Score[] = [];
  for (const id of group.members) {
    const ch = c.characters.find((x) => x.id === id);
    if (!ch || id === last.from || !canAct(ch, s)) continue;
    let score = ch.talk + s.agents[id].stress * 0.05 + rng() * 0.55;
    if (mentions(ch, text)) score += 1.1;
    if (playerInvolved) score += 0.3;
    if (recent.includes(id)) score -= 0.45;
    out.push({ id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Vem som får turen i gruppen (0–2 personer). */
export function pickGroupTurns(scores: Score[], depth: number, rng: Rng): CharId[] {
  if (depth > MAX_DEPTH) return [];
  const limit = 0.95 + 0.3 * depth;
  const over = scores.filter((x) => x.score > limit);
  if (!over.length) return [];
  const picks = [over[0].id];
  if (depth === 0 && over[1] && rng() < 0.4) picks.push(over[1].id);
  return picks;
}

/** Initiativ vid tystnad: 35 % chans, viktat på talk och stress. */
export function pickInitiative(c: CaseFile, s: GameState, rng: Rng): CharId | undefined {
  if (rng() >= 0.35) return undefined;
  const candidates = c.characters.filter((ch) => {
    const chat = s.chats[ch.id];
    return chat && chat.length > 0 && canAct(ch, s) && !s.agents[ch.id].pending.length;
  });
  return weightedPick(rng, candidates, (ch) => ch.talk * 0.5 + s.agents[ch.id].stress / 10)?.id;
}

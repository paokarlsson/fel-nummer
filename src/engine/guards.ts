import type { CaseCharacter } from './types';

export const MAX_SMS_PER_TURN = 4;
export const MAX_SMS_LENGTH = 400;

/** Returnerar spärren som slog till, eller null. */
export function violatedGuard(ch: CaseCharacter, text: string) {
  for (const g of ch.guards ?? []) {
    if (g.type === 'neverSay' && new RegExp(g.pattern, 'iu').test(text)) return g;
  }
  return null;
}

/** Delar upp svaret i högst fyra sms om högst 400 tecken. */
export function splitSms(text: string): string[] {
  const parts = text
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((s) => s.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length >= MAX_SMS_PER_TURN) break;
    out.push(p.length > MAX_SMS_LENGTH ? cut(p) : p);
  }
  return out;
}

function cut(s: string): string {
  const slice = s.slice(0, MAX_SMS_LENGTH);
  const sp = slice.lastIndexOf(' ');
  return (sp > MAX_SMS_LENGTH * 0.6 ? slice.slice(0, sp) : slice).trimEnd() + '…';
}

/** Tar bort berättartext som *suckar* och citattecken runt hela svaret. */
export function cleanText(text: string): string {
  return text
    .replace(/\*[^*\n]{1,60}\*/g, '')
    .replace(/^["“”]+|["“”]+$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Plockar ut JSON-blocket ur ett svar. Ogiltigt svar ger null (= avstår). */
export function parseAgentReply(raw: string): AgentReply | null {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const text = typeof o.text === 'string' && o.text.trim() ? o.text : null;
    const stress = typeof o.stress === 'number' && Number.isFinite(o.stress) ? Math.max(-1, Math.min(2, Math.round(o.stress))) : 0;
    return {
      text,
      kanal: o.kanal === 'privat' ? 'privat' : o.kanal === 'grupp' ? 'grupp' : 'samma',
      stress,
      radera: o.radera === true,
      forstar: o.forstar === true,
    };
  } catch {
    return null;
  }
}

export interface AgentReply {
  text: string | null;
  kanal: 'privat' | 'grupp' | 'samma';
  stress: number;
  radera: boolean;
  forstar: boolean;
}

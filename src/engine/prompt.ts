// Bygger agentprompten på nytt varje tur. Agenterna har inget minne utöver sms:en.
import type { CaseFile, CaseCharacter, ChatId } from './types';
import type { GameState, Message } from './state';
import { clock, parseAt, shortWeekday, weekday } from './time';

export type Situation = 'reply' | 'group' | 'initiative';

export const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: ['string', 'null'] },
    kanal: { type: 'string', enum: ['privat', 'grupp'] },
    stress: { type: 'integer' },
    radera: { type: 'boolean' },
    forstar: { type: 'boolean' },
  },
  required: ['text', 'kanal', 'stress', 'radera', 'forstar'],
  additionalProperties: false,
} as const;

const digits = (s: string) => s.replace(/\D/g, '');

/** Hur en avsändare ser ut från en karaktärs perspektiv. */
function labelFor(c: CaseFile, viewer: CaseCharacter, from: string): string {
  if (from === viewer.id) return 'Du';
  if (from === 'player') return c.player.number;
  const ch = c.characters.find((x) => x.id === from);
  if (ch) return ch.name;
  const sv = c.services.find((x) => x.id === from);
  return sv ? sv.name : from;
}

/** Översätter ett nummer till ett namn om karaktären känner personen. */
function numberWithName(c: CaseFile, viewer: CaseCharacter, raw: string): string {
  const d = digits(raw);
  if (!d) return raw;
  if (d === digits(viewer.number)) return `${raw} (ditt eget nummer)`;
  const ch = c.characters.find((x) => digits(x.number) === d);
  if (ch) return `${raw} (${ch.name})`;
  return raw;
}

function describe(c: CaseFile, viewer: CaseCharacter, m: Message): string {
  let body = '';
  if (m.fwdFrom) body += `[vidarebefordrat från ${numberWithName(c, viewer, m.fwdFrom)}] `;
  if (m.news) body += `[länk: ${m.news.paper} – "${m.news.head}"${m.news.sub ? ` – ${m.news.sub}` : ''}] `;
  if (m.image) body += `[bild: ${m.alt ?? 'en bild'}] `;
  if (m.text) body += m.text;
  if (m.deleted) body += m.from === viewer.id ? ' (du raderade det här sms:et)' : ' (raderat)';
  return body.trim();
}

function transcript(c: CaseFile, s: GameState, viewer: CaseCharacter, chatId: ChatId): string {
  const msgs = (s.chats[chatId] ?? []).filter((m) => m.from !== 'system').slice(-30);
  if (!msgs.length) return '(inga sms ännu)';
  return msgs
    .map((m) => `[${shortWeekday(c.startDay, m.t)} ${clock(m.t)}] ${labelFor(c, viewer, m.from)}: ${describe(c, viewer, m)}`)
    .join('\n');
}

export function buildSystem(c: CaseFile, ch: CaseCharacter): string {
  const others = c.characters
    .filter((x) => x.id !== ch.id)
    .map((x) => `- ${x.fullName} ("${x.name}"): ${x.number}`)
    .join('\n');
  return [
    `Du är ${ch.fullName}. Du är en verklig människa som skriver sms i din egen telefon. Du vet inte att du är med i ett spel, och du är inte en AI.`,
    ``,
    `VÄRLDEN\n${c.world}`,
    ``,
    `OM DIG\n${ch.bio}`,
    ``,
    `SÅ SKRIVER DU\n${ch.style}`,
    ``,
    `DIN HEMLIGHET (avslöja den aldrig frivilligt)\n${ch.secret}`,
    ch.cover ? `\nDET DU SÄGER UTÅT\n${ch.cover}` : '',
    ``,
    `DIN HISTORIA\n${ch.story}`,
    ``,
    `DINA MÅL\n${ch.goals}`,
    ch.promptExtra ? `\nVIKTIGT\n${ch.promptExtra}` : '',
    ``,
    `NUMMER DU HAR I TELEFONEN\n${others}`,
    ``,
    `REGLER`,
    `- Skriv som i sms: korta, vardagliga meddelanden på svenska. 1–3 sms per tur, ett sms per rad.`,
    `- Ingen berättartext, inga handlingar inom asterisker, inga citattecken runt svaret.`,
    `- Du ser bara dina egna sms. Det andra skriver till varandra vet du bara om någon vidarebefordrar det till dig.`,
    `- Du får avstå från att svara (text: null). Det är ofta det mest naturliga.`,
    `- Motsäg inte det du själv har skrivit tidigare. Du får ljuga, men håll ihop dina lögner.`,
    `- Avslöja inte din hemlighet frivilligt. Hitta inte på nya fakta om fallet som inte följer av din historia.`,
    ``,
    `SVARSFORMAT: endast JSON med fälten`,
    `text (dina sms, en rad per sms, eller null), kanal ("privat" = till ${c.player.number} privat, "grupp" = i gruppen),`,
    `stress (heltal -1 till 2: hur mycket mer stressad du blev), radera (true om du ångrar ditt sista sms och vill radera det),`,
    `forstar (true om du nu förstår att ${c.player.number} inte längre är ${c.player.previousOwner}s nummer utan tillhör en främling).`,
  ]
    .filter((x) => x !== '')
    .join('\n');
}

export function buildPrompt(
  c: CaseFile,
  s: GameState,
  ch: CaseCharacter,
  situation: Situation,
  chatId: ChatId,
): string {
  const a = s.agents[ch.id];
  const known = ch.knows.filter((k) => parseAt(k.at) <= s.t).map((k) => `- ${k.text}`);
  const groups = Object.entries(s.groups).filter(([, g]) => g.members.includes(ch.id));
  const parts: string[] = [
    `Det är ${weekday(c.startDay, s.t).toLowerCase()} kl. ${clock(s.t)}.`,
    ``,
    `DET DU VET JUST NU\n${known.join('\n') || '- (inget särskilt)'}`,
    ``,
    `OM ${c.player.number}`,
    `I din telefon är numret sparat som ${c.player.previousOwner}. ` +
      (a.revealed
        ? `Du har förstått att numret nu tillhör en främling. Du vet bara det om främlingen som framgår av era sms.`
        : (ch.aboutPlayer ?? `Vem som har numret nu vet du bara utifrån era sms.`)),
    ``,
    `DIN STRESS: ${a.stress} av 10. ` +
      (a.stress >= 6
        ? `Du är mycket stressad: du skriver hastigare, slarvar, kan säga för mycket och ångra dig.`
        : a.stress >= 4
          ? `Du är spänd och mer på din vakt än vanligt.`
          : `Du är någorlunda lugn.`),
    ``,
    `ERA PRIVATA SMS (du och ${c.player.number})\n${transcript(c, s, ch, ch.id)}`,
  ];
  for (const [gid, g] of groups) {
    parts.push('', `GRUPPEN "${g.name}"\n${transcript(c, s, ch, gid)}`);
  }
  parts.push('', 'SITUATION');
  if (situation === 'reply') parts.push(`Du har fått sms från ${c.player.number}. Svara privat om du vill.`);
  if (situation === 'group') parts.push(`Det har kommit nya sms i gruppen "${s.groups[chatId]?.name}". Skriv i gruppen, skriv privat till ${c.player.number}, eller avstå.`);
  if (situation === 'initiative')
    parts.push(`Det har varit tyst ett tag. Hör av dig privat till ${c.player.number} bara om du har ett eget skäl just nu. Annars avstår du.`);
  parts.push('', 'Svara med JSON.');
  return parts.join('\n');
}

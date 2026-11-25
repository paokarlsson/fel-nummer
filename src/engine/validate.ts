// Kontrollerar ett fall innan det används. Returnerar en lista med fel (tom = ok).
import type { CaseFile } from './types';
import { parseAt, parseClock } from './time';

export function validateCase(c: CaseFile): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const req = (cond: unknown, m: string) => (cond ? true : (err(m), false));

  if (!req(c && typeof c === 'object', 'Fallet är inte ett objekt')) return errors;
  for (const k of ['id', 'title', 'language', 'startDay', 'start', 'end', 'world'] as const) {
    req(typeof c[k] === 'string' && c[k], `Saknar fältet "${k}"`);
  }
  req(typeof c.version === 'number', 'Saknar "version" (nummer)');
  req(c.player && c.player.number && c.player.premise && c.player.previousOwner, 'Ofullständigt "player"');
  const time = (at: string, where: string) => {
    try {
      return parseAt(at);
    } catch {
      err(`Ogiltig tid "${at}" i ${where}`);
      return NaN;
    }
  };
  const start = time(c.start, 'start');
  time(c.end, 'end');

  const ids = new Set<string>();
  const unique = (id: string, what: string) => {
    if (ids.has(id)) err(`Dubbelt id "${id}" (${what})`);
    ids.add(id);
  };
  const numbers = new Set<string>();
  const num = (n: string, who: string) => {
    const d = n.replace(/\D/g, '');
    if (numbers.has(d)) err(`Numret ${n} används två gånger (${who})`);
    numbers.add(d);
  };
  num(c.player?.number ?? '', 'spelaren');

  if (!req(Array.isArray(c.characters) && c.characters.length, 'Inga karaktärer')) return errors;
  for (const ch of c.characters) {
    unique(ch.id, 'karaktär');
    num(ch.number, ch.id);
    for (const k of ['name', 'fullName', 'bio', 'style', 'secret', 'story', 'goals', 'color'] as const) {
      req(typeof ch[k] === 'string' && ch[k], `${ch.id}: saknar "${k}"`);
    }
    req(Array.isArray(ch.aliases), `${ch.id}: "aliases" måste vara en lista`);
    req(Array.isArray(ch.knows), `${ch.id}: "knows" måste vara en lista`);
    for (const k of ch.knows ?? []) time(k.at, `${ch.id}.knows`);
    try {
      parseClock(ch.schedule.wake);
      parseClock(ch.schedule.sleep);
    } catch {
      err(`${ch.id}: ogiltigt "schedule"`);
    }
    req(typeof ch.talk === 'number' && ch.talk >= 0 && ch.talk <= 1, `${ch.id}: "talk" ska vara 0–1`);
    req(Number.isInteger(ch.dailyBudget) && ch.dailyBudget > 0, `${ch.id}: "dailyBudget" ska vara ett positivt heltal`);
    req(typeof ch.stress === 'number' && ch.stress >= 0 && ch.stress <= 10, `${ch.id}: "stress" ska vara 0–10`);
    if (ch.aliveUntil != null) time(ch.aliveUntil, `${ch.id}.aliveUntil`);
    for (const g of ch.guards ?? []) {
      try {
        new RegExp(g.pattern, 'iu');
      } catch {
        err(`${ch.id}: ogiltigt mönster i spärr: ${g.pattern}`);
      }
    }
  }
  for (const sv of c.services ?? []) {
    unique(sv.id, 'tjänst');
    num(sv.number, sv.id);
    req(sv.name, `${sv.id}: saknar "name"`);
  }

  const senders = new Set([...c.characters.map((x) => x.id), ...(c.services ?? []).map((x) => x.id)]);
  const groups = new Set<string>();
  let hasEnd = false;
  (c.events ?? []).forEach((ev, i) => {
    const where = `händelse ${i} (${ev.at})`;
    const t = time(ev.at, where);
    if (t < start) err(`${where}: ligger före fallets start`);
    if (ev.from && !senders.has(ev.from)) err(`${where}: okänd avsändare "${ev.from}"`);
    if (ev.createGroup) {
      if (ids.has(ev.createGroup.id) || groups.has(ev.createGroup.id)) err(`${where}: gruppens id "${ev.createGroup.id}" är upptaget`);
      groups.add(ev.createGroup.id);
      if (!senders.has(ev.createGroup.createdBy)) err(`${where}: okänd skapare "${ev.createGroup.createdBy}"`);
    }
    if (ev.to && !groups.has(ev.to)) err(`${where}: gruppen "${ev.to}" har inte skapats ännu`);
    if ((ev.text || ev.news || ev.image) && !ev.from) err(`${where}: innehåll utan avsändare`);
    if (ev.stress) for (const k of Object.keys(ev.stress)) if (k !== 'all' && !senders.has(k)) err(`${where}: okänd i "stress": ${k}`);
    if (ev.end) hasEnd = true;
  });
  req(hasEnd, 'Ingen händelse med "end": true');

  const e = c.endings;
  if (req(e, 'Saknar "endings"')) {
    req(Array.isArray(e.accusable) && e.accusable.every((x) => senders.has(x)), 'endings.accusable innehåller okända id:n');
    req(e.accusable?.includes(e.culprit), 'endings.culprit måste finnas bland accusable');
    req(e.right && e.wrong, 'endings saknar "right" eller "wrong"');
    for (const ch of e.choices ?? []) time(ch.availableFrom, `endings.choices.${ch.id}`);
  }
  req(c.truth && Array.isArray(c.truth.timeline), 'Saknar "truth.timeline"');
  return errors;
}

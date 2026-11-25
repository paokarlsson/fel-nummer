// Speltid: minuter från dag 0 kl. 00:00.

const DAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];

export function parseAt(at: string): number {
  const m = /^(\d+) (\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) throw new Error(`Ogiltig tid: "${at}" (väntade "D HH:MM")`);
  return Number(m[1]) * 1440 + Number(m[2]) * 60 + Number(m[3]);
}

export function parseClock(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Ogiltigt klockslag: "${hhmm}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export const dayIndex = (t: number) => Math.floor(t / 1440);
export const minuteOfDay = (t: number) => ((t % 1440) + 1440) % 1440;

export function clock(t: number): string {
  const m = minuteOfDay(Math.floor(t));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function weekday(startDay: string, t: number): string {
  const base = DAYS.indexOf(startDay.toLowerCase());
  const name = DAYS[(Math.max(0, base) + dayIndex(t)) % 7];
  return name[0].toUpperCase() + name.slice(1);
}

export const shortWeekday = (startDay: string, t: number) => weekday(startDay, t).slice(0, 3);

/** Vaken enligt schema. Sovtid över midnatt stöds. */
export function isAwake(schedule: { wake: string; sleep: string }, t: number): boolean {
  const wake = parseClock(schedule.wake);
  const sleep = parseClock(schedule.sleep);
  const m = minuteOfDay(t);
  if (wake === sleep) return true;
  return wake < sleep ? m >= wake && m < sleep : m >= wake || m < sleep;
}

/** Nästa tidpunkt (>= t) då personen vaknar. */
export function nextWake(schedule: { wake: string; sleep: string }, t: number): number {
  if (isAwake(schedule, t)) return t;
  const wake = parseClock(schedule.wake);
  const m = minuteOfDay(t);
  const dayStart = t - m;
  return m < wake ? dayStart + wake : dayStart + 1440 + wake;
}

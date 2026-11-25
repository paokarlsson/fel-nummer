// Sparade spel i IndexedDB (store "saves", ett objekt per fall).
import type { GameState } from '../engine/state';

const DB = 'fel-nummer';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'caseId' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function loadGame(caseId: string): Promise<GameState | null> {
  try {
    return ((await tx('readonly', (s) => s.get(caseId))) as GameState | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveGame(state: GameState): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(structuredClone(state)));
    return true;
  } catch {
    return false;
  }
}

export async function deleteGame(caseId: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(caseId));
  } catch {
    /* ignoreras */
  }
}

export async function dbAvailable(): Promise<boolean> {
  try {
    (await open()).close();
    return true;
  } catch {
    return false;
  }
}

export async function wipeAll(): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    for (const k of await caches.keys()) await caches.delete(k);
  } catch {
    /* ingen cache */
  }
}

/** Debouncad sparning (500 ms) efter varje ändring. */
export function autosaver(get: () => GameState | null, onFail: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const s = get();
      if (!s) return;
      const ok = await saveGame(s);
      if (!ok && !warned) {
        warned = true;
        onFail();
      }
    }, 500);
  };
}

/** Exportfil: sparat spel utan API-nyckel. */
export function exportJson(state: GameState): string {
  return JSON.stringify({ format: 'fel-nummer-save', version: 1, state }, null, 1);
}

export function importJson(text: string): GameState {
  const o = JSON.parse(text) as { format?: string; state?: GameState };
  if (o.format !== 'fel-nummer-save' || !o.state?.caseId || !o.state.chats) throw new Error('Filen är inte en sparfil från Fel nummer.');
  return o.state;
}

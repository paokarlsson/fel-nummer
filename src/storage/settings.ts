import type { Tempo } from '../engine/engine';
import { DEFAULT_MODEL } from '../llm/anthropic';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  tempo: Tempo;
  model: string;
  theme: Theme;
  notifications: boolean;
  /** Max antal API-anrop per spel, 0 = obegränsat. */
  callLimit: number;
}

const DEFAULTS: Settings = { tempo: 'lugnt', model: DEFAULT_MODEL, theme: 'system', notifications: false, callLimit: 400 };
const KEY = 'fn:settings';
const API_KEY = 'fn:key';

export let storageOk = true;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    storageOk = false;
    return fallback;
  }
}

export function loadSettings(): Settings {
  return safe(() => ({ ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }), { ...DEFAULTS });
}

export function saveSettings(s: Settings) {
  safe(() => localStorage.setItem(KEY, JSON.stringify(s)), undefined);
}

let memoryKey: string | null = null;

export function loadKey(): string | null {
  return memoryKey ?? safe(() => localStorage.getItem(API_KEY) ?? sessionStorage.getItem(API_KEY), null);
}

/** Sparar nyckeln: på enheten (localStorage) eller bara för sessionen. */
export function saveKey(key: string, remember: boolean) {
  memoryKey = key;
  safe(() => {
    localStorage.removeItem(API_KEY);
    sessionStorage.removeItem(API_KEY);
    (remember ? localStorage : sessionStorage).setItem(API_KEY, key);
  }, undefined);
}

export function forgetKey() {
  memoryKey = null;
  safe(() => {
    localStorage.removeItem(API_KEY);
    sessionStorage.removeItem(API_KEY);
  }, undefined);
}

export function keyRemembered(): boolean {
  return safe(() => localStorage.getItem(API_KEY) != null, false);
}

export function clearLocal() {
  memoryKey = null;
  safe(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('fn:')) localStorage.removeItem(k);
    sessionStorage.clear();
  }, undefined);
}

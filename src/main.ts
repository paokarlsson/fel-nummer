import './fonts';
import './styles.css';
import type { CaseFile } from './engine/types';
import type { GameState } from './engine/state';
import { Game, fetchCases } from './game';
import { AnthropicProvider } from './llm/anthropic';
import { loadGame, dbAvailable } from './storage/db';
import { loadKey, loadSettings, storageOk } from './storage/settings';
import { mountApp } from './ui/app';
import { startView, keyView, introView } from './ui/onboarding';
import { settingsSheet } from './ui/settings';
import { endingView } from './ui/ending';
import { debugSheet } from './ui/debug';
import { toast, dismissToast, clearToasts } from './ui/sheet';
import { applyTheme } from './ui/theme';
import { registerPwa } from './pwa/register';
import { notifySms } from './pwa/notify';
import { h } from './ui/dom';

const root = document.getElementById('root')!;
const DEBUG = new URLSearchParams(location.search).has('debug');

let cases: CaseFile[] = [];
let caseErrors: string[] = [];
let game: Game | null = null;
let app: ReturnType<typeof mountApp> | null = null;

function teardown() {
  game?.stop();
  app?.destroy();
  app = null;
  game = null;
}

async function home() {
  teardown();
  clearToasts();
  const saved: Record<string, boolean> = {};
  for (const c of cases) {
    const s = await loadGame(c.id);
    saved[c.id] = !!s && !s.ended;
  }
  startView(root, cases, caseErrors, saved, {
    play: (c, fresh) => choose(c, fresh),
    settings: () => settingsSheet(null, { changeKey: () => keyView(root, { done: () => home(), back: () => home() }), imported: (s) => resume(s) }),
  });
}

function choose(c: CaseFile, fresh: boolean) {
  const go = (demo: boolean) => (fresh ? introView(root, c, () => play(c, true, demo)) : play(c, false, demo));
  if (loadKey()) go(false);
  else keyView(root, { done: (demo) => go(demo), back: () => home() });
}

async function resume(state: GameState) {
  const c = cases.find((x) => x.id === state.caseId);
  if (!c) return toast('Sparfilen hör till ett fall som inte finns här.');
  await play(c, false, !loadKey(), state);
}

async function play(c: CaseFile, fresh: boolean, demo: boolean, state?: GameState) {
  teardown();
  const g = await Game.start(c, { fresh, demo, state });
  game = g;
  if (g.state.ended) return showEnding();
  if (g.demo) toast('Demoläge: personerna svarar med färdiga repliker.', { ms: 6000 });

  g.onIncoming = (chat, msg) => {
    if (document.visibilityState === 'visible' || !g.settings.notifications) return;
    const title = chat in g.state.groups ? g.state.groups[chat].name : g.engine.label(chat);
    const body = msg.text ?? msg.news?.head ?? 'Bild';
    void notifySms(title, chat in g.state.groups ? `${g.engine.label(msg.from)}: ${body}` : body, chat);
  };
  g.onNotice = (kind, text) => {
    if (kind === 'auth') {
      toast('API-nyckeln fungerar inte längre.', { ms: 0, id: 'auth', action: { label: 'Ny nyckel', run: () => askKey() } });
    } else if (kind === 'rate') {
      toast(text ? `Hög belastning. ${text}` : 'Hög belastning.', { id: 'rate', ms: 9000 });
    } else if (kind === 'rate-ok') {
      dismissToast('rate');
    } else if (kind === 'budget') {
      toast('Spelet har nått din gräns för antal anrop. Höj gränsen under Inställningar.', {
        ms: 0,
        id: 'budget',
        action: { label: 'Inställningar', run: () => openSettings() },
      });
    } else if (kind === 'end') {
      toast('Fallet närmar sig sitt slut.', { ms: 12000, action: { label: 'Peka ut', run: () => app?.accuse() } });
    }
  };

  app = mountApp(root, g, {
    settings: () => openSettings(),
    ending: () => showEnding(),
    debug: DEBUG ? () => debugSheet(g) : undefined,
  });
  g.run();
}

function askKey() {
  keyView(root, {
    done: (demo) => {
      const g = game;
      if (!g) return home();
      const key = loadKey();
      if (!demo && key) g.setProvider(new AnthropicProvider(key));
      dismissToast('auth');
      app = mountApp(root, g, { settings: () => openSettings(), ending: () => showEnding(), debug: DEBUG ? () => debugSheet(g) : undefined });
    },
    back: () => (game ? (app = mountApp(root, game, { settings: () => openSettings(), ending: () => showEnding() })) : home()),
  });
}

function openSettings() {
  settingsSheet(game, {
    changeKey: () => {
      app?.destroy();
      askKey();
    },
    quit: () => home(),
    imported: (s) => resume(s),
  });
}

function showEnding() {
  const g = game;
  if (!g) return home();
  g.stop();
  app?.destroy();
  app = null;
  clearToasts();
  endingView(root, g, { again: () => play(g.c, true, g.demo), back: () => home() });
}

async function boot() {
  applyTheme(loadSettings().theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadSettings().theme));
  registerPwa();
  try {
    ({ cases, errors: caseErrors } = await fetchCases());
  } catch {
    root.append(h('p', { class: 'error', text: 'Kunde inte läsa fallen. Kontrollera anslutningen och ladda om.' }));
    return;
  }
  if (!storageOk || !(await dbAvailable())) {
    toast('Webbläsaren tillåter inte lagring här (privat läge?). Spelet fungerar, men sparas inte.', { ms: 9000 });
  }
  await home();
}

void boot();

import type { Game } from '../game';
import { MODELS, estimateCost } from '../llm/anthropic';
import { TEMPO, type Tempo } from '../engine/engine';
import { clearLocal, forgetKey, loadKey, loadSettings, saveSettings, type Settings, type Theme } from '../storage/settings';
import { exportJson, importJson, wipeAll } from '../storage/db';
import { h } from './dom';
import { openSheet, toast } from './sheet';
import { applyTheme } from './theme';
import { canInstall, install, isIos, isStandalone } from '../pwa/register';
import { requestNotifications } from '../pwa/notify';

export function settingsSheet(g: Game | null, on: { changeKey: () => void; quit?: () => void; imported: (s: ReturnType<typeof importJson>) => void }) {
  let st: Settings = g?.settings ?? loadSettings();
  const set = (patch: Partial<Settings>) => {
    st = { ...st, ...patch };
    if (g) g.updateSettings(patch);
    else saveSettings(st);
  };

  openSheet(
    'Inställningar',
    (body, close) => {
      const select = <T extends string>(id: string, label: string, value: T, options: [T, string][], onchange: (v: T) => void) => {
        const el = h('select', { id, onchange: () => onchange(el.value as T) });
        for (const [v, l] of options) el.append(h('option', { value: v, text: l, selected: v === value }));
        return h('div', { class: 'field' }, h('label', { for: id, text: label }), el);
      };

      const section = (title: string, ...children: (Node | null)[]) => h('section', { class: 'settings-section' }, h('h3', { text: title }), ...children);

      // Kostnad
      const u = g?.state.usage;
      const cost = u ? estimateCost(st.model, u.inputTokens, u.outputTokens) : 0;

      const key = loadKey();
      body.append(
        section(
          'Utseende och tempo',
          select<Theme>('theme', 'Tema', st.theme, [['system', 'Följ systemet'], ['light', 'Ljust'], ['dark', 'Mörkt']], (v) => {
            set({ theme: v });
            applyTheme(v);
          }),
          select<Tempo>('tempo', 'Tempo', st.tempo, [['lugnt', 'Lugnt'], ['normalt', 'Normalt'], ['snabbt', 'Snabbt']], (v) => set({ tempo: v })),
          h('p', { class: 'muted small', text: `Klockan hoppar fram efter ca ${TEMPO[st.tempo].silence} sekunders tystnad.` }),
        ),
        section(
          'AI',
          select('model', 'Modell', st.model, MODELS.map((m) => [m.id, m.label] as [string, string]), (v) => set({ model: v })),
          h('p', { class: 'muted small', text: key ? 'En API-nyckel är sparad.' : g?.demo ? 'Du spelar demo utan nyckel.' : 'Ingen nyckel sparad.' }),
          h(
            'div',
            { class: 'row-inline' },
            h('button', { type: 'button', class: 'btn', text: key ? 'Byt nyckel' : 'Lägg till nyckel', onclick: () => (close(), on.changeKey()) }),
            key
              ? h('button', {
                  type: 'button',
                  class: 'btn',
                  text: 'Ta bort nyckeln',
                  onclick: () => {
                    forgetKey();
                    toast('Nyckeln är borttagen.');
                    close();
                  },
                })
              : null,
          ),
          u
            ? h(
                'p',
                { class: 'small' },
                `Det här spelet: ${u.calls} anrop, ${u.inputTokens.toLocaleString('sv-SE')} + ${u.outputTokens.toLocaleString('sv-SE')} tokens, ungefär ${cost.toLocaleString('sv-SE', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 })}.`,
              )
            : null,
          (() => {
            const id = 'limit';
            const el = h('input', { id, type: 'number', min: 0, step: 50, value: st.callLimit, inputmode: 'numeric' });
            el.addEventListener('change', () => set({ callLimit: Math.max(0, Math.round(Number(el.value) || 0)) }));
            return h('div', { class: 'field' }, h('label', { for: id, text: 'Max antal anrop per spel (0 = ingen gräns)' }), el);
          })(),
        ),
        section(
          'Aviseringar',
          h('label', { class: 'check', for: 'notif' }, (() => {
            const cb = h('input', { type: 'checkbox', id: 'notif', checked: st.notifications });
            cb.addEventListener('change', async () => {
              if (cb.checked) {
                const ok = await requestNotifications();
                if (!ok) {
                  cb.checked = false;
                  toast('Aviseringar är blockerade i webbläsaren.');
                  return;
                }
              }
              set({ notifications: cb.checked });
            });
            return cb;
          })(), 'Avisera om nya sms när fliken ligger i bakgrunden'),
        ),
        section(
          'App',
          canInstall()
            ? h('button', { type: 'button', class: 'btn', text: 'Installera som app', onclick: () => install() })
            : isIos() && !isStandalone()
              ? h('p', { class: 'small', text: 'Installera på iPhone: tryck på Dela och välj "Lägg till på hemskärmen".' })
              : isStandalone()
                ? h('p', { class: 'small muted', text: 'Appen är installerad.' })
                : null,
        ),
        section(
          'Sparat spel',
          g
            ? h('button', {
                type: 'button',
                class: 'btn',
                text: 'Exportera sparfil',
                onclick: () => {
                  const blob = new Blob([exportJson(g.state)], { type: 'application/json' });
                  const a = h('a', { href: URL.createObjectURL(blob), download: `fel-nummer-${g.c.id}.json` });
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                },
              })
            : null,
          (() => {
            const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import' });
            file.addEventListener('change', async () => {
              const f = file.files?.[0];
              if (!f) return;
              try {
                const state = importJson(await f.text());
                close();
                on.imported(state);
              } catch (e) {
                toast((e as Error).message);
              }
            });
            return h('span', {}, file, h('label', { for: 'import', class: 'btn', text: 'Importera sparfil', tabindex: 0, onkeydown: (ev: Event) => (ev as KeyboardEvent).key === 'Enter' && file.click() }));
          })(),
          on.quit ? h('button', { type: 'button', class: 'btn', text: 'Till startsidan', onclick: () => (close(), on.quit!()) }) : null,
          h('button', {
            type: 'button',
            class: 'btn danger',
            text: 'Radera allt',
            onclick: async () => {
              if (!confirm('Radera alla sparade spel, inställningar, nyckeln och appens cache?')) return;
              clearLocal();
              await wipeAll();
              location.reload();
            },
          }),
        ),
        h('p', { class: 'muted small', text: `Fel nummer ${__APP_VERSION__}` }),
      );
    },
    { wide: true },
  );
}

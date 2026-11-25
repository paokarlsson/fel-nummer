// Dold logg för utveckling (?debug i adressen). Visar agenternas stress, kvoter och turer.
import type { Game } from '../game';
import { clock, dayIndex, shortWeekday } from '../engine/time';
import { isAlive } from '../engine/turns';
import { clear, h } from './dom';
import { openSheet } from './sheet';

export function debugSheet(g: Game) {
  openSheet(
    'Logg (debug)',
    (body) => {
      const draw = () => {
        clear(body);
        const { c, state: s } = g;
        body.append(
          h(
            'table',
            { class: 'dbg' },
            h('tr', {}, ...['Person', 'Stress', 'Kvot', 'Status'].map((t) => h('th', { text: t }))),
            ...c.characters.map((ch) => {
              const a = s.agents[ch.id];
              return h(
                'tr',
                {},
                h('td', { text: ch.name }),
                h('td', { text: a.stress }),
                h('td', { text: `${a.used[dayIndex(s.t)] ?? 0}/${ch.dailyBudget}` }),
                h('td', { text: [isAlive(ch, s.t) ? '' : 'död', a.revealed ? 'vet' : '', a.pending.length ? 'väntar' : ''].filter(Boolean).join(', ') }),
              );
            }),
          ),
          h(
            'ol',
            { class: 'dbg-log', reversed: true },
            ...s.log
              .slice(-150)
              .reverse()
              .map((l) => h('li', { class: `k-${l.kind}`, text: `${shortWeekday(c.startDay, l.t)} ${clock(l.t)} · ${l.who} · ${l.kind}: ${l.text}` })),
          ),
        );
      };
      draw();
      const unsub = g.subscribe(draw);
      body.closest('dialog')?.addEventListener('close', () => unsub());
    },
    { wide: true },
  );
}

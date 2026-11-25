import type { Game } from '../game';
import { clock, parseAt, weekday } from '../engine/time';
import { clear, h } from './dom';

export function endingView(root: HTMLElement, g: Game, on: { again: () => void; back: () => void }) {
  const { c, state: s } = g;
  const r = s.ended!;
  const ch = c.characters.find((x) => x.id === r.accused)!;
  const shown = s.contacts[ch.id]?.name ?? ch.number;
  const choice = c.endings.choices.find((x) => x.id === r.choice);
  clear(root);
  const outcome = r.right ? c.endings.right : c.endings.wrong.replaceAll('{name}', `${ch.fullName} (${shown})`);
  root.append(
    h(
      'main',
      { class: 'page ending' },
      h('p', { class: 'muted small', text: `${weekday(c.startDay, s.t)} ${clock(s.t)} · ${c.title}` }),
      h('h1', { text: r.right ? 'Du hade rätt.' : 'Du hade fel.' }),
      h('p', { class: 'lead', text: `Du pekade ut ${ch.fullName} (${shown}).` }),
      choice ? h('p', { class: 'scene', text: choice.text }) : null,
      h('p', { text: outcome }),
      choice ? h('p', { text: (r.right ? choice.epilogueRight : choice.epilogueWrong) ?? '' }) : null,
      h('h2', { text: 'Det här hände egentligen' }),
      h('ol', { class: 'timeline' }, ...c.truth.timeline.map((t) => h('li', { text: t }))),
      h('h2', { text: 'Allas hemligheter' }),
      h(
        'dl',
        { class: 'secrets' },
        ...c.characters.flatMap((x) => [
          h('dt', {}, h('strong', { text: x.fullName }), h('span', { class: 'muted', text: ` ${x.number}${s.contacts[x.id] ? ` · du kallade personen "${s.contacts[x.id].name}"` : ''}` })),
          h('dd', { text: c.truth.secrets[x.id] ?? x.secret }),
        ]),
      ),
      h(
        'p',
        { class: 'muted small' },
        `Du spelade från ${weekday(c.startDay, parseAt(c.start)).toLowerCase()} till ${weekday(c.startDay, s.t).toLowerCase()}. `,
        `${Object.values(s.chats).flat().filter((m) => m.from === 'player').length} sms skickade, ${s.usage.calls} AI-anrop.`,
      ),
      h('div', { class: 'row-inline' }, h('button', { type: 'button', class: 'btn primary', text: 'Spela igen', onclick: on.again }), h('button', { type: 'button', class: 'btn', text: 'Startsidan', onclick: on.back })),
    ),
  );
  (root.querySelector('h1') as HTMLElement).tabIndex = -1;
  (root.querySelector('h1') as HTMLElement).focus();
}

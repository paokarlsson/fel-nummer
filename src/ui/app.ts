// Sms-appen: konversationslista, konversation och skrivfält.
import type { Game } from '../game';
import { BASE } from '../game';
import type { ChatId } from '../engine/types';
import type { Message } from '../engine/state';
import { clock, dayIndex, parseAt, shortWeekday, weekday } from '../engine/time';
import { isAlive } from '../engine/turns';
import { append, clear, h, icon, iconButton, initials } from './dom';
import { openSheet, toast } from './sheet';

export interface AppNav {
  settings: () => void;
  ending: () => void;
  debug?: () => void;
}

const COLORS = ['#56617d', '#3f7d5c', '#a2541d', '#5b6b2f', '#2f6f8f', '#9a3f6b', '#7a4fb0', '#8a6d1f'];

export function mountApp(root: HTMLElement, g: Game, nav: AppNav) {
  const { c, state: s, engine: e } = g;
  let open: ChatId | null = null;
  let menuEl: HTMLElement | null = null;
  let outsideTimer: ReturnType<typeof setTimeout> | undefined;

  // ---------- hjälpare ----------
  const isGroup = (id: ChatId) => id in s.groups;
  const numberOf = (id: string) => (id.startsWith('num:') ? id.slice(4) : e.numberOf(id));
  const title = (id: ChatId) => {
    if (isGroup(id)) return s.groups[id].name;
    if (id.startsWith('num:')) return id.slice(4);
    return e.label(id);
  };
  const senderLabel = (id: string) => (id === 'player' ? 'Du' : s.contacts[id]?.name ?? numberOf(id));
  const timeLabel = (t: number) => (dayIndex(t) === dayIndex(s.t) ? clock(t) : shortWeekday(c.startDay, t));

  function avatar(id: ChatId, size = 'md'): HTMLElement {
    if (isGroup(id)) return h('span', { class: `avatar ${size} unknown`, 'aria-hidden': 'true' }, icon('group', size === 'sm' ? 18 : 22));
    const saved = s.contacts[id];
    if (saved) {
      const el = h('span', { class: `avatar ${size}`, 'aria-hidden': 'true', text: initials(saved.name) });
      el.style.setProperty('--av', saved.color);
      return el;
    }
    return h('span', { class: `avatar ${size} unknown`, 'aria-hidden': 'true', text: '#' });
  }

  function preview(id: ChatId): string {
    const who = e.typing[id];
    if (who) return isGroup(id) ? `${senderLabel(who)} skriver…` : 'skriver…';
    const m = (s.chats[id] ?? []).at(-1);
    if (!m) return '';
    let body = m.deleted ? 'Detta meddelande har raderats' : m.text ?? '';
    if (!m.deleted && m.news) body = `${m.news.paper}: ${m.news.head}`;
    if (!m.deleted && m.image) body = `Bild${m.text ? ` · ${m.text}` : ''}`;
    if (m.from === 'player') return `Du: ${body}`;
    if (isGroup(id) && m.from !== 'system') return `${senderLabel(m.from)}: ${body}`;
    return body;
  }

  // ---------- skelett ----------
  const clockEl = h('span', { class: 'game-clock' });
  const banner = h('div', { class: 'banner', hidden: true });
  const list = h('nav', { class: 'chat-list', 'aria-label': 'Konversationer' });
  const menuBtn = iconButton('more', 'Meny', (ev) => toggleMenu(ev.currentTarget as HTMLElement));
  const listPane = h(
    'section',
    { class: 'pane list-pane' },
    h(
      'header',
      { class: 'list-head' },
      h('div', { class: 'list-title' }, clockEl, h('h1', { text: 'Meddelanden' })),
      h('div', { class: 'head-actions' }, iconButton('compose', 'Nytt sms', () => newSms()), menuBtn),
    ),
    banner,
    list,
  );

  const chatHead = h('header', { class: 'chat-head' });
  const log = h('section', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Meddelanden' });
  const input = h('input', {
    type: 'text',
    id: 'composer',
    autocomplete: 'off',
    enterkeyhint: 'send',
    placeholder: 'Sms',
    maxlength: 600,
  });
  const sendBtn = h('button', { type: 'submit', class: 'send-btn', 'aria-label': 'Skicka' }, icon('send', 20));
  const composer = h(
    'form',
    { class: 'composer' },
    h('label', { for: 'composer', class: 'sr-only', text: 'Sms' }),
    input,
    sendBtn,
  );
  const empty = h('div', { class: 'empty-chat' }, h('p', { text: 'Välj en konversation' }));
  const chatPane = h('section', { class: 'pane chat-pane' }, chatHead, log, composer, empty);
  const appEl = h('div', { class: 'app', 'data-view': 'list' }, listPane, chatPane);
  clear(root);
  root.append(appEl);

  composer.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text || !open || s.ended) return;
    input.value = '';
    e.playerSend(open, text);
    if (open === 'polis' && s.endReached) setTimeout(() => accuse(), 1200);
  });
  input.addEventListener('input', () => (g.playerTypingUntil = Date.now() + 4000));

  // ---------- lista ----------
  function renderList() {
    clockEl.textContent = `${weekday(c.startDay, s.t)} ${clock(s.t)}`;
    banner.hidden = !s.paused;
    clear(banner);
    if (s.paused) {
      banner.append(h('span', { text: 'Pausat. Ingen skriver och klockan står still.' }), h('button', { type: 'button', text: 'Fortsätt', onclick: () => g.setPaused(false) }));
    }
    const ids = Object.keys(s.chats)
      .filter((id) => s.chats[id].length)
      .sort((a, b) => (s.chats[b].at(-1)?.id ?? 0) - (s.chats[a].at(-1)?.id ?? 0));
    const focused = document.activeElement?.getAttribute('data-chat');
    clear(list);
    if (!ids.length) list.append(h('p', { class: 'list-empty', text: 'Inga meddelanden ännu.' }));
    for (const id of ids) {
      const unread = s.unread[id] ?? 0;
      const last = s.chats[id].at(-1)!;
      const row = h(
        'a',
        {
          href: '#',
          class: `row${unread ? ' unread' : ''}${id === open ? ' active' : ''}`,
          'data-chat': id,
          'aria-current': id === open ? 'true' : null,
          onclick: (ev: Event) => {
            ev.preventDefault();
            openChat(id);
          },
        },
        avatar(id),
        h(
          'span',
          { class: 'row-main' },
          h('span', { class: 'row-top' }, h('strong', { class: 'row-name', text: title(id) }), h('span', { class: 'row-time', text: timeLabel(last.t) })),
          h(
            'span',
            { class: 'row-bottom' },
            h('span', { class: `row-preview${e.typing[id] ? ' typing' : ''}`, text: preview(id) }),
            unread ? h('span', { class: 'badge', text: unread, 'aria-label': `${unread} olästa` }) : null,
          ),
        ),
      );
      list.append(row);
    }
    if (focused) (list.querySelector(`[data-chat="${CSS.escape(focused)}"]`) as HTMLElement | null)?.focus();
  }

  list.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const rows = [...list.querySelectorAll<HTMLElement>('.row')];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      ev.preventDefault();
      next.focus();
    }
  });

  // ---------- konversation ----------
  function openChat(id: ChatId | null) {
    open = id;
    g.openChat = id;
    appEl.dataset.view = id ? 'chat' : 'list';
    if (id) {
      s.unread[id] = 0;
      lastRendered = '';
    }
    render();
    if (id && matchMedia('(min-width: 760px)').matches) input.focus();
  }

  let lastRendered = '';
  function renderChat() {
    empty.hidden = !!open;
    chatHead.hidden = log.hidden = composer.hidden = !open;
    if (!open) return;
    const id = open;
    if (document.visibilityState === 'visible') s.unread[id] = 0;

    clear(chatHead);
    const sub = isGroup(id)
      ? s.groups[id].members.map((m) => senderLabel(m)).join(', ') + ', du'
      : s.contacts[id]
        ? numberOf(id)
        : '';
    append(chatHead, [
      iconButton('back', 'Tillbaka', () => openChat(null), 'icon-btn back-btn'),
      avatar(id, 'sm'),
      h('span', { class: 'chat-title' }, h('strong', { text: title(id) }), sub ? h('span', { class: 'chat-sub', text: sub }) : null),
      !isGroup(id) ? iconButton('person', s.contacts[id] ? 'Redigera kontakt' : 'Spara kontakt', () => contactSheet(id)) : null,
    ]);

    // Rendera om bara när något har ändrats i den öppna konversationen.
    const msgs = s.chats[id] ?? [];
    const sig = `${id}|${msgs.length}|${msgs.filter((m) => m.deleted).length}|${e.typing[id] ?? ''}|${JSON.stringify(s.contacts)}`;
    if (sig === lastRendered) return;
    lastRendered = sig;
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    clear(log);
    let day = -1;
    let prevFrom = '';
    for (const m of msgs) {
      if (dayIndex(m.t) !== day) {
        day = dayIndex(m.t);
        prevFrom = '';
        log.append(h('p', { class: 'day', text: weekday(c.startDay, m.t) }));
      }
      if (m.from === 'system') {
        log.append(h('p', { class: 'sys', text: m.text ?? '' }));
        prevFrom = '';
        continue;
      }
      log.append(bubble(id, m, isGroup(id) && m.from !== 'player' && m.from !== prevFrom));
      prevFrom = m.from;
    }
    const who = e.typing[id];
    if (who) {
      log.append(
        h(
          'div',
          { class: 'msg in' },
          isGroup(id) ? h('span', { class: 'sender', text: senderLabel(who) }) : null,
          h('span', { class: 'bubble typing', 'aria-label': `${senderLabel(who)} skriver…` }, h('i'), h('i'), h('i')),
        ),
      );
    }
    if (nearBottom || msgs.at(-1)?.from === 'player') log.scrollTop = log.scrollHeight;
    composer.hidden = false;
    const ch = c.characters.find((x) => x.id === id);
    input.placeholder = ch && !isAlive(ch, s.t) ? 'Sms' : isGroup(id) ? `Sms till ${s.groups[id].name}` : 'Sms';
    input.disabled = sendBtn.disabled = !!s.ended;
  }

  function bubble(chat: ChatId, m: Message, showSender: boolean): HTMLElement {
    const out = m.from === 'player';
    const content: (HTMLElement | null)[] = [];
    if (m.deleted) {
      content.push(h('span', { class: 'deleted', text: 'Detta meddelande har raderats' }));
    } else {
      if (m.fwdFrom) content.push(h('span', { class: 'fwd' }, icon('forward', 13), `Vidarebefordrat från ${fwdLabel(m.fwdFrom)}`));
      if (m.image) content.push(h('img', { class: 'photo', src: `${BASE}cases/${c.id}/${m.image}`, alt: m.alt ?? 'Bild', loading: 'lazy' }));
      if (m.news)
        content.push(
          h(
            'span',
            { class: 'news' },
            h('span', { class: 'paper', text: m.news.paper }),
            h('strong', { text: m.news.head }),
            m.news.sub ? h('span', { class: 'news-sub', text: m.news.sub }) : null,
          ),
        );
      if (m.text) content.push(h('span', { class: 'text', text: m.text }));
    }
    const status = out ? (m.status === 'sent' ? ' ✓' : ' ✓✓') : '';
    content.push(h('span', { class: 'meta', text: `${clock(m.t)}${status}`, title: out ? (m.status === 'sent' ? 'Ej levererat' : 'Levererat') : null }));
    const b = h(
      'button',
      {
        type: 'button',
        class: `bubble${m.deleted ? ' is-deleted' : ''}${m.news ? ' has-news' : ''}${m.image ? ' has-image' : ''}`,
        'aria-haspopup': 'dialog',
        onclick: () => !m.deleted && messageActions(chat, m),
      },
      ...content,
    );
    return h('div', { class: `msg ${out ? 'out' : 'in'}` }, showSender ? h('span', { class: 'sender', text: senderLabel(m.from) }) : null, b);
  }

  function fwdLabel(raw: string): string {
    const d = raw.replace(/\D/g, '');
    if (!d) return raw;
    const id = [...c.characters, ...c.services].find((x) => x.number.replace(/\D/g, '') === d)?.id;
    return id && s.contacts[id] ? `${s.contacts[id].name} (${raw})` : raw;
  }

  // ---------- ark ----------
  function messageActions(chat: ChatId, m: Message) {
    openSheet('Meddelande', (body, close) => {
      body.append(
        h(
          'div',
          { class: 'actions' },
          h('button', { type: 'button', class: 'action', onclick: () => (close(), forwardSheet(chat, m)) }, icon('forward'), 'Vidarebefordra'),
          m.text
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'action',
                  onclick: async () => {
                    close();
                    try {
                      await navigator.clipboard.writeText(m.text ?? '');
                      toast('Kopierat');
                    } catch {
                      toast('Kunde inte kopiera');
                    }
                  },
                },
                icon('copy'),
                'Kopiera',
              )
            : null,
        ),
      );
    });
  }

  function forwardSheet(from: ChatId, m: Message) {
    openSheet('Vidarebefordra till', (body, close) => {
      const ids = Object.keys(s.chats).filter((id) => id !== from && s.chats[id].length && !c.services.some((x) => x.id === id));
      const ul = h('div', { class: 'pick-list' });
      for (const id of ids) {
        ul.append(
          h(
            'button',
            { type: 'button', class: 'pick', onclick: () => (close(), e.forward(m, from, id), openChat(id)) },
            avatar(id, 'sm'),
            h('span', { class: 'pick-name', text: title(id) }),
          ),
        );
      }
      const field = h('input', { type: 'tel', id: 'fwd-number', placeholder: '070-123 45 67', autocomplete: 'off' });
      body.append(
        ul,
        h(
          'form',
          {
            class: 'inline-form',
            onsubmit: (ev: Event) => {
              ev.preventDefault();
              const id = e.chatForNumber(field.value);
              if (!id) return toast('Ogiltigt nummer');
              close();
              e.forward(m, from, id);
              openChat(id);
            },
          },
          h('label', { for: 'fwd-number', text: 'Annat nummer' }),
          h('span', { class: 'row-inline' }, field, h('button', { type: 'submit', class: 'btn', text: 'Skicka' })),
        ),
      );
    });
  }

  function newSms() {
    openSheet('Nytt sms', (body, close) => {
      const field = h('input', { type: 'tel', id: 'new-number', placeholder: '070-123 45 67', autocomplete: 'off', inputmode: 'tel' });
      body.append(
        h(
          'form',
          {
            class: 'inline-form',
            onsubmit: (ev: Event) => {
              ev.preventDefault();
              const id = e.chatForNumber(field.value);
              if (!id) return toast(field.value.replace(/\D/g, '') === c.player.number.replace(/\D/g, '') ? 'Det är ditt eget nummer' : 'Ogiltigt nummer');
              close();
              s.chats[id] ??= [];
              openChat(id);
            },
          },
          h('label', { for: 'new-number', text: 'Till' }),
          h('span', { class: 'row-inline' }, field, h('button', { type: 'submit', class: 'btn primary', text: 'Skriv' })),
        ),
      );
      field.focus();
    });
  }

  function contactSheet(id: ChatId) {
    const saved = s.contacts[id];
    openSheet(saved ? 'Redigera kontakt' : 'Spara kontakt', (body, close) => {
      let color = saved?.color ?? COLORS[Object.keys(s.contacts).length % COLORS.length];
      const name = h('input', { type: 'text', id: 'contact-name', value: saved?.name ?? '', placeholder: 'T.ex. Advokaten?', maxlength: 40, autocomplete: 'off' });
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Färg' });
      const paint = () => {
        clear(swatches);
        for (const col of COLORS) {
          const b = h('button', {
            type: 'button',
            class: 'swatch',
            role: 'radio',
            'aria-checked': String(col === color),
            'aria-label': `Färg ${COLORS.indexOf(col) + 1}`,
            onclick: () => ((color = col), paint()),
          });
          b.style.setProperty('--av', col);
          swatches.append(b);
        }
      };
      paint();
      body.append(
        h('p', { class: 'muted', text: numberOf(id) }),
        h(
          'form',
          {
            class: 'stack',
            onsubmit: (ev: Event) => {
              ev.preventDefault();
              const n = name.value.trim();
              if (n) s.contacts[id] = { name: n, color };
              else delete s.contacts[id];
              close();
              g.changed();
            },
          },
          h('label', { for: 'contact-name', text: 'Namn' }),
          name,
          h('span', { class: 'label', text: 'Färg' }),
          swatches,
          h(
            'span',
            { class: 'row-inline end' },
            saved
              ? h('button', { type: 'button', class: 'btn', text: 'Ta bort kontakt', onclick: () => (delete s.contacts[id], close(), g.changed()) })
              : null,
            h('button', { type: 'submit', class: 'btn primary', text: 'Spara' }),
          ),
        ),
      );
      name.focus();
    });
  }

  function accuse() {
    if (s.ended) return nav.ending();
    const choices = c.endings.choices.filter((x) => s.t >= parseAt(x.availableFrom));
    let picked: string | undefined;
    openSheet('Peka ut', (body, close) => {
      const draw = () => {
        clear(body);
        if (choices.length && picked === undefined) {
          body.append(h('p', { text: 'Innan du bestämmer dig:' }));
          for (const ch of choices) {
            body.append(h('button', { type: 'button', class: 'btn block', text: ch.label, onclick: () => ((picked = ch.id), draw()) }));
          }
          body.append(h('button', { type: 'button', class: 'btn block ghost', text: 'Nej, peka ut direkt', onclick: () => ((picked = ''), draw()) }));
          return;
        }
        const choice = choices.find((x) => x.id === picked);
        if (choice) body.append(h('p', { class: 'scene', text: choice.text }));
        body.append(h('p', { class: 'strong', text: c.endings.prompt }));
        const list = h('div', { class: 'pick-list' });
        for (const id of c.endings.accusable) {
          list.append(
            h(
              'button',
              {
                type: 'button',
                class: 'pick',
                onclick: () => {
                  if (!confirm(`Peka ut ${senderLabel(id)}? Fallet avslutas.`)) return;
                  close();
                  e.accuse(id, picked || undefined);
                  nav.ending();
                },
              },
              avatar(id, 'sm'),
              h('span', { class: 'pick-name' }, h('strong', { text: senderLabel(id) }), s.contacts[id] ? h('span', { class: 'muted', text: ` ${numberOf(id)}` }) : null),
            ),
          );
        }
        body.append(list, h('p', { class: 'muted small', text: 'Det går inte att ångra. Du får se vad som egentligen hände.' }));
      };
      draw();
    });
  }

  // ---------- meny ----------
  function toggleMenu(anchor: HTMLElement) {
    if (menuEl?.isConnected) return closeMenu();
    const canSkip = !s.ended && !e.busy && e.nextEventTime() != null;
    const item = (ic: string, label: string, run: () => void, disabled = false) =>
      h('button', { type: 'button', role: 'menuitem', class: 'menu-item', disabled, onclick: () => (closeMenu(), run()) }, icon(ic, 20), label);
    menuEl = h(
      'div',
      { class: 'menu', role: 'menu', 'aria-label': 'Meny' },
      item('ff', 'Spola fram', () => {
        if (!e.skip()) toast('Vänta tills ingen skriver.');
      }, !canSkip),
      item(s.paused ? 'play' : 'pause', s.paused ? 'Fortsätt' : 'Pausa', () => g.setPaused(!s.paused)),
      item('target', 'Peka ut…', () => accuse()),
      item('gear', 'Inställningar', () => nav.settings()),
      nav.debug ? item('more', 'Logg (debug)', () => nav.debug!()) : null,
    );
    anchor.setAttribute('aria-expanded', 'true');
    listPane.append(menuEl);
    (menuEl.querySelector('button:not([disabled])') as HTMLElement | null)?.focus();
    outsideTimer = setTimeout(() => document.addEventListener('click', outside), 0);
    document.addEventListener('keydown', menuKeys);
  }
  function outside(ev: Event) {
    if (menuEl && !menuEl.contains(ev.target as Node)) closeMenu();
  }
  function menuKeys(ev: KeyboardEvent) {
    if (!menuEl) return;
    const items = [...menuEl.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (ev.key === 'Escape') closeMenu(true);
    if (ev.key === 'ArrowDown') (ev.preventDefault(), items[(i + 1) % items.length]?.focus());
    if (ev.key === 'ArrowUp') (ev.preventDefault(), items[(i - 1 + items.length) % items.length]?.focus());
  }
  function closeMenu(refocus = false) {
    clearTimeout(outsideTimer);
    menuEl?.remove();
    menuEl = null;
    menuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', menuKeys);
    if (refocus) menuBtn.focus();
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !document.querySelector('dialog[open]') && !menuEl && open && appEl.dataset.view === 'chat') openChat(null);
  });

  // ---------- rendering ----------
  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      renderList();
      renderChat();
    });
  }
  const unsub = g.subscribe(render);
  document.addEventListener('visibilitychange', render);
  render();

  return {
    openChat,
    accuse,
    destroy: () => {
      unsub();
      closeMenu();
      document.removeEventListener('visibilitychange', render);
    },
  };
}

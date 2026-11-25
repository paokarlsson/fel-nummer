// Liten DOM-hjälpare. All text sätts med textContent, aldrig som HTML.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

const SVG = 'http://www.w3.org/2000/svg';

/** Ikoner som streckritade SVG:er (byggda med DOM, inte innerHTML). */
const ICONS: Record<string, string[]> = {
  back: ['M15 5l-7 7 7 7'],
  send: ['M12 19V5', 'M6 11l6-6 6 6'],
  more: ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'],
  compose: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  group: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6', 'M16 4.6a3.5 3.5 0 0 1 0 6.8', 'M18 14.3c2.2.7 3.5 2.8 3.5 5.7'],
  forward: ['M14 5l6 6-6 6', 'M20 11H9a5 5 0 0 0-5 5v3'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  person: ['M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6'],
  ff: ['M4 6l8 6-8 6z', 'M12 6l8 6-8 6z'],
  pause: ['M9 6v12', 'M15 6v12'],
  play: ['M7 5l12 7-12 7z'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
};

export function icon(name: keyof typeof ICONS | string, size = 22): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] ?? []) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

export function iconButton(name: string, label: string, onclick: (e: Event) => void, cls = 'icon-btn'): HTMLButtonElement {
  return h('button', { class: cls, type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

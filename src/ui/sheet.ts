import { h, iconButton } from './dom';

export interface SheetHandle {
  close: () => void;
  el: HTMLDialogElement;
  body: HTMLElement;
}

/** Ett ark (dialog) som glider upp nerifrån på mobil. Esc och klick utanför stänger. */
export function openSheet(title: string, build: (body: HTMLElement, close: () => void) => void, opts: { onClose?: () => void; wide?: boolean } = {}): SheetHandle {
  const body = h('div', { class: 'sheet-body' });
  const dlg = h(
    'dialog',
    { class: `sheet${opts.wide ? ' wide' : ''}`, 'aria-label': title },
    h('header', { class: 'sheet-head' }, h('h2', { text: title }), iconButton('close', 'Stäng', () => close())),
    body,
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dlg.close();
    dlg.remove();
    opts.onClose?.();
  };
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // Esc stänger bara arket, inte vyn bakom.
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') e.stopPropagation();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  build(body, close);
  document.body.append(dlg);
  dlg.showModal();
  return { close, el: dlg, body };
}

let toastHost: HTMLElement | null = null;

export function toast(text: string, opts: { action?: { label: string; run: () => void }; ms?: number; id?: string } = {}) {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  if (opts.id) toastHost.querySelector(`[data-id="${opts.id}"]`)?.remove();
  const el = h(
    'div',
    { class: 'toast', 'data-id': opts.id ?? '' },
    h('span', { text }),
    opts.action &&
      h('button', {
        type: 'button',
        text: opts.action.label,
        onclick: () => {
          opts.action!.run();
          el.remove();
        },
      }),
  );
  toastHost.append(el);
  if (opts.ms !== 0) setTimeout(() => el.remove(), opts.ms ?? 5000);
  return () => el.remove();
}

export function dismissToast(id: string) {
  toastHost?.querySelector(`[data-id="${id}"]`)?.remove();
}

export function clearToasts() {
  toastHost?.replaceChildren();
}

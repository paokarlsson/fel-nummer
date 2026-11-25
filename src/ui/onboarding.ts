// Start, nyckel och intro.
import type { CaseFile } from '../engine/types';
import { AnthropicProvider } from '../llm/anthropic';
import { LlmError } from '../llm/provider';
import { keyRemembered, loadKey, saveKey } from '../storage/settings';
import { clear, h } from './dom';

export function startView(
  root: HTMLElement,
  cases: CaseFile[],
  errors: string[],
  saved: Record<string, boolean>,
  on: { play: (c: CaseFile, fresh: boolean) => void; settings: () => void },
) {
  clear(root);
  const cards = cases.map((c) =>
    h(
      'article',
      { class: 'case-card' },
      h('h2', { text: c.title }),
      h('p', { text: c.teaser }),
      h(
        'div',
        { class: 'row-inline' },
        saved[c.id] ? h('button', { type: 'button', class: 'btn primary', text: 'Fortsätt', onclick: () => on.play(c, false) }) : null,
        h(
          'button',
          {
            type: 'button',
            class: saved[c.id] ? 'btn' : 'btn primary',
            text: 'Nytt spel',
            onclick: () => {
              if (saved[c.id] && !confirm('Börja om? Det sparade spelet skrivs över.')) return;
              on.play(c, true);
            },
          },
        ),
      ),
    ),
  );
  root.append(
    h(
      'main',
      { class: 'page start' },
      h('div', { class: 'brand' }, h('h1', { text: 'Fel nummer' }), h('p', { class: 'muted', text: 'Ett deckaräventyr i sms. Sms:en är inte till dig.' })),
      ...cards,
      errors.length ? h('p', { class: 'error', text: `Kunde inte läsa alla fall: ${errors.join(' | ')}` }) : null,
      h('button', { type: 'button', class: 'btn ghost', text: 'Inställningar', onclick: on.settings }),
      h('p', { class: 'muted small', text: `Version ${__APP_VERSION__}` }),
    ),
  );
}

export function keyView(root: HTMLElement, on: { done: (demo: boolean) => void; back: () => void }) {
  clear(root);
  const input = h('input', {
    type: 'password',
    id: 'api-key',
    autocomplete: 'off',
    spellcheck: 'false',
    placeholder: 'sk-ant-…',
    value: loadKey() ?? '',
  });
  const remember = h('input', { type: 'checkbox', id: 'remember', checked: keyRemembered() });
  const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const go = h('button', { type: 'submit', class: 'btn primary', text: 'Testa och fortsätt' });
  root.append(
    h(
      'main',
      { class: 'page narrow' },
      h('h1', { text: 'Din API-nyckel' }),
      h('p', {
        text: 'Personerna i spelet är AI-agenter som körs med din egen nyckel från Anthropic. Nyckeln skickas bara direkt till api.anthropic.com, aldrig någon annanstans.',
      }),
      h(
        'form',
        {
          class: 'stack',
          onsubmit: async (ev: Event) => {
            ev.preventDefault();
            const key = input.value.trim();
            if (!key) return;
            go.disabled = true;
            status.textContent = 'Testar nyckeln …';
            try {
              const ok = await new AnthropicProvider(key).validateKey(key);
              if (!ok) {
                status.textContent = 'Nyckeln godtogs inte. Kontrollera att du har kopierat hela.';
                return;
              }
              saveKey(key, remember.checked);
              on.done(false);
            } catch (e) {
              status.textContent = e instanceof LlmError && e.kind === 'network' ? 'Kunde inte nå Anthropic. Är du online?' : `Något gick fel: ${(e as Error).message}`;
            } finally {
              go.disabled = false;
            }
          },
        },
        h('label', { for: 'api-key', text: 'API-nyckel' }),
        input,
        h('label', { class: 'check', for: 'remember' }, remember, 'Kom ihåg på den här enheten'),
        go,
        status,
      ),
      h(
        'ul',
        { class: 'notes' },
        h('li', { text: 'Nyckeln lagras okrypterad i webbläsaren.' }),
        h('li', { text: 'Använd en egen nyckel med låg utgiftsgräns. Ett fall kostar oftast några kronor med standardmodellen.' }),
        h('li', { text: 'Ta bort nyckeln under Inställningar när du är klar.' }),
      ),
      h('p', {}, h('a', { href: 'https://console.anthropic.com/settings/keys', target: '_blank', rel: 'noopener noreferrer', text: 'Skapa en nyckel och sätt en gräns i Anthropic Console' })),
      h('hr'),
      h('p', { class: 'muted', text: 'Utan nyckel kan du spela en demo. Händelserna är desamma, men personerna svarar med färdiga repliker.' }),
      h('div', { class: 'row-inline' }, h('button', { type: 'button', class: 'btn', text: 'Spela demo utan nyckel', onclick: () => on.done(true) }), h('button', { type: 'button', class: 'btn ghost', text: 'Tillbaka', onclick: on.back })),
    ),
  );
  input.focus();
}

export function introView(root: HTMLElement, c: CaseFile, onGo: () => void) {
  clear(root);
  const go = h('button', { type: 'button', class: 'btn primary', text: 'Sätt i kortet', onclick: onGo });
  root.append(
    h(
      'main',
      { class: 'page narrow intro' },
      h('div', { class: 'sim', 'aria-hidden': 'true' }, h('span', { text: c.player.number })),
      h('p', { class: 'lead', text: c.player.premise }),
      h('p', { class: 'muted', text: `Ditt nummer: ${c.player.number}` }),
      h('p', { class: 'muted small', text: 'Tryck på ett sms för att vidarebefordra det. Spara nummer som kontakter. Under menyn kan du spola fram, pausa och peka ut någon.' }),
      go,
    ),
  );
  go.focus();
}

import { toast } from '../ui/sheet';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferred: InstallPrompt | null = null;
export let registration: ServiceWorkerRegistration | null = null;

export const canInstall = () => deferred != null;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function install() {
  if (!deferred) return;
  await deferred.prompt();
  deferred = null;
}

export function registerPwa() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
  });
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      registration = reg;
      const offer = (w: ServiceWorker) =>
        toast('Ny version finns', {
          ms: 0,
          id: 'update',
          action: {
            label: 'Ladda om',
            run: () => w.postMessage('SKIP_WAITING'),
          },
        });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          // Byt inte tyst mitt i ett spel: fråga först.
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    })
    .catch(() => {});
}

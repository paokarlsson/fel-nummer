import { registration } from './register';

export async function requestNotifications(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Lokal avisering när ett sms kommer och appen inte syns. */
export async function notifySms(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { body: body.slice(0, 120), tag, icon: `${import.meta.env.BASE_URL}icons/192.png`, badge: `${import.meta.env.BASE_URL}icons/192.png` };
  try {
    if (registration) await registration.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* ignoreras */
  }
}

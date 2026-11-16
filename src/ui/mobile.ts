// Phones (play-test round 3): landscape only, full screen where the browser allows it.
// - `html.phone` when the device is a touch phone (or ?phone=1), `html.portrait` when taller than wide.
// - A "turn your phone" screen covers portrait on phones.
// - Android/Chrome: the first tap asks for full screen and locks landscape. iPhone Safari has
//   neither API for pages, so the game is installable (manifest) and a one-time tip explains
//   "Add to Home Screen", which opens it without Safari's bars.
import { FLAGS } from '../env';
import { t } from '../data/strings';
import { h } from './dom';

export function isPhone(): boolean {
  if (FLAGS.phone) return true;
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(window.innerWidth, window.innerHeight) <= 540;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 540);
}

/** Opened from the home screen (no browser bars). */
export function isStandalone(): boolean {
  return (typeof matchMedia !== 'undefined' && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches))
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function applyDeviceClasses(): void {
  const el = document.documentElement;
  const phone = isPhone();
  el.classList.toggle('phone', phone);
  el.classList.toggle('portrait', window.innerHeight > window.innerWidth);
}

let rotateEl: HTMLElement | null = null;
/** The "turn your phone sideways" screen (shown by CSS on phones in portrait). */
export function installRotateScreen(): void {
  if (rotateEl) { relabelRotateScreen(); return; }
  rotateEl = h('div', { class: 'rotate-screen', 'data-testid': 'rotate-screen' },
    h('div', { class: 'rotate-phone' }, h('i')),
    h('div', { class: 'rotate-title' }),
    h('div', { class: 'rotate-sub' }));
  document.body.append(rotateEl);
  relabelRotateScreen();
}
export function relabelRotateScreen(): void {
  if (!rotateEl) return;
  rotateEl.querySelector('.rotate-title')!.textContent = t('mobile.rotate');
  rotateEl.querySelector('.rotate-sub')!.textContent = t('mobile.rotateSub');
}

/** Full screen + landscape lock where supported (Android Chrome). Call from a user gesture. */
export function enterFullscreen(): void {
  if (!isPhone() || isStandalone()) return;
  const d = document as Document & { webkitFullscreenElement?: Element };
  if (document.fullscreenElement || d.webkitFullscreenElement) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const lock = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => {});
  };
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => {});
    else if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); lock(); }
  } catch { /* not allowed here */ }
}

/** On phones, ask for full screen on the first tap (and again after the player left it, on the next tap). */
export function installFullscreenOnTap(): void {
  const onTap = () => enterFullscreen();
  window.addEventListener('pointerup', onTap, true);
}

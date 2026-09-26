import './toast.css';

/** How long a toast stays up, ms. */
export const TOAST_MS = 4000;
/** Toasts shown at once; an older one goes when a new one would be the one too many. */
const MAX_TOASTS = 3;

let stack: HTMLElement | null = null;

/**
 * A short notice over the race that goes by itself (MK-70: "Sam disconnected — AI takes over"). It
 * doesn't take the controls or stop anything; screen readers announce it.
 */
export function showToast(text: string, ms = TOAST_MS): HTMLElement {
  if (!stack?.isConnected) {
    stack = document.createElement('div');
    stack.className = 'toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  const toast = document.createElement('p');
  toast.className = 'toast';
  toast.textContent = text;
  stack.append(toast);
  while (stack.children.length > MAX_TOASTS) stack.firstElementChild?.remove();
  window.setTimeout(() => toast.remove(), ms);
  return toast;
}

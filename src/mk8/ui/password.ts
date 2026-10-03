// MK8 Mode's password box (MK-135): on the site the pack is behind a server-checked password
// (ADR 0009 as amended), so a 401 from the pack lands here. Built from the MK8 UI kit (MK-104).
// The password goes to `POST /api/mk8-login`; nothing about it is in the page.
import { registerScreen } from '../../ui/router';
import type { LoginResult } from '../loader';
import { menuScreen } from './kit';
import './password.css';

export interface Mk8PasswordProps {
  /** Tries a password; `ok` means the cookie is set and the screen is about to be replaced. */
  onSubmit: (password: string) => Promise<LoginResult>;
  onBack: () => void;
}

declare module '../../ui/router' {
  interface ScreenProps {
    mk8Password: Mk8PasswordProps;
  }
}

const MESSAGES: Record<Exclude<LoginResult, 'ok'>, string> = {
  wrong: 'Wrong password. Try again.',
  limited: 'Too many tries. Wait a few minutes, then try again.',
  unavailable: "MK8 Mode isn't set up on this site.",
};
const NETWORK_ERROR = "Couldn't reach the server. Try again.";

registerScreen('mk8Password', (panel, { onSubmit, onBack }) => {
  panel.classList.add('mk8-host');
  const root = document.createElement('div');
  root.className = 'mk8';
  let busy = false;

  const form = document.createElement('form');
  form.className = 'mk8-password-form mk8-panel';
  form.noValidate = true;
  const label = document.createElement('label');
  label.className = 'mk8-slant';
  label.htmlFor = 'mk8-password';
  label.textContent = 'Enter the password to play MK8 Mode';
  const input = document.createElement('input');
  input.id = 'mk8-password';
  input.className = 'mk8-password-input';
  input.type = 'password';
  input.name = 'password';
  input.autocomplete = 'current-password';
  input.enterKeyHint = 'go';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  const error = document.createElement('p');
  error.className = 'mk8-password-error';
  // A live region (not role=alert, which the error banner uses).
  error.setAttribute('aria-live', 'assertive');
  const ok = document.createElement('button');
  ok.type = 'submit';
  ok.className = 'mk8-password-ok';
  ok.append(
    Object.assign(document.createElement('span'), { className: 'mk8-slant', textContent: 'OK' }),
  );
  form.append(label, input, error, ok);

  const submit = async () => {
    if (busy) return;
    if (input.value === '') {
      error.textContent = 'Enter the password.';
      input.focus();
      return;
    }
    busy = true;
    form.classList.add('is-busy');
    error.textContent = '';
    let result: LoginResult | undefined;
    try {
      result = await onSubmit(input.value);
    } catch {
      // The network failed; `result` stays unset.
    }
    busy = false;
    form.classList.remove('is-busy');
    if (result === 'ok') return;
    error.textContent = result ? MESSAGES[result] : NETWORK_ERROR;
    input.select();
    input.focus();
  };
  input.addEventListener('input', () => (error.textContent = ''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });

  const screen = menuScreen({
    name: 'password',
    title: 'MK8 Mode',
    sub: 'Password',
    hints: [
      { button: 'a', label: 'OK', onPress: () => void submit() },
      { button: 'b', label: 'Back', onPress: onBack },
    ],
  });
  screen.body.append(form);
  root.append(screen.el);
  panel.append(root);
  // A real keyboard gets the field focused; on touch that would pop the on-screen keyboard.
  if (!document.body.classList.contains('touch')) input.focus();

  // Backspace edits the field, so only Escape goes back.
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onBack();
    },
  };
});

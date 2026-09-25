import {
  colourHex,
  DEFAULT_COLOUR,
  NICKNAME_MAX_LENGTH,
  PROFILE_COLOURS,
  validateNickname,
  type ColourId,
  type Profile,
} from '../../game/profile';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './nickname.css';

export interface NicknameProps {
  /** The saved profile when editing; nothing on first launch. */
  initial?: Profile;
  /** Called with a validated, trimmed nickname. */
  onSave: (profile: Profile) => void;
  /** Editing from the title screen: a Back button that keeps the old name. */
  onBack?: () => void;
}

declare module '../router' {
  interface ScreenProps {
    nickname: NicknameProps;
  }
}

/**
 * Nickname screen (MK-42): a name field and 8 colour swatches. Shown before the title on first
 * launch, and from the title's name chip. The field sits at the top so it stays in view when a
 * phone's on-screen keyboard covers the lower half.
 */
registerScreen('nickname', (panel, { initial, onSave, onBack }) => {
  let colour: ColourId = initial?.colour ?? DEFAULT_COLOUR;

  const form = document.createElement('form');
  form.className = 'nickname-form';
  form.noValidate = true;

  const input = document.createElement('input');
  input.className = 'nickname-input';
  input.type = 'text';
  input.name = 'nickname';
  input.value = initial?.nickname ?? '';
  input.placeholder = 'Your name';
  input.maxLength = NICKNAME_MAX_LENGTH;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'done';
  input.setAttribute('autocapitalize', 'words');
  input.setAttribute('aria-label', 'Nickname');

  const error = document.createElement('p');
  error.className = 'nickname-error';
  error.setAttribute('role', 'alert');

  const swatches = row('nickname-swatches');
  swatches.setAttribute('role', 'radiogroup');
  swatches.setAttribute('aria-label', 'Colour');
  const selectColour = (id: ColourId) => {
    colour = id;
    panel.style.setProperty('--nickname-colour', colourHex(id));
    for (const swatch of swatches.children) {
      swatch.setAttribute('aria-checked', String((swatch as HTMLElement).dataset.colour === id));
    }
  };
  for (const { id, label, hex } of PROFILE_COLOURS) {
    const swatch = button('', () => selectColour(id), 'swatch');
    swatch.dataset.colour = id;
    swatch.style.setProperty('--swatch', hex);
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', label);
    swatches.append(swatch);
  }
  selectColour(colour);

  const go = button(initial ? 'Save' : "Let's go", () => {}, 'primary');
  go.type = 'submit';
  const actions = row('actions');
  if (onBack) actions.append(button('Back', onBack, 'secondary'));
  actions.append(go);

  input.addEventListener('input', () => (error.textContent = ''));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const check = validateNickname(input.value);
    if (!check.ok) {
      error.textContent = check.error;
      input.focus();
      return;
    }
    input.blur();
    onSave({ nickname: check.nickname, colour });
  });

  form.append(input, error, swatches, actions);
  panel.append(heading('h2', initial ? 'Your racer' : "Who's racing?"), form);

  // Phones: when the on-screen keyboard shrinks the viewport, keep the field in view.
  const keepFieldVisible = () => {
    if (!input.isConnected) {
      // The screen has been closed (the router has no unmount hook): stop listening.
      window.visualViewport?.removeEventListener('resize', keepFieldVisible);
      window.removeEventListener('resize', keepFieldVisible);
    } else if (document.activeElement === input) {
      input.scrollIntoView({ block: 'nearest' });
    }
  };
  window.visualViewport?.addEventListener('resize', keepFieldVisible);
  window.addEventListener('resize', keepFieldVisible);
  // Only take focus where there's a real keyboard: on touch it would pop the on-screen keyboard.
  if (!document.body.classList.contains('touch')) input.focus();

  return {
    onKey: (e) => {
      if (e.key === 'Escape' && onBack) onBack();
    },
  };
});

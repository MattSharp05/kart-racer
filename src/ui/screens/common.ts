/** Small DOM helpers shared by the screens (MK-37). */

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  if (className) el.className = className;
  el.addEventListener('click', onClick);
  return el;
}

export function heading(tag: 'h1' | 'h2' | 'h3', text: string, className = ''): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function row(className: string, ...children: HTMLElement[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  el.append(...children);
  return el;
}

/** Sound on/off (MK-26), as the title and pause screens see it. */
export interface SoundControl {
  isMuted(): boolean;
  toggle(): void;
}

/** Appends the sound toggle button; returns a function that re-reads the mute state. */
export function appendSoundToggle(
  parent: HTMLElement,
  sound: SoundControl | undefined,
): () => void {
  if (!sound) return () => {};
  const label = () => (sound.isMuted() ? '🔇 Sound off' : '🔊 Sound on');
  const refresh = () => {
    toggle.textContent = label();
    toggle.dataset.muted = String(sound.isMuted());
  };
  const toggle = button(
    label(),
    () => {
      sound.toggle();
      refresh();
    },
    'sound-toggle',
  );
  toggle.dataset.muted = String(sound.isMuted());
  parent.append(toggle);
  return refresh;
}

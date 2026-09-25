import type { KeyValueStore } from '../game/storage/store';
import type { SoundControl } from './screens/common';

/**
 * Settings sections (MK-43). The Settings screen shows fixed groups (headings); each setting is a
 * section that registers itself under one of them, so a new setting adds a file in
 * `src/ui/settings/` and doesn't edit the screen. A group with no sections to show is left out.
 */
export const SETTINGS_GROUPS = [
  { id: 'sound', heading: 'Sound' },
  { id: 'profile', heading: 'Profile' },
  /** Phone controls (handedness, steering, buttons): touch devices only. */
  { id: 'controls', heading: 'Controls', touchOnly: true },
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id'];

/** What a section can use. Values save to the versioned `game/storage/settings.ts` right away. */
export interface SettingsContext {
  store: KeyValueStore;
  sound?: SoundControl;
}

export interface SettingsSection {
  /** Unique id; also `data-section` on the section's element. */
  id: string;
  group: SettingsGroupId;
  /** Position within the group (lowest first; ties keep registration order). */
  order?: number;
  /** Whether to show it at all, e.g. only once a nickname exists. Default: always. */
  visible?(ctx: SettingsContext): boolean;
  /** Builds the section into `parent`; may return a function that re-reads outside state. */
  render(parent: HTMLElement, ctx: SettingsContext): (() => void) | undefined;
}

const sections: SettingsSection[] = [];

/**
 * Adds a section to the Settings screen (MK-43). Each section module calls this once; registering
 * an id again replaces it (hot reload).
 */
export function registerSettingsSection(section: SettingsSection): void {
  const index = sections.findIndex((s) => s.id === section.id);
  if (index >= 0) sections[index] = section;
  else sections.push(section);
}

/** The sections of `group` to show, in order. */
export function settingsSectionsIn(
  group: SettingsGroupId,
  ctx: SettingsContext,
): SettingsSection[] {
  return sections
    .filter((s) => s.group === group && (s.visible?.(ctx) ?? true))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Removes every section (unit tests only). */
export function clearSettingsSections(): void {
  sections.length = 0;
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A labelled row of pill buttons, one pressed (the mockup's phone settings style). Returns the
 * field element and `set()` to show another value without calling `onChange`.
 */
export function segmentedField<T extends string>(
  label: string,
  options: readonly SegmentedOption<T>[],
  value: T,
  onChange: (value: T) => void,
): { el: HTMLElement; set(value: T): void } {
  const el = document.createElement('div');
  el.className = 'settings-field';
  const name = document.createElement('span');
  name.className = 'settings-label';
  name.textContent = label;
  const group = document.createElement('div');
  group.className = 'settings-seg';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const set = (current: T) => {
    for (const b of group.children) {
      b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.value === current));
    }
  };
  for (const option of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = option.label;
    b.dataset.value = option.value;
    b.addEventListener('click', () => {
      set(option.value);
      onChange(option.value);
    });
    group.append(b);
  }
  set(value);
  el.append(name, group);
  return { el, set };
}

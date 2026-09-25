import { SETTINGS_KEY } from '../../game/storage/settings';
import { readJson, type KeyValueStore } from '../../game/storage/store';
import { registerSettingsSection } from '../settingsSections';

/**
 * The saved nickname and colour id (MK-42 stores them in the settings object), or undefined when
 * the player hasn't picked a name yet. Read raw so this works whether or not MK-42 is merged.
 */
function storedProfile(store: KeyValueStore): { nickname: string; colour: string } | undefined {
  const { nickname, colour } = readJson(store, SETTINGS_KEY);
  if (typeof nickname !== 'string' || nickname.trim() === '') return undefined;
  return { nickname, colour: typeof colour === 'string' ? colour : '' };
}

/** Profile (MK-43): who you race as. Only shown once a nickname exists. */
registerSettingsSection({
  id: 'profile',
  group: 'profile',
  visible: (ctx) => storedProfile(ctx.store) !== undefined,
  render(parent, { store }) {
    const profile = storedProfile(store);
    if (!profile) return;
    const el = document.createElement('div');
    el.className = 'settings-field settings-profile';
    const label = document.createElement('span');
    label.className = 'settings-label';
    label.textContent = 'Racing as';
    const chip = document.createElement('span');
    chip.className = 'settings-profile-chip';
    const dot = document.createElement('span');
    dot.className = 'settings-profile-dot';
    // MK-42's colour ids (red, blue, teal…) are all CSS colour names.
    if (profile.colour) dot.style.background = profile.colour;
    const name = document.createElement('span');
    name.className = 'settings-profile-name';
    name.textContent = profile.nickname;
    chip.append(dot, name);
    el.append(label, chip);
    parent.append(el);
  },
});

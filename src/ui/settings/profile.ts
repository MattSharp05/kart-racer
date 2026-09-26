import { colourHex, readProfile } from '../../game/profile';
import { registerSettingsSection } from '../settingsSections';

/** Profile (MK-43): who you race as (MK-42's nickname and colour). Only shown once a name exists. */
registerSettingsSection({
  id: 'profile',
  group: 'profile',
  visible: (ctx) => readProfile(ctx.store) !== undefined,
  render(parent, { store }) {
    const profile = readProfile(store);
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
    dot.style.background = colourHex(profile.colour);
    const name = document.createElement('span');
    name.className = 'settings-profile-name';
    name.textContent = profile.nickname;
    chip.append(dot, name);
    el.append(label, chip);
    parent.append(el);
  },
});

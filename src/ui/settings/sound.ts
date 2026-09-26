import { registerSettingsSection, segmentedField } from '../settingsSections';

type SoundValue = 'on' | 'off';

/** Sound on/off (MK-26), moved here from the title screen by MK-43. Same switch as the M key. */
registerSettingsSection({
  id: 'sound',
  group: 'sound',
  visible: (ctx) => ctx.sound !== undefined,
  render(parent, { sound }) {
    if (!sound) return;
    const current = (): SoundValue => (sound.isMuted() ? 'off' : 'on');
    const field = segmentedField(
      'Music & effects',
      [
        { value: 'on', label: '🔊 On' },
        { value: 'off', label: '🔇 Off' },
      ],
      current(),
      (value) => {
        if (value !== current()) sound.toggle();
        refresh();
      },
    );
    field.el.classList.add('sound-setting');
    const refresh = () => {
      field.set(current());
      field.el.dataset.muted = String(sound.isMuted());
    };
    refresh();
    parent.append(field.el);
    return refresh;
  },
});

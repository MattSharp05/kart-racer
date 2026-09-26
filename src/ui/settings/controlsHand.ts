import { readSettings, updateSettings, type Hand } from '../../game/storage/settings';
import { setTouchHand } from '../../input/touch';
import { registerSettingsSection, segmentedField } from '../settingsSections';

/**
 * Hand (MK-53): which side the touch buttons are on. Left mirrors the layout (buttons left,
 * steering right). Saved and applied at once, so it changes mid-race from the pause menu too.
 */
registerSettingsSection({
  id: 'hand',
  group: 'controls',
  render(parent, { store }) {
    const field = segmentedField<Hand>(
      'Hand',
      [
        { value: 'right', label: 'Right' },
        { value: 'left', label: 'Left' },
      ],
      readSettings(store).hand,
      (hand) => {
        updateSettings(store, { hand });
        setTouchHand(hand);
        field.el.dataset.hand = hand;
      },
    );
    field.el.classList.add('hand-setting');
    field.el.dataset.hand = readSettings(store).hand;
    parent.append(field.el);
  },
});

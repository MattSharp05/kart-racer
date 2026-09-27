import { registerSettingsSection } from '../settingsSections';
import { button } from '../screens/common';

/**
 * Buttons (MK-57): opens the button editor, where the touch buttons are moved and sized. Under the
 * Controls group (touch only), after Hand.
 */
registerSettingsSection({
  id: 'buttons',
  group: 'controls',
  order: 10,
  visible: (ctx) => ctx.editButtons !== undefined,
  render(parent, { editButtons }) {
    if (!editButtons) return;
    const field = document.createElement('div');
    field.className = 'settings-field buttons-setting';
    const label = document.createElement('span');
    label.className = 'settings-label';
    label.textContent = 'Buttons';
    field.append(label, button('Customise buttons', editButtons, 'settings-buttons-edit'));
    parent.append(field);
  },
});

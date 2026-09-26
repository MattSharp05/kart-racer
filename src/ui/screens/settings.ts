import { isTouchDevice } from '../../input/touch';
import { registerScreen } from '../router';
import { SETTINGS_GROUPS, settingsSectionsIn, type SettingsContext } from '../settingsSections';
import { button, heading } from './common';
import './settings.css';

// Every section module in `ui/settings/` registers itself: a new setting only adds a file there.
import.meta.glob(['../settings/*.ts', '!../settings/*.test.ts'], { eager: true });

export interface SettingsProps extends SettingsContext {
  onBack: () => void;
}

declare module '../router' {
  interface ScreenProps {
    settings: SettingsProps;
  }
}

/**
 * Settings (MK-43), from the title and pause menus: Sound, Profile and (touch devices) Controls.
 * Sections scroll inside the panel when they don't fit; Back (or Esc) returns where it came from.
 */
registerScreen('settings', (panel, props) => {
  const { onBack, ...ctx } = props;
  const body = document.createElement('div');
  body.className = 'settings-body';
  const refreshers: (() => void)[] = [];
  const touch = isTouchDevice();
  for (const group of SETTINGS_GROUPS) {
    if ('touchOnly' in group && group.touchOnly && !touch) continue;
    const sections = settingsSectionsIn(group.id, ctx);
    if (sections.length === 0) continue;
    const el = document.createElement('section');
    el.className = 'settings-group';
    el.dataset.group = group.id;
    el.append(heading('h3', group.heading));
    for (const section of sections) {
      const host = document.createElement('div');
      host.className = 'settings-section';
      host.dataset.section = section.id;
      const refresh = section.render(host, ctx);
      if (refresh) refreshers.push(refresh);
      el.append(host);
    }
    body.append(el);
  }
  const back = button('Back', onBack, 'primary settings-back');
  panel.append(heading('h2', 'Settings'), body, back);
  back.focus();
  return {
    refresh: () => refreshers.forEach((refresh) => refresh()),
    onKey: (e) => {
      if (e.key === 'Escape') onBack();
    },
  };
});

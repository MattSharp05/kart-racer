import type { EngineClass } from '../../sim/tuning';
import { registerScreen } from '../router';
import { button, heading } from './common';
import './ccSelect.css';

export interface CcSelectProps {
  initial: EngineClass;
  onChoose: (cc: EngineClass) => void;
  onBack: () => void;
}

declare module '../router' {
  interface ScreenProps {
    ccSelect: CcSelectProps;
  }
}

const CLASSES = [50, 100, 150] as const;
const LABELS: Record<EngineClass, string> = {
  50: '50cc · Easy',
  100: '100cc · Normal',
  150: '150cc · Fast',
};

/** Engine class select (MK-25): ← → move between the classes, Esc goes back. */
registerScreen('ccSelect', (panel, handlers) => {
  const options = document.createElement('div');
  options.className = 'actions cc';
  const buttons = CLASSES.map((cc) => {
    const b = button(
      LABELS[cc],
      () => handlers.onChoose(cc),
      cc === handlers.initial ? 'primary' : '',
    );
    b.dataset.cc = String(cc);
    return b;
  });
  options.append(...buttons);
  panel.append(heading('h2', 'Engine class'), options, button('Back', handlers.onBack));
  buttons[CLASSES.indexOf(handlers.initial)]?.focus();
  return {
    onKey: (e) => {
      if (e.key === 'Escape') handlers.onBack();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
        next?.focus();
      }
    },
  };
});

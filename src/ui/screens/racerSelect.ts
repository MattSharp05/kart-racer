import type { KartId } from '../../sim/data/karts';
import { createRacerPicker } from '../components/racerPicker';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './racerSelect.css';

export interface RacerSelectProps {
  initial: KartId;
  onChange: (kart: KartId) => void;
  onChoose: (kart: KartId) => void;
  onBack: () => void;
  /** While true the 3D preview holds still. */
  isPaused?: () => boolean;
}

declare module '../router' {
  interface ScreenProps {
    racerSelect: RacerSelectProps;
  }
}

/**
 * Racer select (MK-25, MK-51): a card per registered racer with the selected one's turntable and
 * stats. Arrow keys (or a tap) pick, Enter or Choose goes on, Esc goes back.
 */
registerScreen('racerSelect', (panel, props) => {
  const picker = createRacerPicker({
    initial: props.initial,
    onChange: props.onChange,
    onChoose: props.onChoose,
    isPaused: props.isPaused,
  });
  panel.append(
    heading('h2', 'Choose your racer'),
    picker.element,
    row('actions', button('Back', props.onBack), button('Choose', picker.choose, 'primary')),
  );
  picker.focus();
  return {
    onKey: (e) => {
      if (picker.onKey(e)) return;
      if (e.key === 'Escape') props.onBack();
    },
    dispose: picker.dispose,
  };
});

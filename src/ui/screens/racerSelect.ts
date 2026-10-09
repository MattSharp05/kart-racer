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
  /** Whose pick this is in a local multiplayer race (MK-144): "P2" → "P2, choose your racer". */
  player?: string;
  /** The "Players" option (MK-144): how many race on this screen, 1 to `max`. */
  players?: { count: number; max: number; onChange: (count: number) => void };
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
  const title = props.player ? `${props.player}, choose your racer` : 'Choose your racer';
  const players = props.players ? playersOption(props.players) : undefined;
  panel.append(
    players ? row('racer-select-head', heading('h2', title), players) : heading('h2', title),
    picker.element,
    row('actions', button('Back', props.onBack), button('Choose', picker.choose, 'primary')),
  );
  picker.focus();
  return {
    onKey: (e) => {
      // 1–4 set the Players option (MK-144).
      const count = Number(e.key);
      if (props.players && Number.isInteger(count) && count >= 1 && count <= props.players.max) {
        props.players.onChange(count);
        return;
      }
      if (picker.onKey(e)) return;
      if (e.key === 'Escape') props.onBack();
    },
    dispose: picker.dispose,
  };
});

/** "Players 1 2 3 4" (MK-144): a button per count, the current one pressed. */
function playersOption({
  count,
  max,
  onChange,
}: NonNullable<RacerSelectProps['players']>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'players-option';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Players');
  const label = document.createElement('span');
  label.textContent = 'Players';
  group.append(label);
  for (let n = 1; n <= max; n += 1) {
    const b = button(String(n), () => onChange(n), n === count ? 'selected' : '');
    b.dataset.players = String(n);
    b.setAttribute('aria-pressed', String(n === count));
    group.append(b);
  }
  return group;
}

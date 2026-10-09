import type { SplitLayout } from '../../render/viewports';
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
  /** Two players' split-screen (MK-145): top/bottom or side by side; shown with 2 players. */
  split?: { layout: SplitLayout; onChange: (layout: SplitLayout) => void };
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
  const split = props.split && props.players?.count === 2 ? splitOption(props.split) : undefined;
  const options = [players, split].filter((el): el is HTMLElement => el !== undefined);
  panel.append(
    options.length
      ? row('racer-select-head', heading('h2', title), ...options)
      : heading('h2', title),
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

/** A screen split in two, as a small picture: a line across (stacked) or down (side by side). */
function splitIcon(layout: SplitLayout): string {
  const line = layout === 'stacked' ? 'M2 9H22' : 'M12 2V16';
  return `<svg viewBox="0 0 24 18" width="24" height="18" aria-hidden="true"><rect x="2" y="2" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="${line}" stroke="currentColor" stroke-width="2"/></svg>`;
}

/** The 2-player split (MK-145): "Screen" and a button per layout, the current one pressed. */
function splitOption({ layout, onChange }: NonNullable<RacerSelectProps['split']>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'split-option';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Split screen');
  const label = document.createElement('span');
  label.textContent = 'Screen';
  group.append(label);
  const choices: [SplitLayout, string][] = [
    ['stacked', 'Top and bottom'],
    ['side', 'Side by side'],
  ];
  for (const [value, name] of choices) {
    const b = button('', () => onChange(value), value === layout ? 'selected' : '');
    b.innerHTML = splitIcon(value);
    b.dataset.split = value;
    b.title = name;
    b.setAttribute('aria-label', name);
    b.setAttribute('aria-pressed', String(value === layout));
    group.append(b);
  }
  return group;
}

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

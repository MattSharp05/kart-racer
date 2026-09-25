import { KART_IDS, kartDef, type KartId } from '../../sim/data/karts';
import { registerScreen } from '../router';
import { button, heading, row } from './common';
import './kartSelect.css';

export interface KartSelectProps {
  initial: KartId;
  onChange: (kart: KartId) => void;
  onChoose: (kart: KartId) => void;
  onBack: () => void;
}

declare module '../router' {
  interface ScreenProps {
    kartSelect: KartSelectProps;
  }
}

const STAT_LABELS = [
  ['speed', 'Speed'],
  ['acceleration', 'Acceleration'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
] as const;

/** Kart select (MK-25): ‹ › (or arrow keys) cycle the karts and their stats; Esc goes back. */
registerScreen('kartSelect', (panel, handlers) => {
  let index = Math.max(0, KART_IDS.indexOf(handlers.initial));
  const prev = button('‹', () => move(-1), 'arrow');
  prev.setAttribute('aria-label', 'Previous kart');
  const next = button('›', () => move(1), 'arrow');
  next.setAttribute('aria-label', 'Next kart');
  const info = document.createElement('div');
  info.className = 'kart-info';
  const choose = button('Choose', () => handlers.onChoose(kart()), 'primary');
  panel.append(
    heading('h2', 'Choose your kart'),
    row('kart-card', prev, info, next),
    row('actions', button('Back', handlers.onBack), choose),
  );

  const kart = () => KART_IDS[index] ?? 'maple';
  const render = () => {
    const def = kartDef(kart());
    info.replaceChildren();
    const tagline = document.createElement('p');
    tagline.textContent = def.tagline;
    const stats = document.createElement('dl');
    stats.className = 'stats';
    for (const [key, label] of STAT_LABELS) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.setAttribute('aria-label', `${label} ${def.stats[key]} of 5`);
      for (let i = 1; i <= 5; i += 1) {
        const pip = document.createElement('span');
        pip.className = i <= def.stats[key] ? 'pip on' : 'pip';
        dd.append(pip);
      }
      stats.append(dt, dd);
    }
    info.append(heading('h3', def.name), tagline, stats);
    info.dataset.kart = kart();
    handlers.onChange(kart());
  };
  const move = (delta: number) => {
    index = (index + delta + KART_IDS.length) % KART_IDS.length;
    render();
  };
  render();
  choose.focus();
  return {
    onKey: (e) => {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'Escape') handlers.onBack();
    },
  };
});

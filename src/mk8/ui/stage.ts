// The screen MK8 Mode's model scenarios draw on (MK-101): the MK8 header, a full-width 3D stage
// with its labels, and Back.
import { registerScreen } from '../../ui/router';
import { backFooter, backKeys, frame } from './loading';
import './stage.css';

export interface Mk8StageProps {
  title: string;
  /** Puts the stage into `host`; returns what frees it when the screen goes away. */
  mount(host: HTMLElement): () => void;
  onBack: () => void;
}

declare module '../../ui/router' {
  interface ScreenProps {
    mk8Stage: Mk8StageProps;
  }
}

registerScreen('mk8Stage', (panel, { title, mount, onBack }) => {
  const body = frame(panel, title);
  panel.classList.add('mk8-stage-screen');
  const host = document.createElement('div');
  host.className = 'mk8-stage';
  body.append(host);
  backFooter(panel, onBack);
  const unmount = mount(host);
  return { onKey: backKeys(onBack), dispose: unmount };
});

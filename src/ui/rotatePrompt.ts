import { isTouchDevice } from '../input/touch';
import './rotatePrompt.css';

/**
 * "Rotate your device" for touch devices held in portrait (MK-23). Pauses the game while shown
 * (only if it was running) and resumes it when rotated back. On the first tap it also tries
 * fullscreen + landscape lock, which works on Android; iOS just keeps the prompt.
 */
export class RotatePrompt {
  readonly root = document.createElement('div');
  shown = false;
  private pausedByUs = false;
  private readonly portrait = window.matchMedia('(orientation: portrait)');
  onChange: () => void = () => {};

  constructor(
    private readonly pause: () => boolean,
    private readonly resume: () => void,
  ) {
    this.root.className = 'rotate-prompt';
    this.root.innerHTML = '<div class="rotate-icon">📱↻</div><p>Rotate your device to play</p>';
    this.root.hidden = true;
    document.body.append(this.root);
    if (!isTouchDevice()) return;
    this.portrait.addEventListener('change', () => this.update());
    this.update();
    window.addEventListener('pointerdown', () => void this.goFullscreen(), { once: true });
  }

  private update(): void {
    const shown = this.portrait.matches;
    if (shown === this.shown) return;
    this.shown = shown;
    this.root.hidden = !shown;
    if (shown) this.pausedByUs = this.pause();
    else if (this.pausedByUs) {
      this.pausedByUs = false;
      this.resume();
    }
    this.onChange();
  }

  private async goFullscreen(): Promise<void> {
    try {
      await document.documentElement.requestFullscreen?.();
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // Not supported (iOS) or refused: the rotate prompt covers it.
    }
  }
}

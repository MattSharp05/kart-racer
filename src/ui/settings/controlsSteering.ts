import {
  readSettings,
  TILT_NEUTRAL_MAX,
  TILT_SENSITIVITY,
  updateSettings,
  type Settings,
  type Steering,
} from '../../game/storage/settings';
import type { KeyValueStore } from '../../game/storage/store';
import { applySteering, requestTiltPermission, tilt, tiltNeedsPermission } from '../../input/tilt';
import { registerSettingsSection, segmentedField } from '../settingsSections';
import { showToast } from '../toast';
import './controlsSteering.css';

/** Shown when motion access is refused (MK-54). */
export const TILT_DENIED_MESSAGE = 'Motion access was not allowed, so steering stays on Drag.';

/** Shown when Tilt gets no motion readings: the device has no gyro (MK-87). */
export const TILT_NO_READINGS_MESSAGE =
  'This device sent no motion readings, so steering is back on Drag.';

/**
 * Open Steering sections, to show a change made elsewhere (the launch fallback), with an optional
 * notice; each says whether it's still on screen.
 */
const openViews = new Set<(notice?: string) => boolean>();

/**
 * Saves drag steering and applies it: tilt was refused or sends nothing. A `notice` shows in an
 * open Steering section, else as a toast.
 */
function fallBackToDrag(store: KeyValueStore, notice?: string): Settings {
  const settings = updateSettings(store, { steering: 'drag' });
  applySteering(settings);
  let shown = false;
  openViews.forEach((refresh) => (shown = refresh(notice) || shown));
  if (notice && !shown) showToast(notice);
  return settings;
}

/**
 * Tilt is on and allowed: if no motion reading arrives in `TILT_NO_READINGS_SECONDS`, back to Drag
 * with a notice (MK-87).
 */
function watchTiltReadings(store: KeyValueStore): void {
  tilt.expectReadings(() => {
    if (readSettings(store).steering === 'tilt') fallBackToDrag(store, TILT_NO_READINGS_MESSAGE);
  });
}

/**
 * The saved steering at launch (MK-54). Tilt on iOS needs motion access again on each visit, which
 * only a tap can ask for: the first tap anywhere asks (iOS doesn't prompt again once allowed). If
 * it's refused, steering falls back to Drag with a notice, and so it does if no motion readings
 * arrive once allowed (MK-87).
 */
export function restoreSteering(store: KeyValueStore): void {
  const settings = readSettings(store);
  applySteering(settings);
  if (settings.steering !== 'tilt') return;
  if (!tiltNeedsPermission()) return watchTiltReadings(store);
  const listen = (on: boolean) => {
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('touchend', ask);
    window[method]('click', ask);
  };
  const ask = () => {
    listen(false);
    void requestTiltPermission().then((answer) => {
      if (readSettings(store).steering !== 'tilt') return;
      if (answer === 'granted') return watchTiltReadings(store);
      // A swipe isn't a tap: iOS wouldn't ask. Try again on the next one.
      if (answer === 'failed') return listen(true);
      fallBackToDrag(store);
      showToast(TILT_DENIED_MESSAGE);
    });
  };
  listen(true);
}

/** `12.5` → `"13° right"`, `-4` → `"4° left"`, `0` → `"level"`. */
export function describeTilt(degrees: number): string {
  const rounded = Math.round(degrees);
  if (rounded === 0) return 'level';
  return `${Math.abs(rounded)}° ${rounded > 0 ? 'right' : 'left'}`;
}

/**
 * Steering (MK-54): Drag (default) or Tilt. Choosing Tilt asks for motion access from that tap
 * (iOS); refused, or no motion readings within 2 s (MK-87) → back to Drag with a message. With Tilt: a sensitivity slider (degrees for full
 * lock) and Calibrate, which saves how the player holds the phone as straight ahead. Saved and
 * applied at once, mid-race too.
 */
registerSettingsSection({
  id: 'steering',
  group: 'controls',
  order: 1,
  render(parent, { store }) {
    const saved = readSettings(store);
    const message = document.createElement('p');
    message.className = 'steering-message';
    message.setAttribute('role', 'status');
    message.hidden = true;

    const field = segmentedField<Steering>(
      'Steering',
      [
        { value: 'drag', label: 'Drag' },
        { value: 'tilt', label: 'Tilt' },
      ],
      saved.steering,
      (steering) => void choose(steering),
    );
    field.el.classList.add('steering-setting');

    // Tilt options: only while tilt is on.
    const options = document.createElement('div');
    options.className = 'tilt-options';

    const sensitivity = document.createElement('label');
    sensitivity.className = 'settings-field tilt-sensitivity';
    const sensitivityName = document.createElement('span');
    sensitivityName.className = 'settings-label';
    sensitivityName.textContent = 'Full lock at';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(TILT_SENSITIVITY.min);
    slider.max = String(TILT_SENSITIVITY.max);
    slider.step = '1';
    slider.value = String(saved.tiltSensitivity);
    const sensitivityValue = document.createElement('output');
    sensitivityValue.className = 'tilt-sensitivity-value';
    const showSensitivity = () => (sensitivityValue.textContent = `${slider.value}°`);
    slider.addEventListener('input', () => {
      showSensitivity();
      applySteering(updateSettings(store, { tiltSensitivity: Number(slider.value) }));
    });
    showSensitivity();
    const sliderRow = document.createElement('span');
    sliderRow.className = 'tilt-slider';
    sliderRow.append(slider, sensitivityValue);
    sensitivity.append(sensitivityName, sliderRow);

    const calibrate = document.createElement('div');
    calibrate.className = 'settings-field tilt-calibrate';
    const hint = document.createElement('span');
    hint.className = 'tilt-hint';
    const showNeutral = (neutral: number) =>
      (hint.textContent = `Hold the phone how you like to play, then tap Calibrate. Straight ahead: ${describeTilt(neutral)}.`);
    showNeutral(saved.tiltNeutral);
    const calibrateButton = document.createElement('button');
    calibrateButton.type = 'button';
    calibrateButton.textContent = 'Calibrate';
    calibrateButton.addEventListener('click', () => {
      const neutral = Math.max(-TILT_NEUTRAL_MAX, Math.min(TILT_NEUTRAL_MAX, tilt.angle()));
      applySteering(updateSettings(store, { tiltNeutral: neutral }));
      showNeutral(neutral);
      calibrateButton.textContent = 'Calibrated ✓';
    });
    calibrate.append(hint, calibrateButton);
    options.append(sensitivity, calibrate);

    const show = (steering: Steering) => {
      field.set(steering);
      field.el.dataset.steering = steering;
      options.hidden = steering !== 'tilt';
    };

    async function choose(steering: Steering): Promise<void> {
      message.hidden = true;
      if (steering === 'drag') {
        show('drag');
        applySteering(updateSettings(store, { steering }));
        return;
      }
      // Asked from this tap: iOS only shows its prompt from a user gesture.
      // Only a refusal falls back: `failed` means nothing was asked (Chrome's `prompt`).
      if ((await requestTiltPermission()) === 'denied') {
        show(fallBackToDrag(store).steering);
        message.textContent = TILT_DENIED_MESSAGE;
        message.hidden = false;
        return;
      }
      show('tilt');
      applySteering(updateSettings(store, { steering }));
      watchTiltReadings(store);
    }

    show(saved.steering);
    parent.append(field.el, message, options);
    const refresh = (notice?: string): boolean => {
      if (!parent.isConnected) {
        openViews.delete(refresh);
        return false;
      }
      show(readSettings(store).steering);
      if (notice) {
        message.textContent = notice;
        message.hidden = false;
      }
      return true;
    };
    openViews.add(refresh);
    return () => void refresh();
  },
});

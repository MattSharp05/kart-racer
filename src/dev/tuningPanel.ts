import GUI from 'lil-gui';
import { tuning } from '../sim/tuning';

/** Dev-only live tuning panel for `?tune=1` (loaded lazily so it never ships in the main chunk). */
export function openTuningPanel(): GUI {
  const gui = new GUI({ title: 'Tuning (?tune=1)' });

  const speed = gui.addFolder('Top speed (m/s)');
  speed.add(tuning.topSpeed, 50, 5, 60, 0.5).name('50cc');
  speed.add(tuning.topSpeed, 100, 5, 60, 0.5).name('100cc');
  speed.add(tuning.topSpeed, 150, 5, 60, 0.5).name('150cc');

  const engine = gui.addFolder('Engine & brakes');
  engine.add(tuning, 'timeTo95', 0.5, 6, 0.1).name('0→95% time (s)');
  engine.add(tuning, 'brakeDecel', 2, 60, 1).name('brake (m/s²)');
  engine.add(tuning, 'coastDecel', 0, 20, 0.5).name('coast drag (m/s²)');
  engine.add(tuning, 'reverseFraction', 0.1, 1, 0.05).name('reverse speed ×');

  const handling = gui.addFolder('Handling');
  handling.add(tuning, 'maxYawRate', 0.3, 5, 0.05).name('turn rate (rad/s)');
  handling.add(tuning, 'steerFullAt', 0.05, 1, 0.05).name('full steer at ×top');
  handling.add(tuning, 'steerAtTopSpeed', 0.2, 1.5, 0.05).name('steer at top speed');
  handling.add(tuning, 'lateralGrip', 0.5, 30, 0.5).name('grip');
  handling.add(tuning, 'wallSpeedKeep', 0, 1, 0.05).name('wall speed kept');

  const drift = gui.addFolder('Drift & boost');
  drift.add(tuning, 'driftYaw', 0.3, 4, 0.05).name('drift turn rate');
  drift.add(tuning, 'driftYawRange', 0, 2, 0.05).name('in/out steer range');
  drift.add(tuning, 'driftGrip', 0.2, 10, 0.1).name('drift grip');
  drift.add(tuning, 'driftMinSpeed', 0, 1, 0.05).name('min speed ×top');
  drift.add(tuning.driftTiers, 0, 0.1, 5, 0.05).name('blue at (s)');
  drift.add(tuning.driftTiers, 1, 0.1, 6, 0.05).name('orange at (s)');
  drift.add(tuning.driftTiers, 2, 0.1, 8, 0.05).name('purple at (s)');
  drift.add(tuning.miniTurboSeconds, 0, 0, 3, 0.05).name('blue boost (s)');
  drift.add(tuning.miniTurboSeconds, 1, 0, 3, 0.05).name('orange boost (s)');
  drift.add(tuning.miniTurboSeconds, 2, 0, 3, 0.05).name('purple boost (s)');
  drift.add(tuning, 'boostSpeed', 1, 2, 0.05).name('boost speed ×');
  drift.add(tuning, 'hopVelocity', 0, 10, 0.25).name('hop strength');

  gui
    .add(
      {
        copy: () => {
          void navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
        },
      },
      'copy',
    )
    .name('📋 Copy values as JSON');

  return gui;
}

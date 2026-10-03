// MK8 Grand Prix podium (MK-130, the approved mockup's screen 10): after a cup's last race, the top
// 3 of the standings on the steps in 3D (`render/podium.ts`) over the last course's award
// background, the trophy the player won and confetti; their names under the steps; your place and
// trophy in a banner. OK leaves for MK8 Mode's menus. Not a menu-flow screen (no `screen` export):
// `raceScreens.ts` shows it in its own MK8 stack.
import { trackLoad } from '../../../game/pending';
import type { Trophy } from '../../gp/grandPrix';
import { PodiumScene, type PodiumRacer } from '../../render/podium';
import { Mk8Stage } from '../../render/stage';
import { buttonBar, header } from '../kit';
import { menuAction } from '../kit/nav';
import type { Mk8ScreenFactory } from '../stack';
import './podium.css';

/** A row of the final standings the podium names. */
export interface PodiumRow extends PodiumRacer {
  name: string;
  place: number;
  total: number;
  you: boolean;
}

export interface PodiumOptions {
  /** The cup's name… */
  title: string;
  /** …and the engine class. */
  sub: string;
  /** The final standings, leader first (the first 3 stand on the steps). */
  standings: readonly PodiumRow[];
  /** The player's final place. */
  place: number;
  /** The trophy the player won (none past 3rd). */
  trophy: Trophy | undefined;
  /** The award background's URL (the last course's), if the pack has it. */
  background: string | undefined;
  /** Loads what the pack has of the podium's models (resolves without a pack too). */
  load: () => Promise<void>;
  /** A loaded pack file's bytes. */
  file: (path: string) => ArrayBuffer | undefined;
  /** Hold the confetti still (tests, `&paused=1`). */
  frozen: boolean;
  onDone: () => void;
}

const TROPHY_LABEL: Record<Trophy, string> = {
  gold: 'Gold trophy!',
  silver: 'Silver trophy!',
  bronze: 'Bronze trophy!',
};

/** 1st, 2nd, 3rd, 4th… */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** The podium's steps left to right: 2nd, 1st, 3rd. */
const STEP_ORDER = [1, 0, 2];

export function podiumScreen(options: PodiumOptions): Mk8ScreenFactory {
  return (stack) => {
    const el = document.createElement('section');
    el.className = 'mk8-scr mk8-scr-podium';
    el.dataset.place = String(options.place);
    el.dataset.trophy = options.trophy ?? 'none';
    el.dataset.status = 'loading';
    if (options.background) el.style.setProperty('--mk8-podium-bg', `url("${options.background}")`);
    const body = document.createElement('div');
    body.className = 'mk8-body mk8-podium';
    const view = document.createElement('div');
    view.className = 'mk8-podium-stage';

    const top = options.standings.slice(0, 3);
    const names = document.createElement('div');
    names.className = 'mk8-podium-names';
    for (const index of STEP_ORDER) {
      const row = top[index];
      const plate = document.createElement('div');
      plate.className = 'mk8-podium-name';
      if (row) {
        plate.dataset.place = String(row.place);
        plate.dataset.racer = row.racer;
        plate.classList.toggle('is-you', row.you);
        const n = document.createElement('b');
        n.textContent = ordinal(row.place);
        const name = document.createElement('span');
        name.textContent = row.name;
        const pts = document.createElement('small');
        pts.textContent = `${row.total} pts`;
        plate.append(n, name, pts);
      }
      names.append(plate);
    }

    const banner = document.createElement('div');
    banner.className = 'mk8-podium-rank';
    const rank = document.createElement('b');
    rank.textContent = ordinal(options.place);
    const prize = document.createElement('span');
    prize.textContent = options.trophy ? TROPHY_LABEL[options.trophy] : 'No trophy this time';
    banner.append(rank, prize);
    body.append(view, names, banner);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stack.sounds.play('ui/decide');
      options.onDone();
    };
    el.append(
      header(options.title, options.sub),
      body,
      buttonBar([{ button: 'a', label: 'OK', onPress: finish }]),
    );

    let disposed = false;
    let stage: Mk8Stage | undefined;
    let scene: PodiumScene | undefined;
    const open = async () => {
      await options.load();
      if (disposed) return;
      const made = new Mk8Stage(options.frozen);
      made.canvas.classList.add('mk8-podium-canvas');
      const built = await PodiumScene.build(
        made,
        top,
        options.trophy,
        options.file,
        options.background,
      );
      if (disposed) {
        built.dispose();
        made.dispose();
        return;
      }
      stage = made;
      scene = built;
      view.append(made.canvas);
      made.start(built);
      el.dataset.models = built.info.models;
      el.dataset.racers = built.info.racers.join(' ');
      el.dataset.status = 'ready';
    };
    void trackLoad(
      open().catch((e: unknown) => {
        // No 3D (no WebGL): the names and banner still say who won.
        el.dataset.status = 'unavailable';
        console.warn('MK8 podium:', e);
      }),
    );
    if (options.trophy) stack.sounds.play('race/finish');

    return {
      el,
      onKey: (e) => {
        const action = menuAction(e.key);
        if (action?.kind === 'ok') {
          e.preventDefault();
          finish();
          return true;
        }
        // No going back to the standings.
        return action !== undefined;
      },
      dispose: () => {
        disposed = true;
        scene?.dispose();
        stage?.dispose();
      },
    };
  };
}

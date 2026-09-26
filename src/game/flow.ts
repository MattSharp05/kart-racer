import { SoundManager } from '../audio/soundManager';
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import type { World } from '../render/world';
import { attractMode, sunnyLineup } from '../scenarios/menus';
import type { ScenarioView } from '../scenarios/registry';
import { isKartId, KART_IDS, type KartId } from '../sim/data/karts';
import { createRace } from '../sim/race/createRace';
import type { EngineClass } from '../sim/tuning';
import type { SimEvent, SimState } from '../sim/types';
import { Hud } from '../ui/hud/hud';
import { RotatePrompt } from '../ui/rotatePrompt';
import { Router } from '../ui/router';
import '../ui/screens/ccSelect';
import type { SoundControl } from '../ui/screens/common';
import { HowToPlay } from '../ui/screens/howToPlay';
import '../ui/screens/kartSelect';
import '../ui/screens/nickname';
import { createPauseButton } from '../ui/screens/pause';
import '../ui/screens/results';
import '../ui/screens/settings';
import '../ui/screens/title';
import {
  clearProfile,
  colourHex,
  DEFAULT_COLOUR,
  readProfile,
  saveProfile,
  type Profile,
} from './profile';
import type { OnlineLaunch } from './online';
import { recordFinish, recordLines, resultLines } from './results';
import { RoomFlow, type RoomService } from './roomFlow';
import { DEFAULT_SEED, localKartOf, type Launch, type RaceSession } from './session';
import { readPrefs, writePrefs } from './storage/prefs';
import type { RecordUpdate } from './storage/records';
import { hasSeenHowToPlay, markHowToPlaySeen } from './storage/settings';
import type { KeyValueStore } from './storage/store';

/** Pause between the player finishing and the results screen, ms. */
const RESULTS_DELAY_MS = 2500;
/** Results for a scenario that boots already finished, ms. */
const LAUNCH_RESULTS_DELAY_MS = 300;
const ENGINE_CLASSES = [50, 100, 150] as const;
/** A room name for a player who hasn't picked one (scenarios skip the nickname screen). */
const DEFAULT_ROOM_NICKNAME = 'Player';

/**
 * The screen flow (MK-35): title → kart select → cc select → race ⇄ pause → results → (again,
 * change kart, title). `screens.current` is the state; each `show*` method is a transition. Also
 * owns the DOM overlays that follow the flow (HUD, sound, pause button, rotate prompt).
 */
export class Flow {
  // Created in the same order as before MK-35, so the DOM overlays stack the same way.
  private readonly hud = new Hud();
  private readonly screens = new Router();
  private readonly sound: SoundManager;
  private readonly soundControl: SoundControl;
  private readonly howToPlay: HowToPlay;
  private readonly pauseButton: HTMLButtonElement;
  private readonly rotatePrompt: RotatePrompt;
  private chosenKart: KartId;
  private chosenCc: EngineClass;
  private raceCount = 0;
  private resultsTimer: number | undefined;
  /** What the local player's finish did to the track records, for the results screen. */
  private recordUpdate: RecordUpdate | undefined;
  private readonly rooms: RoomFlow;

  constructor(
    private readonly session: RaceSession,
    private readonly world: World,
    private readonly store: KeyValueStore,
    rooms: RoomService,
  ) {
    const game = session.game;
    const prefs = readPrefs(store);
    this.chosenKart = prefs.kart && isKartId(prefs.kart) ? prefs.kart : 'maple';
    this.chosenCc = ENGINE_CLASSES.find((cc) => cc === prefs.engineClass) ?? 100;

    this.sound = new SoundManager(store, () => this.screens.refresh());
    this.soundControl = {
      isMuted: () => this.sound.isMuted,
      toggle: () => this.sound.toggleMute(),
    };
    this.howToPlay = new HowToPlay();
    // Online rooms (MK-40): the room shows the player's name and colour (MK-42).
    this.rooms = new RoomFlow(
      this.screens,
      rooms,
      () => {
        const profile = readProfile(this.store);
        return {
          nickname: profile?.nickname ?? DEFAULT_ROOM_NICKNAME,
          colour: colourHex(profile?.colour ?? DEFAULT_COLOUR),
          racer: this.chosenKart,
          ready: false,
        };
      },
      () => this.showTitleScreen(),
      {
        tracks: tracks.list().filter((t) => !t.testOnly),
        racers: racers.list(),
      },
      this.startOnlineRace,
      (racer) => {
        if (isKartId(racer)) this.chosenKart = racer;
      },
    );

    this.pauseButton = createPauseButton(() => this.pauseRace());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.screens.current === 'none' && !this.pauseButton.hidden) {
        this.pauseRace();
      }
    });

    game.onEvents((events, state) => this.onEvents(events, state));

    // Phones: landscape only. Portrait shows a prompt and pauses the game until rotated back.
    this.rotatePrompt = new RotatePrompt(
      () => {
        if (game.paused) return false;
        game.pause();
        return true;
      },
      () => game.resume(),
    );
    this.rotatePrompt.onChange = () => world.markChanged();

    world.onUpdate = () => {
      const menu = this.screens.current;
      this.hud.update(game.state, session.localKartId, performance.now(), menu !== 'none');
      this.sound.update(game.state, {
        menu: menu !== 'none' && menu !== 'paused',
        paused: game.paused,
        followId: world.followId,
      });
      session.controls.touch.setActive(menu === 'none' && !this.rotatePrompt.shown);
    };
  }

  /** Opens the launch screen (menus or a direct race). */
  open(launch: Launch): void {
    const game = this.session.game;
    this.pauseButton.hidden = launch.screen !== undefined || launch.state.phase === 'free';
    switch (launch.screen) {
      case 'title':
      case 'howToPlay': {
        game.setAutopilot(launch.localKartId, true);
        const toTitle = () => {
          this.showTitleScreen();
          // A room link or the online-lobby scenario (MK-40): straight into that room.
          if (launch.lobby) return this.rooms.launch(launch.lobby);
          // First visit (plain URL, nothing stored): show the controls guide straight away.
          if (
            launch.screen === 'howToPlay' ||
            (!launch.scenario && !hasSeenHowToPlay(this.store))
          ) {
            this.openHowToPlay();
          }
        };
        // First launch (plain URL, no name saved yet): pick a nickname before the title (MK-42).
        if (!launch.scenario && !readProfile(this.store)) this.showNickname(toTitle);
        else toTitle();
        break;
      }
      case 'nickname':
        // The first-launch scenario: forget the saved name so the screen starts empty.
        clearProfile(this.store);
        game.setAutopilot(launch.localKartId, true);
        this.showNickname(() => this.showTitleScreen());
        break;
      case 'settings':
        this.showTitleScreen();
        game.setAutopilot(launch.localKartId, true);
        this.showSettings();
        break;
      case 'kartSelect':
        this.showKartSelect();
        break;
      case 'ccSelect':
        this.focusLineupKart(this.chosenKart, true);
        this.showCcSelect();
        break;
      case 'paused':
        this.pauseButton.hidden = false;
        this.pauseRace();
        break;
      default:
        if (launch.state.phase === 'finished') {
          this.resultsTimer = window.setTimeout(this.showResults, LAUNCH_RESULTS_DELAY_MS);
        }
    }
  }

  // Transitions are arrow properties so they can be passed straight to menu handlers.

  /** Opens the controls guide (MK-32); closing it counts as "seen" so it won't pop up again. */
  private readonly openHowToPlay = (): void => {
    this.howToPlay.open(() => markHowToPlaySeen(this.store));
  };

  private readonly showTitle = (): void => {
    this.rooms.leave();
    this.session.stop();
    this.load(attractMode(DEFAULT_SEED + this.raceCount), 'chase');
    // An AI race runs behind the title; the "player" kart drives itself too.
    this.session.game.setAutopilot(this.session.localKartId, true);
    this.session.game.resume();
    this.pauseButton.hidden = true;
    this.showTitleScreen();
  };

  private showTitleScreen(): void {
    const profile = readProfile(this.store);
    this.screens.show('title', {
      onPlay: this.showKartSelect,
      onOnline: () => this.rooms.showOnline(),
      onHowToPlay: this.openHowToPlay,
      onSettings: this.showSettings,
      ...(profile && {
        player: { nickname: profile.nickname, colour: colourHex(profile.colour) },
        onEditName: () => this.showNickname(() => this.showTitleScreen(), profile),
      }),
    });
  }

  /** Nickname and colour (MK-42): on first launch (no way back), or edited from the title. */
  private showNickname(then: () => void, initial?: Profile): void {
    this.screens.show('nickname', {
      onSave: (profile) => {
        saveProfile(this.store, profile);
        then();
      },
      ...(initial && { initial, onBack: () => this.showTitleScreen() }),
    });
  }

  /** Settings (MK-43) over the title or the pause menu; Back returns there. */
  private readonly showSettings = (): void => {
    this.screens.show('settings', {
      store: this.store,
      sound: this.soundControl,
      onBack: () => this.screens.back(),
    });
  };

  private readonly showKartSelect = (): void => {
    if (this.screens.current !== 'ccSelect') this.load(sunnyLineup(DEFAULT_SEED), 'lineup');
    this.pauseButton.hidden = true;
    this.session.game.resume();
    this.focusLineupKart(this.chosenKart, true);
    this.screens.show('kartSelect', {
      initial: this.chosenKart,
      onChange: (kart) => this.focusLineupKart(kart),
      onChoose: (kart) => {
        this.chosenKart = kart;
        this.showCcSelect();
      },
      onBack: this.showTitle,
    });
  };

  private readonly showCcSelect = (): void => {
    this.screens.show('ccSelect', {
      initial: this.chosenCc,
      onChoose: (cc) => {
        this.chosenCc = cc;
        writePrefs(this.store, { kart: this.chosenKart, engineClass: this.chosenCc });
        this.startRace();
      },
      onBack: this.showKartSelect,
    });
  };

  private readonly startRace = (): void => {
    this.raceCount += 1;
    this.screens.hide();
    this.beforeLoad();
    this.session.startRace({
      seed: DEFAULT_SEED + this.raceCount,
      engineClass: this.chosenCc,
      playerKart: this.chosenKart,
    });
    this.world.reset('chase', this.session.localKartId);
    this.session.game.resume();
    this.pauseButton.hidden = false;
  };

  /**
   * An online race from the lobby (MK-47): this device's placeholder of the race (its own kart
   * `local`), then the host or client steps it. Online races don't pause.
   */
  private readonly startOnlineRace = (launch: OnlineLaunch): void => {
    this.screens.hide();
    this.beforeLoad();
    const state = createRace(launch.race);
    this.session.load(state);
    this.world.reset('chase', localKartOf(state));
    this.session.goOnline(launch, (kartId) => this.world.reset('chase', kartId));
    this.session.game.resume();
    this.pauseButton.hidden = true;
  };

  private readonly pauseRace = (): void => {
    const game = this.session.game;
    if (this.screens.current !== 'none' || game.state.phase === 'finished') return;
    game.pause();
    this.screens.show('paused', {
      onResume: this.resumeRace,
      onRestart: this.startRace,
      onQuit: this.showTitle,
      onHowToPlay: this.openHowToPlay,
      onSettings: this.showSettings,
      sound: this.soundControl,
    });
  };

  private readonly resumeRace = (): void => {
    this.screens.hide();
    this.session.game.resume();
  };

  private readonly showResults = (): void => {
    const rows = resultLines(this.session.game.state, this.session.localKartId);
    this.pauseButton.hidden = true;
    this.screens.show('results', {
      rows,
      ...(this.recordUpdate ? { records: recordLines(this.recordUpdate) } : {}),
      onAgain: this.startRace,
      onChangeKart: this.showKartSelect,
      onMenu: this.showTitle,
    });
  };

  /** Replaces the running state (menu background) and rebuilds the karts. */
  private load(state: SimState, view: ScenarioView): void {
    this.beforeLoad();
    this.session.load(state);
    this.world.reset(view, this.session.localKartId);
  }

  private beforeLoad(): void {
    window.clearTimeout(this.resultsTimer);
    this.recordUpdate = undefined;
  }

  private focusLineupKart(kart: KartId, snap = false): void {
    this.world.focusLineupKart(KART_IDS.indexOf(kart), snap);
  }

  private onEvents(events: SimEvent[], state: SimState): void {
    const followId = this.world.followId;
    this.sound.onEvents(events, state, followId);
    this.world.effects.onEvents(events, followId);
    const me = this.session.localKartId;
    this.hud.onEvents(events, state, me, performance.now());
    const finished = events.find((e) => e.type === 'finish' && e.kartId === me);
    if (finished) {
      this.recordUpdate = recordFinish(this.store, state, me);
      this.resultsTimer = window.setTimeout(this.showResults, RESULTS_DELAY_MS);
    }
  }
}

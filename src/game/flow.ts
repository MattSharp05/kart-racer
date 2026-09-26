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
import '../ui/screens/connectionLost';
import { showToast } from '../ui/toast';
import { NET } from '../net/config';
import { DT } from '../sim/tuning';
import type { SoundControl } from '../ui/screens/common';
import { HowToPlay } from '../ui/screens/howToPlay';
import '../ui/screens/racerSelect';
import '../ui/screens/nickname';
import '../ui/screens/onlineResults';
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
import { standingsOf } from '../net/host';
import type { OnlineLaunch, RaceLoss } from './online';
import { supabaseLeaderboard, submitFinish } from '../records/leaderboard';
import { onlineResultLines, recordFinish, recordLines, resultLines } from './results';
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
/** An online race that hasn't started after this long goes back to the lobby, ms (MK-47). */
const ONLINE_CONNECT_TIMEOUT_MS = 20_000;
/** The pause menu's line in an online race, which the menu doesn't stop (MK-55). */
const ONLINE_PAUSE_NOTE = 'Race continues';
/** Seconds away (tab hidden) after which the host has dropped this client (MK-70). */
const DROP_AFTER_SECONDS = NET.dropAfterTicks * DT;
/** Shown when an online client's page goes to the background (MK-70). */
export const AWAY_WARNING = `Come back within ${DROP_AFTER_SECONDS} s or the AI takes over your kart`;
/** Why the Connection lost screen shows (MK-70). */
const LOSS_MESSAGES: Record<RaceLoss, string> = {
  dropped: 'You were away too long, so the AI took over your kart. Rejoin to race the next one.',
  'host-lost': 'Lost the connection to the host.',
};

/** The toast when a player drops and the AI takes their kart (MK-70). */
export function dropMessage(name: string | undefined): string {
  return `${name ?? 'A player'} disconnected — AI takes over`;
}

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
  /** The global leaderboard (MK-48): personal bests from ranked races go to it. */
  private readonly leaderboard = supabaseLeaderboard();
  /**
   * Whether the race running now counts for the leaderboard: one started from the menus or a
   * room. Nothing on a page opened from a scenario link (dev and QA) ever does.
   */
  private ranked = false;
  private scenarioPage = false;
  private readonly rooms: RoomFlow;
  /** When this device's online race began connecting (`performance.now()`), 0 when not racing online. */
  private onlineSince = 0;
  /** What the online results screen shows (live or final, and how many finished), to redraw it when that changes. */
  private shownResults = '';
  /** When this page went to the background (`performance.now()`), or -1 while it's visible. */
  private hiddenAt = -1;

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
        onRace: this.startOnlineRace,
        onStartFailed: (message) => this.abortOnlineRace(message),
        onRoomEnded: () => this.leaveOnlineRace(),
        onRacer: (racer) => {
          if (!isKartId(racer)) return;
          this.chosenKart = racer;
          // Kept for next time, so a player who drops and rejoins keeps their pick (MK-70).
          writePrefs(this.store, { kart: racer, engineClass: this.chosenCc });
        },
        onLobby: () => this.leaveOnlineRace(),
      },
    );

    // Leaving the page mid-race says goodbye at once (MK-70): the host hands the kart to the AI (a
    // client), or the room's clients see the host leave (the host), without waiting for a timeout.
    window.addEventListener('pagehide', () => this.session.online?.close());
    document.addEventListener('visibilitychange', () => this.onVisibility());

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
        // Online the race goes on for everyone else (MK-55): the prompt covers it but can't stop it.
        if (game.paused || session.online) return false;
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
      // A menu over a running online race: the kart coasts rather than steering with menu keys.
      session.inputEnabled = menu === 'none';
      this.watchOnlineRace();
    };
  }

  /** Opens the launch screen (menus or a direct race). */
  open(launch: Launch): void {
    this.scenarioPage = launch.scenario !== undefined;
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
      case 'racerSelect':
        this.showRacerSelect();
        break;
      case 'ccSelect':
        this.focusLineupKart(this.chosenKart, true);
        this.showCcSelect();
        break;
      case 'paused':
        this.pauseButton.hidden = false;
        this.pauseRace();
        break;
      case 'onlineResults':
        this.previewOnlineResults(launch.role !== 'client');
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
    this.onlineSince = 0;
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
      onPlay: this.showRacerSelect,
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

  private readonly showRacerSelect = (): void => {
    this.rooms.leave();
    this.onlineSince = 0;
    if (this.screens.current !== 'ccSelect') this.load(sunnyLineup(DEFAULT_SEED), 'lineup');
    this.pauseButton.hidden = true;
    this.session.game.resume();
    this.focusLineupKart(this.chosenKart, true);
    this.screens.show('racerSelect', {
      initial: this.chosenKart,
      onChange: (kart) => this.focusLineupKart(kart),
      onChoose: (kart) => {
        this.chosenKart = kart;
        // Remembered straight away (MK-51), even if the player backs out of the cc select.
        writePrefs(this.store, { kart, engineClass: this.chosenCc });
        this.showCcSelect();
      },
      onBack: this.showTitle,
      isPaused: () => this.session.game.paused,
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
      onBack: this.showRacerSelect,
    });
  };

  private readonly startRace = (): void => {
    // A local race (also "Again" after an online one): not in a room any more.
    this.rooms.leave();
    this.onlineSince = 0;
    this.raceCount += 1;
    this.screens.hide();
    this.beforeLoad();
    this.ranked = !this.scenarioPage;
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
    this.ranked = !this.scenarioPage;
    const state = createRace(launch.race);
    this.session.load(state);
    this.world.reset('chase', localKartOf(state));
    this.session.goOnline(launch, (kartId) => this.world.reset('chase', kartId));
    this.session.game.resume();
    // Online the pause menu doesn't stop the race (MK-55).
    this.pauseButton.hidden = false;
    this.onlineSince = performance.now();
  };

  /**
   * An online race that can't go on sends this device back to the lobby: nobody connected in time
   * (a player's link failed or they left before it opened), or the host ended it mid-race.
   */
  private watchOnlineRace(): void {
    const online = this.session.online;
    if (!online) return;
    // Players who dropped (MK-70): everyone hears about it; the AI drives their kart now. Online
    // scenarios too (they race without a room, so the rest of this is the lobby's).
    for (const kartId of online.takeDrops()) {
      if (kartId !== this.session.localKartId) {
        showToast(dropMessage(this.session.game.state.karts[kartId]?.name));
      }
    }
    const screen = this.screens.current;
    const racing = screen === 'none' || screen === 'paused';
    const lost = online.lost();
    if (racing && lost && !this.raceOver()) return this.showConnectionLost(lost);
    if (!this.onlineSince) return;
    if (screen === 'onlineResults') {
      // The host's final standings arrived, or another kart finished: redraw the results.
      if (this.resultsKey() !== this.shownResults) this.showResults();
      return;
    }
    if (screen !== 'none' && screen !== 'paused') return;
    const net = online.info();
    const host = net.role === 'host';
    if (net.ended) {
      // The race was over (everyone finished) when the host moved on: the results still show.
      if (this.raceOver()) return;
      this.abortOnlineRace(host ? undefined : 'The host ended the race.');
    } else if (!net.started && performance.now() - this.onlineSince > ONLINE_CONNECT_TIMEOUT_MS) {
      this.abortOnlineRace(
        host
          ? "Couldn't connect to every player. Try again."
          : "Couldn't reach the host. Try again.",
      );
    }
  }

  /**
   * This client lost its race (MK-70): the host dropped it or went quiet. The race here stops (the
   * AI drives the kart on the host); Rejoin goes back to the room for the next race.
   */
  private showConnectionLost(loss: RaceLoss): void {
    if (this.onlineSince) this.leaveOnlineRace();
    else this.session.stop(); // an online scenario: no lobby race to leave, just stop here
    this.pauseButton.hidden = true;
    this.screens.show('connectionLost', {
      message: LOSS_MESSAGES[loss],
      onRejoin: () => this.rooms.rejoin(),
      onLeave: this.showTitle,
    });
  }

  /**
   * A client's page going to the background mid-race (MK-70, phones): it stops ticking and sending,
   * so the host drops it after 3 s. Warn when it goes; when it comes back after longer than that,
   * the host has dropped it, whether or not the host's Bye got through.
   */
  private onVisibility(): void {
    const online = this.session.online;
    const racing =
      online?.launch.role === 'client' &&
      !online.lost() &&
      !online.info().ended &&
      !this.raceOver();
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = performance.now();
      if (racing) showToast(AWAY_WARNING);
      return;
    }
    const awaySeconds = this.hiddenAt < 0 ? 0 : (performance.now() - this.hiddenAt) / 1000;
    this.hiddenAt = -1;
    if (racing && awaySeconds > DROP_AFTER_SECONDS) this.showConnectionLost('dropped');
  }

  /** Whether this device's online race is over (everyone finished, or the host's results are in). */
  private raceOver(): boolean {
    return this.session.game.state.phase === 'finished' || this.session.online?.results() != null;
  }

  private abortOnlineRace(message?: string): void {
    this.leaveOnlineRace();
    this.rooms.backToLobby(message);
  }

  /** Stops this device's online race, if any, and puts the title's AI race back behind the menus. */
  private leaveOnlineRace(): void {
    if (!this.onlineSince) return;
    this.onlineSince = 0;
    this.pauseButton.hidden = true;
    this.load(attractMode(DEFAULT_SEED + this.raceCount), 'chase');
    this.session.game.setAutopilot(this.session.localKartId, true);
    this.session.game.resume();
  }

  /** The pause menu. Online (MK-55) it doesn't stop the race, and there's no restart. */
  private readonly pauseRace = (): void => {
    const game = this.session.game;
    if (this.screens.current !== 'none' || game.state.phase === 'finished') return;
    const online = this.session.online !== null;
    if (!online) game.pause();
    this.screens.show('paused', {
      onResume: this.resumeRace,
      ...(online ? { note: ONLINE_PAUSE_NOTE } : { onRestart: this.startRace }),
      onQuit: this.showTitle,
      onHowToPlay: this.openHowToPlay,
      onSettings: this.showSettings,
      sound: this.soundControl,
    });
  };

  private readonly resumeRace = (): void => {
    this.screens.hide();
    if (!this.session.online) this.session.game.resume();
  };

  private readonly showResults = (): void => {
    if (this.session.online) return this.showOnlineResults();
    const rows = resultLines(this.session.game.state, this.session.localKartId);
    this.pauseButton.hidden = true;
    this.screens.show('results', {
      rows,
      ...(this.recordUpdate ? { records: recordLines(this.recordUpdate) } : {}),
      onAgain: this.startRace,
      onChangeKart: this.showRacerSelect,
      onMenu: this.showTitle,
    });
  };

  /**
   * The room's results (MK-55): the host's final standings once every person has finished (live
   * standings until then). The host picks Race again or Next track; the others wait and follow.
   */
  private showOnlineResults(): void {
    const online = this.session.online;
    if (!online) return;
    const standings = online.results();
    const host = online.launch.role === 'host';
    const inRoom = this.rooms.room !== null;
    this.pauseButton.hidden = true;
    this.shownResults = this.resultsKey();
    this.screens.show('onlineResults', {
      rows: onlineResultLines(
        this.session.game.state,
        standings,
        this.session.localKartId,
        online.launch.colours,
      ),
      final: standings !== null,
      host,
      inRoom,
      ...(host && inRoom ? { onAgain: this.raceAgain, onNextTrack: this.nextTrack } : {}),
      onLeave: this.showTitle,
    });
  }

  /**
   * The `online-results` scenario (MK-55): a finished race's standings as the host (or a client)
   * sees them. There's no room, so the buttons go back to the title.
   */
  private previewOnlineResults(host: boolean): void {
    const state = this.session.game.state;
    this.screens.show('onlineResults', {
      rows: onlineResultLines(state, standingsOf(state), this.session.localKartId),
      final: true,
      host,
      inRoom: true,
      ...(host ? { onAgain: this.showTitle, onNextTrack: this.showTitle } : {}),
      onLeave: this.showTitle,
    });
  }

  /** What the online results depend on: the host's final standings, else who has finished. */
  private resultsKey(): string {
    if (this.session.online?.results()) return 'final';
    return `live:${this.session.game.state.karts.filter((k) => k.race.finishTick !== undefined).length}`;
  }

  /** Host: the same race settings again, everyone in the room racing (MK-55). */
  private readonly raceAgain = (): void => {
    this.rooms.raceAgain();
  };

  /** Host: back to the lobby to pick the next track; the others follow (MK-55). */
  private readonly nextTrack = (): void => {
    this.leaveOnlineRace();
    this.rooms.nextTrack();
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
    this.ranked = false;
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
      if (this.ranked) void submitFinish(this.leaderboard, this.store, state, me);
      this.resultsTimer = window.setTimeout(this.showResults, RESULTS_DELAY_MS);
    }
  }
}

import { SoundManager } from '../audio/soundManager';
import { gameRacers } from '../content/racers';
import { tracks } from '../content/tracks';
import { isSplitLayout, type SplitLayout } from '../render/viewports';
import type { PlayerView, World } from '../render/world';
import { attractMode, sunnyLineup } from '../scenarios/menus';
import type { ScenarioView } from '../scenarios/registry';
import { isKartId, KART_IDS, type KartId } from '../sim/data/karts';
import { createRace } from '../sim/race/createRace';
import type { EngineClass } from '../sim/tuning';
import type { SimEvent, SimState } from '../sim/types';
import { Hud, type HudView } from '../ui/hud/hud';
import { OverviewPanel } from '../ui/hud/overviewPanel';
import { RotatePrompt } from '../ui/rotatePrompt';
import { Router } from '../ui/router';
import '../ui/screens/ccSelect';
import '../ui/screens/connectionLost';
import '../ui/screens/leaderboard';
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
import '../ui/screens/buttonEditor';
import '../ui/screens/settings';
import '../ui/screens/title';
import '../ui/screens/trackSelect';
import {
  clearProfile,
  colourHex,
  DEFAULT_COLOUR,
  deviceId,
  readProfile,
  saveProfile,
  type Profile,
} from './profile';
import { standingsOf } from '../net/host';
import { connectFailedMessage, type OnlineLaunch, type RaceLoss } from './online';
import { Leaderboard, supabaseLeaderboard, submitFinish } from '../records/leaderboard';
import { onlineResultLines, recordFinish, recordLines, resultLines } from './results';
import { RoomFlow, type RoomService } from './roomFlow';
import { DEFAULT_SEED, localKartOf, type Launch, type RaceSession } from './session';
import { readPrefs, writePrefs } from './storage/prefs';
import { MAX_PLAYERS, playerLabel, playerSlotColour } from '../input/slots';
import { getRecord, type RecordUpdate } from './storage/records';
import { hasSeenHowToPlay, markHowToPlaySeen } from './storage/settings';
import type { KeyValueStore } from './storage/store';
import type { Mk8Start } from '../mk8';
import type { Mk8RaceSetup } from '../mk8/flow';
import { MK8_ITEM_SET } from '../mk8/content/items/id';
import { applyModeRules } from '../mk8/modes';
import { showErrorBanner } from '../ui/errorBanner';
import { trackLoad } from './pending';

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

/** Where a race goes when no track is offered (never, with the tracks registered today). */
const DEFAULT_TRACK = 'sunny-circuit';

/** The tracks the menus offer (single player and rooms): every registered one but test fixtures. */
function menuTracks() {
  return tracks.list().filter((t) => !t.testOnly);
}

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
  /** Split-screen (MK-145): P2–P4's HUDs, by slot − 1, made the first time they're needed. */
  private readonly viewHuds: Hud[] = [];
  /** The 3-player split's overview quadrant HUD (MK-145), made the first time it's needed. */
  private overviewPanel: OverviewPanel | undefined;
  private readonly screens = new Router();
  private readonly sound: SoundManager;
  private readonly soundControl: SoundControl;
  private readonly howToPlay: HowToPlay;
  private readonly pauseButton: HTMLButtonElement;
  private readonly rotatePrompt: RotatePrompt;
  private chosenKart: KartId;
  /** People racing on this screen (MK-144), 1–4: the race setup's Players option. */
  private chosenPlayers: number;
  /** P2–P4's racers (MK-144), by slot − 1. */
  private otherKarts: KartId[];
  private chosenCc: EngineClass;
  /** The single-player track (MK-50): a registered, non-test track. */
  private chosenTrack: string;
  private raceCount = 0;
  private resultsTimer: number | undefined;
  /** What the local player's finish did to the track records, for the results screen. */
  private recordUpdate: RecordUpdate | undefined;
  /**
   * Whether the race running now counts for the leaderboard: one started from the menus or a
   * room. Nothing on a page opened from a scenario link (dev and QA) ever does, except against a
   * test backend (`?lb=mock`, MK-56), which never reaches the real board.
   */
  private ranked = false;
  /** This race's leaderboard submit: your rank once a personal best is in (MK-56). */
  private submitted: Promise<number | null> | undefined;
  private scenarioPage = false;
  private readonly rooms: RoomFlow;
  /** When this device's online race began connecting (`performance.now()`), 0 when not racing online. */
  private onlineSince = 0;
  /** What the online results screen shows (live or final, and how many finished), to redraw it when that changes. */
  private shownResults = '';
  /** When this page went to the background (`performance.now()`), or -1 while it's visible. */
  private hiddenAt = -1;
  /** MK8 Mode's chunk is downloading (MK-97): the button does nothing more meanwhile. */
  private mk8Opening = false;
  /** The MK8 race running (MK-119), so Restart and Again race it again; unset outside MK8 Mode. */
  private mk8Race: Mk8RaceSetup | undefined;
  /** A race scenario's `mk8Start`: its MK8 mode (MK-121, the results' Grand Prix standings). */
  private mk8RaceStart: Mk8Start | undefined;

  constructor(
    private readonly session: RaceSession,
    private readonly world: World,
    private readonly store: KeyValueStore,
    rooms: RoomService,
    /** The global leaderboard (MK-48): personal bests from ranked races go to it. */
    private readonly leaderboard: Leaderboard = supabaseLeaderboard(),
  ) {
    const game = session.game;
    const prefs = readPrefs(store);
    this.chosenKart = prefs.kart && isKartId(prefs.kart) ? prefs.kart : 'maple';
    this.chosenCc = ENGINE_CLASSES.find((cc) => cc === prefs.engineClass) ?? 100;
    const players = Math.round(prefs.players ?? 1);
    this.chosenPlayers = players >= 1 && players <= MAX_PLAYERS ? players : 1;
    // Two players' split (MK-145): stacked unless they chose side by side.
    if (isSplitLayout(prefs.split)) session.splitLayout = prefs.split;
    // A different racer each by default: the ones after P1's in the roster.
    this.otherKarts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => {
      const saved = prefs.otherKarts?.[i];
      if (saved && isKartId(saved)) return saved;
      const at = KART_IDS.indexOf(this.chosenKart) + i + 1;
      return KART_IDS[at % KART_IDS.length] ?? this.chosenKart;
    });
    const offered = menuTracks();
    this.chosenTrack =
      offered.find((t) => t.id === prefs.track)?.id ?? offered[0]?.id ?? DEFAULT_TRACK;

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
        tracks: menuTracks(),
        racers: gameRacers(),
        // MK8 rooms (MK-132): MK8 Mode's chunk gives their courses and karts.
        mk8: (local) => import('../mk8').then((mk8) => mk8.roomContent(local)),
        onRace: this.startOnlineRace,
        onStartFailed: (message) => this.abortOnlineRace(message),
        onRoomEnded: () => this.leaveOnlineRace(),
        onRacer: (racer) => {
          if (!isKartId(racer)) return;
          this.chosenKart = racer;
          // Kept for next time, so a player who drops and rejoins keeps their pick (MK-70).
          this.savePrefs();
        },
        onLobby: () => {
          // The host gave up before the race ran (a player couldn't connect or left, MK-73).
          const online = this.session.online;
          const stuck = online !== null && this.onlineSince > 0 && !online.info().started;
          this.leaveOnlineRace();
          return stuck ? "The race couldn't start. The host will try again." : undefined;
        },
        onPlayerLeft: (name) => {
          // Before the race runs, it can't without them (MK-73); once it runs, the host's drops
          // hand their kart to the AI (MK-70).
          const online = this.session.online;
          if (online && this.onlineSince > 0 && !online.info().started) {
            this.abortOnlineRace(`${name} left the room.`);
          }
        },
      },
    );

    // Leaving the page mid-race says goodbye at once (MK-70): the host hands the kart to the AI (a
    // client), or the room's clients see the host leave (the host), without waiting for a timeout.
    window.addEventListener('pagehide', () => this.session.online?.close());
    document.addEventListener('visibilitychange', () => this.onVisibility());

    this.pauseButton = createPauseButton(() => this.pauseRace());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.pauseIfRacing();
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
      this.updateHuds(menu !== 'none');
      this.sound.update(game.state, {
        menu: menu !== 'none' && menu !== 'paused',
        paused: game.paused,
        followId: world.followId,
        players: session.slotKarts,
      });
      session.controls.touch.setActive(menu === 'none' && !this.rotatePrompt.shown);
      // A menu over a running online race: the kart coasts rather than steering with menu keys.
      session.inputEnabled = menu === 'none';
      // Any player's controller can pause the race (MK-144); presses in menus are dropped.
      const pausedBy = session.takePause();
      if (pausedBy >= 0 && menu === 'none' && !this.pauseButton.hidden) this.pauseRace(pausedBy);
      this.watchOnlineRace();
    };
  }

  /**
   * The HUDs for this frame: one on the whole screen for the local kart, or one per split-screen
   * view (MK-145), each in its view, labelled with its player.
   */
  private updateHuds(menuOpen: boolean): void {
    const state = this.session.game.state;
    const now = performance.now();
    const views = this.world.views();
    const overview = this.world.overviewRect();
    if (overview && !menuOpen) {
      this.overviewPanel ??= new OverviewPanel();
      const players = views.map((view) => ({
        kartId: view.kartId,
        label: playerLabel(view.slot),
        colour: playerSlotColour(view.slot),
        spot: this.world.overviewSpot(view.kartId),
      }));
      this.overviewPanel.update(state, overview, players);
    } else this.overviewPanel?.update(state, null, []);
    if (views.length < 2) {
      this.hud.setView(null);
      this.hud.update(state, this.session.localKartId, now, menuOpen);
      for (const hud of this.viewHuds) hud.hide();
      return;
    }
    for (const view of views) {
      const hud = this.hudOf(view.slot);
      hud.setView(hudView(view, views.length));
      hud.update(state, view.kartId, now, menuOpen);
    }
    this.viewHuds.slice(views.length - 1).forEach((hud) => hud.hide());
  }

  /** Player `slot`'s HUD: the screen's own for P1, else a split view's (made on first use). */
  private hudOf(slot: number): Hud {
    if (slot === 0) return this.hud;
    let hud = this.viewHuds[slot - 1];
    if (!hud) {
      hud = new Hud(false);
      this.viewHuds[slot - 1] = hud;
    }
    return hud;
  }

  /** Opens the pause menu if a race is running (Esc; a phone controller dropping, MK-146). */
  pauseIfRacing(): void {
    if (this.screens.current === 'none' && !this.pauseButton.hidden) this.pauseRace();
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
      case 'buttonEditor':
        // Pause menu → Settings → Customise buttons, so Save / Back walk back through them.
        this.pauseButton.hidden = false;
        this.pauseRace();
        this.showSettings();
        this.showButtonEditor();
        break;
      case 'racerSelect':
        this.showRacerSelect();
        break;
      case 'ccSelect':
        this.focusLineupKart(this.chosenKart, true);
        this.showCcSelect();
        break;
      case 'trackSelect':
        this.focusLineupKart(this.chosenKart, true);
        this.showTrackSelect();
        break;
      case 'paused':
        this.pauseButton.hidden = false;
        this.pauseRace();
        break;
      case 'onlineResults':
        this.previewOnlineResults(launch.role !== 'client');
        break;
      case 'mk8Entry':
        game.setAutopilot(launch.localKartId, true);
        this.showTitleScreen('mk8');
        break;
      case 'mk8':
        this.openMk8(launch.mk8Start ?? 'load');
        break;
      case 'leaderboard':
        // Over the title, so Back lands there (MK-56).
        game.setAutopilot(launch.localKartId, true);
        this.showTitleScreen();
        this.showLeaderboard(this.chosenTrack, this.chosenCc);
        break;
      default:
        // A race from a scenario link counts against a test leaderboard only (`?lb=mock`).
        this.ranked = this.leaderboard.test;
        this.mk8RaceStart = launch.mk8Start;
        // A local multiplayer scenario (MK-144): Restart and Again keep its players.
        if (this.session.players > 1) this.chosenPlayers = this.session.players;
        if (launch.state.itemSet !== undefined) this.prepareMk8Race();
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
    this.mk8Race = undefined;
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

  private showTitleScreen(focus?: 'mk8'): void {
    const profile = readProfile(this.store);
    this.screens.show('title', {
      onPlay: this.showRacerSelect,
      onMk8: () => this.openMk8('load'),
      ...(focus && { focus }),
      onOnline: () => this.rooms.showOnline(),
      onHowToPlay: this.openHowToPlay,
      onSettings: this.showSettings,
      onLeaderboards: () => this.showLeaderboard(this.chosenTrack, this.chosenCc),
      ...(profile && {
        player: { nickname: profile.nickname, colour: colourHex(profile.colour) },
        onEditName: () => this.showNickname(() => this.showTitleScreen(), profile),
      }),
    });
  }

  /**
   * MK8 Mode (MK-97, ADR 0009): its code is a chunk of its own, fetched only now, and it loads its
   * pack behind a progress bar. The title's race stops behind its full-screen menus; Back
   * returns to a fresh title.
   */
  private openMk8(mode: Mk8Start): void {
    if (this.mk8Opening) return;
    this.mk8Opening = true;
    this.rooms.leave();
    this.pauseButton.hidden = true;
    this.session.game.pause();
    // No title to press Play on while the chunk downloads.
    this.screens.hide();
    const open = import('../mk8')
      .then((mk8) => {
        this.mk8Opening = false;
        return mk8.start(
          {
            screens: this.screens,
            exit: this.showTitle,
            isMuted: () => this.sound.isMuted,
            startRace: this.startMk8Race,
            store: this.store,
            openRoom: (loadout) => this.rooms.launchMk8(loadout),
          },
          mode,
        );
      })
      .catch((e: unknown) => {
        this.mk8Opening = false;
        this.showTitle();
        showErrorBanner("Couldn't load MK8 Mode", [e instanceof Error ? e.message : String(e)], {
          label: 'Retry',
          onClick: () => this.openMk8(mode),
        });
      });
    void trackLoad(open);
  }

  /**
   * A race with MK8 items (MK-103: the `mk8-items-*` scenarios): MK8 Mode's chunk registers the
   * item set and loads the pack's item models first, while the race waits paused.
   */
  private prepareMk8Race(): void {
    const game = this.session.game;
    const wasPaused = game.paused;
    game.pause();
    // Without the item set the race can't hand out items, so it stays paused if this fails.
    const prepare = import('../mk8')
      .then((mk8) => mk8.prepareRace(game.state.karts))
      .then(() => {
        // Not if the player paused (a menu, the rotate prompt) while it loaded.
        if (!wasPaused && this.screens.current === 'none' && !this.rotatePrompt.shown) {
          game.resume();
        }
        this.world.markChanged();
      })
      .catch((e: unknown) => {
        showErrorBanner("Couldn't load MK8 Mode", [e instanceof Error ? e.message : String(e)]);
      });
    void trackLoad(prepare);
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
      editButtons: this.showButtonEditor,
      onBack: () => this.screens.back(),
    });
  };

  /**
   * The touch button editor (MK-57) over Settings, with the race behind it held still; Save or
   * Cancel returns to Settings.
   */
  private readonly showButtonEditor = (): void => {
    const game = this.session.game;
    const wasPaused = game.paused;
    // Online the race goes on for everyone else (MK-55): only the player's view stops.
    if (!this.session.online) game.pause();
    this.screens.show('buttonEditor', {
      store: this.store,
      onClose: () => {
        if (!wasPaused && !this.session.online) game.resume();
        this.screens.back();
      },
    });
  };

  private readonly showRacerSelect = (): void => this.pickRacer(0);

  /**
   * Racer select for player `slot` (MK-144): P1's has the Players option; with several players
   * each picks in turn (P1 on this device's controls for now), then the engine class.
   */
  private pickRacer(slot: number): void {
    this.mk8Race = undefined;
    this.rooms.leave();
    this.onlineSince = 0;
    const current = this.screens.current;
    if (current !== 'ccSelect' && current !== 'racerSelect') {
      this.load(sunnyLineup(DEFAULT_SEED), 'lineup');
    }
    this.pauseButton.hidden = true;
    this.session.game.resume();
    const kartOf = (s: number) => (s === 0 ? this.chosenKart : this.otherKarts[s - 1]);
    const initial = kartOf(slot) ?? this.chosenKart;
    this.focusLineupKart(initial, true);
    const multi = this.chosenPlayers > 1;
    this.screens.show('racerSelect', {
      initial,
      onChange: (kart) => this.focusLineupKart(kart),
      onChoose: (kart) => {
        if (slot === 0) this.chosenKart = kart;
        else this.otherKarts[slot - 1] = kart;
        // Remembered straight away (MK-51), even if the player backs out of the cc select.
        this.savePrefs();
        if (slot + 1 < this.chosenPlayers) this.pickRacer(slot + 1);
        else this.showCcSelect();
      },
      onBack: slot === 0 ? this.showTitle : () => this.pickRacer(slot - 1),
      isPaused: () => this.session.game.paused,
      ...(multi ? { player: playerLabel(slot) } : {}),
      ...(slot === 0
        ? {
            players: {
              count: this.chosenPlayers,
              max: MAX_PLAYERS,
              onChange: (count: number) => {
                if (count === this.chosenPlayers) return;
                this.chosenPlayers = count;
                this.savePrefs();
                this.pickRacer(0);
              },
            },
            split: {
              layout: this.session.splitLayout,
              onChange: (layout: SplitLayout) => {
                if (layout === this.session.splitLayout) return;
                this.session.splitLayout = layout;
                this.savePrefs();
                this.pickRacer(0);
              },
            },
          }
        : {}),
    });
  }

  private readonly showCcSelect = (): void => {
    this.screens.show('ccSelect', {
      initial: this.chosenCc,
      onChoose: (cc) => {
        this.chosenCc = cc;
        this.savePrefs();
        this.showTrackSelect();
      },
      // Back to the last player's racer (MK-144).
      onBack: () => this.pickRacer(this.chosenPlayers - 1),
    });
  };

  /** Track select (MK-50): the last step before a single-player race. */
  private readonly showTrackSelect = (): void => {
    this.screens.show('trackSelect', {
      tracks: menuTracks(),
      initial: this.chosenTrack,
      recordOf: (trackId) => getRecord(this.store, trackId, this.chosenCc),
      classLabel: `${this.chosenCc}cc`,
      onChoose: (trackId) => {
        this.chosenTrack = trackId;
        this.savePrefs();
        this.startRace();
      },
      onBack: this.showCcSelect,
    });
  };

  /** Remembers the menu picks for next time (racer, engine class, track). */
  private savePrefs(): void {
    writePrefs(this.store, {
      // Keeps what other menus saved (MK8 Mode's loadout, MK-102).
      ...readPrefs(this.store),
      kart: this.chosenKart,
      engineClass: this.chosenCc,
      track: this.chosenTrack,
      players: this.chosenPlayers,
      otherKarts: this.otherKarts,
      split: this.session.splitLayout,
    });
  }

  private readonly startRace = (): void => {
    // Restart / Again in MK8 Mode race the same MK8 race again.
    if (this.mk8Race) return this.startMk8Race(this.mk8Race);
    // A local race (also "Again" after an online one): not in a room any more.
    this.rooms.leave();
    this.onlineSince = 0;
    this.raceCount += 1;
    this.screens.hide();
    this.beforeLoad();
    const solo = this.chosenPlayers === 1;
    // Local multiplayer races (MK-144) don't count for the leaderboard or the track records.
    this.ranked = (!this.scenarioPage || this.leaderboard.test) && solo;
    this.session.startRace({
      seed: DEFAULT_SEED + this.raceCount,
      engineClass: this.chosenCc,
      playerKart: this.chosenKart,
      trackId: this.chosenTrack,
      ...(solo ? {} : { otherPlayers: this.otherKarts.slice(0, this.chosenPlayers - 1) }),
    });
    this.world.reset('chase', this.session.localKartId);
    this.session.game.resume();
    this.pauseButton.hidden = false;
  };

  /**
   * A race from MK8 Mode's menus (MK-119): the course's track (or its stand-in), the engine class,
   * the player's racer and MK8's item set, 7 AI. It never counts for the leaderboard or the
   * original game's track records (MK8 Time Trial records are their own ticket).
   */
  private readonly startMk8Race = (setup: Mk8RaceSetup): void => {
    this.mk8Race = setup;
    this.rooms.leave();
    this.onlineSince = 0;
    this.raceCount += 1;
    this.screens.hide();
    this.beforeLoad();
    this.session.startRace({
      seed: DEFAULT_SEED + this.raceCount,
      engineClass: setup.engineClass,
      playerKart: setup.playerKart,
      trackId: setup.trackId,
      itemSet: setup.itemSet,
      ...(setup.raceLoadout ? { playerLoadout: setup.raceLoadout } : {}),
      ...(setup.field ? { racers: setup.field } : {}),
    });
    // VS Race settings and Time Trial (MK-131), on the fresh race before anything draws it.
    applyModeRules(this.session.game.state, setup);
    this.world.reset('chase', this.session.localKartId);
    this.session.game.resume();
    this.pauseButton.hidden = false;
  };

  /**
   * An online race from the lobby (MK-47): this device's placeholder of the race (its own kart
   * `local`), then the host or client steps it. Online races don't pause.
   */
  private readonly startOnlineRace = (launch: OnlineLaunch): void => {
    this.mk8Race = undefined;
    this.screens.hide();
    this.beforeLoad();
    // MK8 races (MK-132) have no leaderboard.
    this.ranked = (!this.scenarioPage || this.leaderboard.test) && !launch.race.itemSet;
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
    this.hud.waiting = null;
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
    const net = online.info();
    // Still connecting (MK-73): say to whom, rather than a countdown standing still on 3.
    this.hud.waiting = online.waitingLine();
    if (screen === 'onlineResults') {
      // The host's final standings arrived, or another kart finished: redraw the results. Online
      // scenarios too (MK-81): they race without a room, but their results go final the same way.
      if (this.resultsKey() !== this.shownResults) this.showResults();
      return;
    }
    if (!this.onlineSince) return;
    if (screen !== 'none' && screen !== 'paused') return;
    const host = net.role === 'host';
    const unreachable = online.unreachable();
    if (!net.started && unreachable.length > 0) {
      // WebRTC couldn't connect (MK-73): no use waiting for the timeout.
      this.abortOnlineRace(connectFailedMessage(unreachable));
    } else if (net.ended) {
      // The race was over (everyone finished) when the host moved on: the results still show.
      if (this.raceOver()) return;
      this.abortOnlineRace(host ? undefined : 'The host ended the race.');
    } else if (!net.started && performance.now() - this.onlineSince > ONLINE_CONNECT_TIMEOUT_MS) {
      this.abortOnlineRace(online.timeoutMessage());
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

  /**
   * The pause menu, opened by player slot `by` (MK-144: any player can pause; the menu says who).
   * Online (MK-55) it doesn't stop the race, and there's no restart.
   */
  private readonly pauseRace = (by = 0): void => {
    const game = this.session.game;
    if (this.screens.current !== 'none' || game.state.phase === 'finished') return;
    const online = this.session.online !== null;
    if (!online) game.pause();
    if (!online && this.isMk8Race()) return this.showMk8Pause();
    const pausedBy = this.session.players > 1 ? `Paused by ${playerLabel(by)}` : undefined;
    this.screens.show('paused', {
      onResume: this.resumeRace,
      ...(online ? { note: ONLINE_PAUSE_NOTE } : { onRestart: this.startRace }),
      ...(pausedBy ? { note: pausedBy } : {}),
      onQuit: this.showTitle,
      onHowToPlay: this.openHowToPlay,
      onSettings: this.showSettings,
      sound: this.soundControl,
    });
  };

  /** An MK8 race (MK-121): from MK8 Mode's menus, or a scenario's race with MK8's items. */
  private isMk8Race(): boolean {
    return this.mk8Race !== undefined || this.session.game.state.itemSet === MK8_ITEM_SET;
  }

  /** MK8 Mode's pause menu (MK-121): Continue, Restart, Quit to MK8 Mode's menus. */
  private showMk8Pause(): void {
    this.pauseButton.hidden = true;
    const { state } = this.session.game;
    const resume = () => {
      this.resumeRace();
      // After this key's dispatch: the Esc that closed the menu mustn't reopen it (keydown below).
      window.setTimeout(() => (this.pauseButton.hidden = false));
    };
    void trackLoad(import('../mk8/raceScreens')).then((mk8) =>
      mk8.showPause(this.screens, state, this.mk8Race, {
        onContinue: resume,
        onRestart: this.startRace,
        onQuit: this.quitToMk8,
        mode: this.mk8RaceStart,
      }),
    );
  }

  /** MK8 Mode's results (MK-121): Next / Retry / Quit by mode, standings in a Grand Prix. */
  private showMk8Results(): void {
    this.pauseButton.hidden = true;
    const { state } = this.session.game;
    void trackLoad(import('../mk8/raceScreens')).then((mk8) =>
      mk8.showResults(
        this.screens,
        state,
        this.session.localKartId,
        this.mk8Race,
        this.mk8RaceStart,
        {
          onNext: this.startMk8Race,
          onRetry: this.startRace,
          onQuit: this.quitToMk8,
          store: this.store,
        },
      ),
    );
  }

  private readonly quitToMk8 = (): void => {
    this.mk8Race = undefined;
    this.openMk8('title');
  };

  private readonly resumeRace = (): void => {
    this.screens.hide();
    if (!this.session.online) this.session.game.resume();
  };

  /**
   * The leaderboards (MK-56) over the current screen, opening on this track and class; Back
   * returns to that screen.
   */
  private showLeaderboard(track: string, engineClass: number): void {
    this.screens.show('leaderboard', {
      tracks: menuTracks(),
      engineClasses: ENGINE_CLASSES,
      track,
      engineClass,
      load: (trackId, cc) => this.leaderboard.board(trackId, cc, deviceId(this.store)),
      onBack: () => this.screens.back(),
    });
  }

  /** The leaderboard of the race on screen (results). */
  private readonly showRaceLeaderboard = (): void => {
    const { trackId, engineClass } = this.session.game.state;
    this.showLeaderboard(trackId, engineClass);
  };

  /**
   * Submits the local finish to the leaderboard; resolves to your rank on the board once a
   * personal best is saved, else null.
   */
  private async submitAndRank(state: SimState, kartId: number): Promise<number | null> {
    const { trackId, engineClass } = state;
    const outcome = await submitFinish(this.leaderboard, this.store, state, kartId);
    if (outcome !== 'saved') return null;
    const board = await this.leaderboard.board(trackId, engineClass, deviceId(this.store));
    return board?.you?.rank ?? null;
  }

  private readonly showResults = (): void => {
    if (this.session.online) return this.showOnlineResults();
    if (this.isMk8Race()) return this.showMk8Results();
    const { players, slotKarts, localKartId } = this.session;
    const rows = resultLines(this.session.game.state, players > 1 ? slotKarts : localKartId);
    this.pauseButton.hidden = true;
    this.screens.show('results', {
      rows,
      ...(this.recordUpdate ? { records: recordLines(this.recordUpdate) } : {}),
      ...(this.submitted ? { submitted: this.submitted } : {}),
      onLeaderboard: this.showRaceLeaderboard,
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
      onLeaderboard: this.showRaceLeaderboard,
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
      onLeaderboard: this.showRaceLeaderboard,
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
    this.submitted = undefined;
    this.ranked = false;
  }

  private focusLineupKart(kart: KartId, snap = false): void {
    this.world.focusLineupKart(KART_IDS.indexOf(kart), snap);
  }

  private onEvents(events: SimEvent[], state: SimState): void {
    const followId = this.world.followId;
    this.sound.onEvents(events, state, followId, this.session.slotKarts);
    this.world.effects.onEvents(events);
    const me = this.session.localKartId;
    const views = this.world.views();
    const now = performance.now();
    if (views.length > 1) {
      // Split-screen (MK-145): each view's banners (FINAL LAP, FINISH) are its own player's.
      for (const view of views) this.hudOf(view.slot).onEvents(events, state, view.kartId, now);
    } else this.hud.onEvents(events, state, me, now);
    if (this.session.players > 1) {
      // Local multiplayer (MK-144): the results once every player has finished (the race's end).
      if (events.some((e) => e.type === 'phaseChanged' && e.phase === 'finished')) {
        this.resultsTimer = window.setTimeout(this.showResults, RESULTS_DELAY_MS);
      }
      return;
    }
    const finished = events.find((e) => e.type === 'finish' && e.kartId === me);
    if (finished) {
      if (!this.mk8Race) this.recordUpdate = recordFinish(this.store, state, me);
      if (this.ranked) this.submitted = this.submitAndRank(state, me);
      this.resultsTimer = window.setTimeout(this.showResults, RESULTS_DELAY_MS);
    }
  }
}

/** A split-screen view's HUD placement (MK-145): its rect, player label and colour. */
function hudView(view: PlayerView, views: number): HudView {
  return {
    rect: view.rect,
    label: playerLabel(view.slot),
    colour: playerSlotColour(view.slot),
    compact: views > 2,
  };
}

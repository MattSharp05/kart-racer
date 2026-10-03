// MK-92 anti-gravity spike: `?spike=antigrav` runs the prototype instead of the game (it never
// resolves).
if (new URLSearchParams(location.search).get('spike') === 'antigrav')
  await import('./mk8/spike/main').then((spike) => spike.run());
import { Flow } from './game/flow';
import { parseLaunchParams } from './game/launchParams';
import { playerColour } from './game/results';
import { RaceSession, resolveLaunch } from './game/session';
import { browserStore, OverlayStore, readSettings } from './game/storage';
import { installTestApi } from './game/testApi';
import { setTouchHand, setTouchLayout } from './input/touch';
import { localRoomBackend } from './net/roomBackendLocal';
import { supabaseRoomBackend } from './net/roomBackendSupabase';
import { launchLeaderboard } from './records/leaderboardMock';
import { World } from './render/world';
import { tracks } from './content/tracks';
import { scenarios } from './scenarios';
import { MK8_COURSE_SCENARIOS, mk8CourseLoad } from './scenarios/mk8';
import { getTrack } from './sim/track';
import { tuning } from './sim/tuning';
import { NetDebugOverlay } from './ui/netDebug';
import { restoreSteering } from './ui/settings/controlsSteering';
import { PerfOverlay, poseLine } from './ui/perfOverlay';

// Thin bootstrap (MK-35): read the URL, build the session, world and screen flow, start the loop.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = parseLaunchParams(window.location.search);
// MK8 driving scenarios (MK-99, MK-105): register the course they drive on (the test ramp, or a
// real course from the pack) before the scenario is set up. Lazy and only for them, so nothing
// else loads it.
if (params.scenario && MK8_COURSE_SCENARIOS.has(params.scenario)) {
  const { prepareMk8Scenario } = await import('./mk8/scenarioCourses');
  mk8CourseLoad.state = await prepareMk8Scenario(params.scenario, window.location.search);
}
// `&remote=` (MK-74, QA): how this device's online races draw and predict other karts.
if (params.remote) tuning.net.remoteKarts = params.remote;
const launch = resolveLaunch(params);
const store = launch.storage ? new OverlayStore(browserStore(), launch.storage) : browserStore();
// The saved touch layout (MK-53, MK-57), before the controls are built.
setTouchHand(readSettings(store).hand);
setTouchLayout(readSettings(store).buttons);
// The saved steering (MK-54): drag or tilt, before the controls are built.
restoreSteering(store);
const session = new RaceSession(launch.state);
const game = session.game;
if (params.paused) game.pause();

const world = new World(canvas, game, {
  track: getTrack(launch.state.trackId),
  view: launch.view ?? 'chase',
  follow: launch.follow ?? launch.localKartId,
  playerInputs: () => session.inputs(),
  reducedMotion:
    params.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  aiDebug: params.aiDebug,
  ...(params.lowQuality ? { lowQuality: true } : {}),
  poseFilter: () => session.online?.smoother,
  playerColour: (kartId) => playerColour(session.online?.launch.colours, kartId),
});
const flow = new Flow(
  session,
  world,
  store,
  {
    backend: launch.localRooms ? localRoomBackend() : supabaseRoomBackend(),
    local: launch.localRooms,
    ...(launch.localRooms && params.links ? { links: params.links } : {}),
    ...(params.relay ? { relay: params.relay } : {}),
  },
  launchLeaderboard(params.lb, store),
);

installTestApi(
  game,
  {
    // The scene as it is before the ticks, even if no animation frame has run yet (MK-77).
    before: () => world.render(0, false, false),
    // Test/QA fast-forward: snap the scene and camera now; the next animation frame draws it.
    after: () => {
      world.render(0, true, false);
      world.markChanged();
    },
  },
  launch.scenario,
  () => world.renderInfo(),
  () => session.localKartId,
  () => session.online?.info() ?? null,
  (name, seed) => {
    const scenario = scenarios.get(name);
    if (!scenario) return false;
    const { state } = scenario.setup(seed ?? scenario.defaultSeed);
    // An MK8 course registers when the page boots into its scenario (MK-99), not in place.
    if (!tracks.has(state.trackId)) return false;
    session.load(state);
    world.reset(world.view, session.localKartId);
    return true;
  },
);

// Online scenarios (MK-46): host or join the race; a client's camera moves to its kart on Start.
if (launch.online) {
  session.goOnline(launch.online, (kartId) => world.reset('chase', kartId));
  window.addEventListener('pagehide', () => session.leaveOnline());
}

flow.open(launch);
// `&paused=1` wins over menu screens that start the sim (kart select, title): tests and QA links
// get a still frame.
if (params.paused) game.pause();

if (params.tune) {
  void import('./dev/tuningPanel').then(({ openTuningPanel }) => openTuningPanel());
}
if (params.perf)
  world.perf = new PerfOverlay(() => poseLine(game.state.karts[session.localKartId]));
if (params.netdebug) {
  const overlay = new NetDebugOverlay(() => session.online?.debug() ?? null);
  const onUpdate = world.onUpdate;
  world.onUpdate = (seconds) => {
    onUpdate(seconds);
    overlay.frame(seconds);
  };
}
world.start();

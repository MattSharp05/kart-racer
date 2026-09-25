// MK-36 netcode spike: `?spike=net` runs the prototype instead of the game (it never resolves).
if (new URLSearchParams(location.search).get('spike') === 'net')
  await import('./net/spike/main').then((spike) => spike.run());
import { Flow } from './game/flow';
import { parseLaunchParams } from './game/launchParams';
import { RaceSession, resolveLaunch } from './game/session';
import { browserStore, OverlayStore } from './game/storage';
import { installTestApi } from './game/testApi';
import { World } from './render/world';
import { getTrack } from './sim/track';
import { PerfOverlay } from './ui/perfOverlay';

// Thin bootstrap (MK-35): read the URL, build the session, world and screen flow, start the loop.
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = parseLaunchParams(window.location.search);
const launch = resolveLaunch(params);
const store = launch.storage ? new OverlayStore(browserStore(), launch.storage) : browserStore();
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
});
const flow = new Flow(session, world, store);

installTestApi(
  game,
  () => {
    // Test/QA fast-forward: snap the scene and camera now; the next animation frame draws it.
    world.render(0, true, false);
    world.markChanged();
  },
  launch.scenario,
  () => world.renderInfo(),
  () => session.localKartId,
  () => session.online?.info() ?? null,
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
if (params.perf) world.perf = new PerfOverlay();
world.start();

import { advanceAccumulator } from '../../game/loop';
import type { GameTestApi } from '../../game/testApi';
import { DT } from '../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../../sim/types';
import { ConditionedTransport, parseNetConditions } from '../netsim';
import type { Transport } from '../transport';
import { benchResim, simHash } from './measure';
import { CLIENT_KART, HOST_KART, NetClient, NetHost, spikeRace, type NetStats } from './netcode';
import { localSignaling, supabaseSignaling } from './signaling';
import { SpikeView } from './view';
import {
  hostPeers,
  joinHost,
  type ConnectionInfo,
  type SignalingChannel,
  type WebRtcTransport,
} from '../webrtc';

/**
 * `/?spike=net&role=host|client&room=<code>` — the MK-36 netcode spike. Throwaway prototype: a
 * top-down view, keyboard/touch driving, and a stats panel. `&transport=local` signals over
 * BroadcastChannel instead of Supabase (same machine); `&netsim=lag,jitter,loss%` adds fake lag.
 */

type Status = 'signaling' | 'waiting' | 'connecting' | 'connected' | 'error';

/** Frames the loop may catch up in one go before dropping time. */
const MAX_CATCH_UP_TICKS = 10;
const LOOP_INTERVAL_MS = 4;
const CONNECTION_POLL_MS = 1000;
const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_LENGTH = 4;
const DEFAULT_SEED = 1;
const QR_SIZE = 140;
/** Below this height (phones in landscape) the stats panel uses a smaller font. */
const SMALL_SCREEN_PX = 500;

export interface NetSpikeApi {
  role: 'host' | 'client';
  room: string;
  status(): Status;
  error(): string | null;
  connection(): ConnectionInfo | null;
  /** Local-network stats, bandwidth per second, and signaling (Supabase) message counts. */
  stats(): NetStats & {
    elapsedS: number;
    bytesPerSecondDown: number;
    bytesPerSecondUp: number;
    signalingSent: number;
    signalingReceived: number;
    leadTicks: number;
  };
  /** Cross-engine check: hash of the seeded spike race after `ticks`. */
  simHash(seed: number, ticks: number): { hash: string; x: number; z: number };
  /** Re-simulation cost: average ms to re-simulate `ticks` ticks of the 8-kart race. */
  benchResim(ticks: number, reps: number): { msPerResim: number; msPerTick: number };
}

declare global {
  interface Window {
    __netSpike?: NetSpikeApi;
  }
}

function randomRoom(): string {
  return Array.from(
    { length: ROOM_LENGTH },
    () => ROOM_LETTERS[Math.floor(Math.random() * ROOM_LETTERS.length)],
  ).join('');
}

/** Arrow keys / WASD, space = drift. Touch: hold to drive, steer by finger position. */
function createControls(): () => InputFrame {
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  let touchX: number | null = null;
  const onTouch = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchX = touch ? touch.clientX / window.innerWidth : null;
    e.preventDefault();
  };
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
    window.addEventListener(type, onTouch, { passive: false });
  }
  const held = (...codes: string[]) => codes.some((code) => keys.has(code));
  return () => {
    const left = held('ArrowLeft', 'KeyA') ? 1 : 0;
    const right = held('ArrowRight', 'KeyD') ? 1 : 0;
    const touchSteer = touchX === null ? 0 : Math.max(-1, Math.min(1, (touchX - 0.5) * 3));
    return {
      throttle: held('ArrowUp', 'KeyW') || touchX !== null ? 1 : 0,
      brake: held('ArrowDown', 'KeyS') ? 1 : 0,
      steer: right - left + touchSteer,
      drift: held('Space', 'ShiftLeft'),
      item: false,
    };
  };
}

function setupPage(): { canvas: HTMLCanvasElement; panel: HTMLElement; link: HTMLElement } {
  document.querySelector<HTMLCanvasElement>('#game')?.remove();
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#222;font:14px system-ui';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;touch-action:none';
  const panel = document.createElement('pre');
  panel.dataset.testid = 'net-spike-panel';
  panel.style.cssText =
    'position:fixed;top:8px;left:8px;margin:0;padding:8px 10px;background:#000b;color:#fff;' +
    'border-radius:6px;pointer-events:none;white-space:pre;' +
    `font:${window.innerHeight < SMALL_SCREEN_PX ? 10 : 12}px ui-monospace,monospace`;
  const link = document.createElement('div');
  link.style.cssText =
    'position:fixed;top:8px;right:8px;padding:8px;background:#fffe;border-radius:6px;' +
    'max-width:220px;word-break:break-all;font-size:12px';
  document.body.append(canvas, panel, link);
  return { canvas, panel, link };
}

/** Runs the spike page. Never resolves: the game's own bootstrap must not run after it. */
export async function run(): Promise<never> {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role') === 'client' ? 'client' : 'host';
  let room = (params.get('room') ?? '').toUpperCase();
  if (!room) {
    room = randomRoom();
    params.set('room', room);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }
  const seed = Number(params.get('seed') ?? DEFAULT_SEED) || DEFAULT_SEED;
  const local = params.get('transport') === 'local';
  const conditions = parseNetConditions(params.get('netsim'));

  const { canvas, panel, link } = setupPage();
  const view = new SpikeView(canvas);
  const readControls = createControls();
  let override: InputFrame | null = null;
  let status: Status = 'signaling';
  let error: string | null = null;
  let connection: ConnectionInfo | null = null;
  let signaling: SignalingChannel | null = null;
  let rtc: WebRtcTransport | null = null;
  let connectedAt = 0;
  let paused = false;

  const host = role === 'host' ? new NetHost(spikeRace(seed), seed) : null;
  let client: NetClient | null = null;
  const localKart = role === 'host' ? HOST_KART : CLIENT_KART;
  const wrap = (transport: Transport): Transport =>
    conditions.lagMs || conditions.jitterMs || conditions.loss
      ? new ConditionedTransport(transport, conditions)
      : transport;

  if (role === 'host') {
    const clientParams = new URLSearchParams(params);
    clientParams.set('role', 'client');
    const url = `${window.location.origin}/?${clientParams.toString()}`;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(url)}`;
    link.innerHTML = `<b>Room ${room}</b><br>Client link:<br><a href="${url}">${url}</a><br><img src="${qr}" width="${QR_SIZE}" height="${QR_SIZE}" alt="QR code for the client link">`;
  } else {
    link.remove();
  }

  const connect = async () => {
    signaling = local ? localSignaling(room) : await supabaseSignaling(room);
    status = role === 'host' ? 'waiting' : 'connecting';
    if (host) {
      hostPeers(signaling, (transport) => {
        if (rtc) return; // The spike races one client.
        rtc = transport;
        host.addClient(wrap(transport), CLIENT_KART);
        status = 'connected';
        connectedAt = performance.now();
      });
    } else {
      rtc = await joinHost(signaling);
      client = new NetClient(wrap(rtc));
      status = 'connected';
      connectedAt = performance.now();
    }
  };
  connect().catch((err: unknown) => {
    status = 'error';
    error = err instanceof Error ? err.message : String(err);
  });

  const input = (): InputFrame => override ?? readControls();
  const tick = () => {
    if (host && status === 'connected') host.tick(input());
    else client?.tick(input());
  };
  const displayState = (): SimState | null => (host ? host.state : (client?.state ?? null));

  let last = performance.now();
  let accumulator = 0;
  setInterval(() => {
    const now = performance.now();
    const frame = (now - last) / 1000;
    last = now;
    if (paused) return;
    const result = advanceAccumulator(accumulator, frame, DT, MAX_CATCH_UP_TICKS);
    accumulator = result.accumulator;
    for (let i = 0; i < result.steps; i += 1) tick();
  }, LOOP_INTERVAL_MS);

  setInterval(() => {
    if (rtc && status === 'connected') {
      void rtc.connectionInfo().then((info) => (connection = info));
    }
  }, CONNECTION_POLL_MS);

  const stats = (): ReturnType<NetSpikeApi['stats']> => {
    const base = host ? host.remotes[0]?.stats : client?.stats;
    const s: NetStats = base ?? {
      rttMs: 0,
      bytesSent: 0,
      bytesReceived: 0,
      packetsSent: 0,
      packetsReceived: 0,
      snapshots: 0,
      snapshotBytesAvg: 0,
      snapshotBytesMax: 0,
      resimMsAvg: 0,
      resimMsMax: 0,
      resimTicksAvg: 0,
      predictionErrorAvg: 0,
      predictionErrorMax: 0,
      remoteErrorAvg: 0,
      remoteErrorMax: 0,
      lateInputs: 0,
      staleSnapshots: 0,
    };
    const elapsedS = connectedAt ? (performance.now() - connectedAt) / 1000 : 0;
    // Per client: the host's "sent" is the client's "down".
    const down = host ? s.bytesSent : s.bytesReceived;
    const up = host ? s.bytesReceived : s.bytesSent;
    return {
      ...s,
      rttMs: client?.stats.rttMs ?? connection?.iceRttMs ?? 0,
      elapsedS,
      bytesPerSecondDown: elapsedS ? down / elapsedS : 0,
      bytesPerSecondUp: elapsedS ? up / elapsedS : 0,
      signalingSent: signaling?.counts.sent ?? 0,
      signalingReceived: signaling?.counts.received ?? 0,
      leadTicks: client?.leadTicks() ?? 0,
    };
  };

  const draw = () => {
    const state = displayState();
    if (state) view.draw(state, localKart, panel.offsetWidth + panel.offsetLeft);
    const s = stats();
    const pathLabel = connection
      ? `${connection.path} (${connection.localType}↔${connection.remoteType})`
      : '…';
    panel.textContent = [
      `NET SPIKE · ${role} · room ${room}${local ? ' · local signaling' : ''}`,
      `status: ${status}${error ? ` — ${error}` : ''}`,
      `connection: ${status === 'connected' ? pathLabel : '-'}`,
      `tick: ${state?.tick ?? '-'}  phase: ${state?.phase ?? '-'}`,
      `rtt: ${s.rttMs.toFixed(0)} ms  lead: ${s.leadTicks} ticks`,
      `snapshot: ${s.snapshotBytesAvg.toFixed(0)} B avg / ${s.snapshotBytesMax} max`,
      `down ${(s.bytesPerSecondDown / 1024).toFixed(1)} KB/s · up ${(s.bytesPerSecondUp / 1024).toFixed(1)} KB/s`,
      role === 'client'
        ? `resim: ${s.resimMsAvg.toFixed(2)} ms avg / ${s.resimMsMax.toFixed(1)} max (${s.resimTicksAvg.toFixed(1)} ticks)\n` +
          `prediction error: ${s.predictionErrorAvg.toFixed(3)} m avg / ${s.predictionErrorMax.toFixed(2)} max\n` +
          `remote kart error: ${s.remoteErrorAvg.toFixed(2)} m avg / ${s.remoteErrorMax.toFixed(2)} max`
        : `late inputs: ${s.lateInputs}`,
      `signaling msgs: ${s.signalingSent} sent / ${s.signalingReceived} received`,
      status === 'connected' ? 'Drive: arrows/WASD (space = drift) · touch: hold + steer' : '',
    ].join('\n');
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  window.__netSpike = {
    role,
    room,
    status: () => status,
    error: () => error,
    connection: () => connection,
    stats,
    simHash,
    benchResim: (ticks, reps) => benchResim(seed, ticks, reps),
  };
  const testState = () => ({
    ...structuredClone(displayState() ?? spikeRace(seed)),
    localKartId: localKart,
  });
  const api: GameTestApi = {
    ready: true,
    scenario: null,
    getState: testState,
    pause: () => (paused = true),
    resume: () => (paused = false),
    isPaused: () => paused,
    step: (ticks) => {
      for (let i = 0; i < ticks; i += 1) tick();
      return testState();
    },
    // Only the local kart can be driven from this browser.
    setInput: (_kartId, frame) => (override = frame ? { ...NEUTRAL_INPUT, ...frame } : null),
    setAutopilot: () => undefined,
    events: () => [],
    renderInfo: () => ({ calls: 0, triangles: 0 }),
    net: () => null,
  };
  window.__game = api;

  return new Promise<never>(() => undefined);
}

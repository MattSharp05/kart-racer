import * as THREE from 'three';
import { tuning } from '../sim/tuning';
import type { KartState } from '../sim/types';
import type { KartModel } from './kartModels';

/**
 * Anti-gravity look (MK-108): on anti-gravity ground a kart's wheels fold flat (MK8's hover look)
 * and a blue glow sits under it; a spin boost spins the body once round. Render-only, from the
 * kart's `antigrav` and `spinBoostTimer` (mesh tracks only: other karts never change here).
 */

/** How far the wheels fold per frame towards flat / upright (0..1). */
const FOLD_RATE = 0.2;
const GLOW_COLOUR = 0x3fd0ff;
const GLOW_OPACITY = 0.45;

/** Scratch: each wheel pivot's fold, kept on its `userData`. */
const FOLD = 'antigravFold';

export function syncAntigravLook(model: KartModel, kart: KartState, tick: number): void {
  const hover = kart.antigrav === true;
  for (const wheel of model.wheels) {
    const pivot = wheel.parent;
    if (!pivot) continue;
    const was = (pivot.userData[FOLD] as number | undefined) ?? 0;
    if (!hover && was === 0) continue;
    const target = hover ? 1 : 0;
    const fold = Math.abs(target - was) < 0.01 ? target : was + (target - was) * FOLD_RATE;
    pivot.userData[FOLD] = fold;
    // Axle (the wheel's X) turned to point up: the tyre lies flat like a hover pad.
    pivot.rotation.z = Math.sign(pivot.position.x || 1) * fold * (Math.PI / 2);
  }

  const glow = hoverGlow(model);
  glow.visible = hover;
  if (hover) {
    (glow.material as THREE.MeshBasicMaterial).opacity =
      GLOW_OPACITY * (0.8 + 0.2 * Math.sin(tick * 0.35));
  }

  // Spin boost: one full turn over the boost (on top of the drift yaw and any spin-out).
  const left = kart.spinBoostTimer ?? 0;
  if (left > 0) {
    model.body.rotation.y += (1 - left / tuning.mk8.spinBoost.seconds) * Math.PI * 2;
  }
}

/** The blue glow under a kart in anti-gravity, created on first use. */
function hoverGlow(model: KartModel): THREE.Mesh {
  const existing = model.root.userData.hoverGlow as THREE.Mesh | undefined;
  if (existing) return existing;
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.3, 20),
    new THREE.MeshBasicMaterial({
      color: GLOW_COLOUR,
      transparent: true,
      opacity: GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  glow.scale.set(0.8, 1.25, 1);
  glow.visible = false;
  model.root.add(glow);
  model.root.userData.hoverGlow = glow;
  return glow;
}

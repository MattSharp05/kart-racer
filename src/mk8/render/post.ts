// MK8 courses' post-processing at full quality (MK-125): the frame drawn into an HDR target, then
// bloom on what's bright, motion blur while the followed kart boosts, and ACES tone mapping with
// the course's exposure on the way to the screen. Low quality never builds this (a plain render).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { CourseLook } from '../content/courses/types';

/** Multisampling of the HDR target (the canvas's own antialiasing doesn't reach it). */
const SAMPLES = 4;
/**
 * Boost blur: taps towards the screen's middle, how far they reach (share of the way there) and the
 * clear middle (share of the half-diagonal).
 */
const BLUR_TAPS = 8;
const BLUR_REACH = 0.08;
const BLUR_CLEAR = 0.3;

/**
 * Radial blur from the screen's middle out, stronger towards the edges, scaled by `amount` (0: the
 * pass is skipped). The speed lines are the game's own (`render/effects.ts`, MK-27).
 */
export const BoostBlurShader = {
  name: 'Mk8BoostBlur',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec2 fromMiddle = vUv - 0.5;
      float r = length( fromMiddle ) / 0.7071;
      float edge = smoothstep( ${BLUR_CLEAR.toFixed(2)}, 1.0, r ) * amount;
      vec4 sum = vec4( 0.0 );
      for ( int i = 0; i < ${BLUR_TAPS}; i ++ ) {
        float t = float( i ) / float( ${BLUR_TAPS} );
        sum += texture2D( tDiffuse, vUv - fromMiddle * t * ${BLUR_REACH.toFixed(2)} * edge );
      }
      gl_FragColor = sum / float( ${BLUR_TAPS} );
    }`,
};

export class CoursePost {
  private readonly composer: EffectComposer;
  private readonly blur: ShaderPass;
  private readonly size = new THREE.Vector2();
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    look: CourseLook,
  ) {
    renderer.getSize(this.size);
    const target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, {
      type: THREE.HalfFloatType,
      samples: SAMPLES,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    const { strength, radius, threshold } = look.bloom;
    this.composer.addPass(new UnrealBloomPass(this.size.clone(), strength, radius, threshold));
    this.blur = new ShaderPass(BoostBlurShader);
    this.blur.enabled = false;
    this.composer.addPass(this.blur);
    this.composer.addPass(new OutputPass());
  }

  /** How much the screen blurs now (0–1). */
  setBoost(amount: number): void {
    this.blur.enabled = amount > 0;
    const uniform = this.blur.uniforms.amount;
    if (uniform) uniform.value = amount;
  }

  get boost(): number {
    return this.blur.enabled ? Number(this.blur.uniforms.amount?.value ?? 0) : 0;
  }

  /** Draws the frame; the renderer's stats count every pass (the perf budgets see the real cost). */
  render(): void {
    this.fit();
    const info = this.renderer.info;
    info.reset();
    info.autoReset = false;
    try {
      this.composer.render();
    } finally {
      info.autoReset = true;
    }
  }

  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
  }

  /** Follows the canvas's size and adaptive quality's pixel ratio. */
  private fit(): void {
    this.renderer.getSize(this.size);
    const ratio = this.renderer.getPixelRatio();
    if (this.size.x === this.width && this.size.y === this.height && ratio === this.pixelRatio)
      return;
    this.width = this.size.x;
    this.height = this.size.y;
    this.pixelRatio = ratio;
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(this.width, this.height);
  }
}

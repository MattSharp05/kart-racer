// MK8 courses' post-processing at full quality (MK-125): the frame drawn into an HDR target, then
// bloom on what's bright, motion blur while the followed kart boosts, and ACES tone mapping with
// the course's exposure on the way to the screen. Low quality never builds this (a plain render).
//
// Kept to three small shader programs (bright pass, one separable blur reused for every level and
// direction, and the final composite), because compiling shaders is most of what a course costs to
// open on a slow GPU or a software renderer: three's UnrealBloomPass + OutputPass compiled nine.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { CourseLook } from '../content/courses/types';

/** Bloom levels: each half the size of the one before, the first a quarter of the screen's. */
const LEVELS = 3;
const FIRST_LEVEL_DIVISOR = 4;
/** How much each bloom level adds (wide glow from the smaller levels). */
const LEVEL_WEIGHTS = [0.5, 0.3, 0.2] as const;
/**
 * Boost blur: taps towards the screen's middle, how far they reach (share of the way there) and the
 * clear middle (share of the half-diagonal).
 */
const BLUR_TAPS = 8;
const BLUR_REACH = 0.08;
const BLUR_CLEAR = 0.3;

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }`;

/** What's brighter than `threshold`, smoothly (a soft knee), at the first bloom level's size. */
const BRIGHT_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform float threshold;
  varying vec2 vUv;
  void main() {
    vec3 colour = texture2D( tScene, vUv ).rgb;
    float luma = dot( colour, vec3( 0.2126, 0.7152, 0.0722 ) );
    float keep = smoothstep( threshold, threshold + 0.1, luma );
    gl_FragColor = vec4( colour * keep, 1.0 );
  }`;

/** A 9-tap Gaussian along `direction` (texels); the same program for every level and both axes. */
const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 direction;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D( tInput, vUv ).rgb * 0.2270270270;
    sum += texture2D( tInput, vUv + direction * 1.3846153846 ).rgb * 0.3162162162;
    sum += texture2D( tInput, vUv - direction * 1.3846153846 ).rgb * 0.3162162162;
    sum += texture2D( tInput, vUv + direction * 3.2307692308 ).rgb * 0.0702702703;
    sum += texture2D( tInput, vUv - direction * 3.2307692308 ).rgb * 0.0702702703;
    gl_FragColor = vec4( sum, 1.0 );
  }`;

/**
 * The frame plus its bloom, blurred out from the middle while boosting (`amount`; the speed lines
 * are the game's own, `render/effects.ts`), then tone mapped and converted for the screen (three
 * adds the renderer's tone mapping and output colour space to a screen-bound shader material).
 */
const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom0;
  uniform sampler2D tBloom1;
  uniform sampler2D tBloom2;
  uniform vec3 weights;
  uniform float strength;
  uniform float amount;
  varying vec2 vUv;
  void main() {
    vec2 fromMiddle = vUv - 0.5;
    float r = length( fromMiddle ) / 0.7071;
    float edge = smoothstep( ${BLUR_CLEAR.toFixed(2)}, 1.0, r ) * amount;
    vec3 colour;
    if ( amount > 0.0 ) {
      colour = vec3( 0.0 );
      for ( int i = 0; i < ${BLUR_TAPS}; i ++ ) {
        float t = float( i ) / float( ${BLUR_TAPS} );
        colour += texture2D( tScene, vUv - fromMiddle * t * ${BLUR_REACH.toFixed(2)} * edge ).rgb;
      }
      colour /= float( ${BLUR_TAPS} );
    } else {
      colour = texture2D( tScene, vUv ).rgb;
    }
    colour += strength * (
      weights.x * texture2D( tBloom0, vUv ).rgb +
      weights.y * texture2D( tBloom1, vUv ).rgb +
      weights.z * texture2D( tBloom2, vUv ).rgb );
    gl_FragColor = vec4( colour, 1.0 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * An HDR target. No multisampling: it doubled what a course costs to open on a software renderer
 * (CI's scenario sweep); full quality draws at up to 2× pixel ratio on HiDPI screens, which
 * smooths the edges there.
 */
function target(depthBuffer = false): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer });
}

export class CoursePost {
  private readonly scene: THREE.WebGLRenderTarget = target(true);
  /** Per bloom level: the result and the scratch target its first blur direction goes to. */
  private readonly levels = Array.from({ length: LEVELS }, () => ({
    out: target(),
    tmp: target(),
  }));
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly size = new THREE.Vector2();
  /** The blur's step (texels, one axis at a time). */
  private readonly step = new THREE.Vector2();
  private width = 0;
  private height = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly world: THREE.Scene,
    private readonly camera: THREE.Camera,
    look: CourseLook,
  ) {
    const plain = { vertexShader: QUAD_VERTEX, depthTest: false, depthWrite: false };
    this.bright = new THREE.ShaderMaterial({
      ...plain,
      name: 'Mk8BloomBright',
      fragmentShader: BRIGHT_FRAGMENT,
      uniforms: { tScene: { value: null }, threshold: { value: look.bloom.threshold } },
      toneMapped: false,
    });
    this.blur = new THREE.ShaderMaterial({
      ...plain,
      name: 'Mk8BloomBlur',
      fragmentShader: BLUR_FRAGMENT,
      uniforms: { tInput: { value: null }, direction: { value: new THREE.Vector2() } },
      toneMapped: false,
    });
    const [w0, w1, w2] = LEVEL_WEIGHTS;
    this.composite = new THREE.ShaderMaterial({
      ...plain,
      name: 'Mk8Composite',
      fragmentShader: COMPOSITE_FRAGMENT,
      uniforms: {
        tScene: { value: this.scene.texture },
        tBloom0: { value: this.levels[0]?.out.texture },
        tBloom1: { value: this.levels[1]?.out.texture },
        tBloom2: { value: this.levels[2]?.out.texture },
        weights: { value: new THREE.Vector3(w0, w1, w2) },
        // The radius widens the glow by leaning on the smaller levels.
        strength: { value: look.bloom.strength * (1 + look.bloom.radius) },
        amount: { value: 0 },
      },
    });
  }

  /** How much the screen blurs now (0–1). */
  setBoost(amount: number): void {
    const uniform = this.composite.uniforms.amount;
    if (uniform) uniform.value = amount;
  }

  get boost(): number {
    return Number(this.composite.uniforms.amount?.value ?? 0);
  }

  /** Draws the frame; the renderer's stats count every pass (the perf budgets see the real cost). */
  render(): void {
    this.fit();
    const { renderer } = this;
    const info = renderer.info;
    const before = renderer.getRenderTarget();
    info.reset();
    info.autoReset = false;
    try {
      renderer.setRenderTarget(this.scene);
      renderer.render(this.world, this.camera);
      // Bright parts at a quarter size; then each level blurs the one before it (smaller each time):
      // across into its scratch target, then down into its result.
      const first = this.levels[0];
      if (first) this.pass(this.bright, { tScene: this.scene.texture }, first.out);
      let input = first?.out.texture;
      for (const { out, tmp } of this.levels) {
        this.pass(this.blur, { tInput: input, direction: this.step.set(1 / out.width, 0) }, tmp);
        this.pass(
          this.blur,
          { tInput: tmp.texture, direction: this.step.set(0, 1 / out.height) },
          out,
        );
        input = out.texture;
      }
      renderer.setRenderTarget(null);
      this.quad.material = this.composite;
      this.quad.render(renderer);
    } finally {
      renderer.setRenderTarget(before);
      info.autoReset = true;
    }
  }

  dispose(): void {
    this.scene.dispose();
    for (const { out, tmp } of this.levels) {
      out.dispose();
      tmp.dispose();
    }
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }

  private pass(
    material: THREE.ShaderMaterial,
    uniforms: Record<string, unknown>,
    into: THREE.WebGLRenderTarget,
  ): void {
    for (const [name, value] of Object.entries(uniforms)) {
      const uniform = material.uniforms[name];
      if (!uniform) continue;
      // Copied: the step vector is reused for the next pass.
      if (value instanceof THREE.Vector2 && uniform.value instanceof THREE.Vector2)
        uniform.value.copy(value);
      else uniform.value = value;
    }
    this.quad.material = material;
    this.renderer.setRenderTarget(into);
    this.quad.render(this.renderer);
  }

  /** Follows the canvas's size and adaptive quality's pixel ratio. */
  private fit(): void {
    this.renderer.getDrawingBufferSize(this.size);
    if (this.size.x === this.width && this.size.y === this.height) return;
    this.width = this.size.x;
    this.height = this.size.y;
    this.scene.setSize(this.width, this.height);
    let w = this.width / FIRST_LEVEL_DIVISOR;
    let h = this.height / FIRST_LEVEL_DIVISOR;
    for (const { out, tmp } of this.levels) {
      w = Math.max(1, Math.floor(w));
      h = Math.max(1, Math.floor(h));
      out.setSize(w, h);
      tmp.setSize(w, h);
      w /= 2;
      h /= 2;
    }
  }
}

import * as THREE from 'three';
import type { KartState, SimState } from '../sim/types';

/** Height of a tag's centre above the kart's origin, m. */
const TAG_HEIGHT = 1.7;
/** Tag size in the world up close, m (width follows the texture's aspect). */
const TAG_WORLD_HEIGHT = 0.5;
/** Beyond this distance a tag grows with it, so it keeps its size on screen instead of shrinking, m. */
const GROW_FROM = 14;
/** Tags start fading out here… */
const FADE_FROM = 55;
/** …and are hidden from here on, m. */
const HIDE_FROM = 70;
/** Texture size, px (the text is drawn once per name and colour). */
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 64;
const FONT = '700 36px system-ui, sans-serif';
const TEXT_MAX_WIDTH = TEXTURE_WIDTH - 24;

/**
 * The karts that get a name tag (MK-55): the other people in an online race, who have nicknames.
 * Not the kart the camera follows (you), not the AI, and not the unnamed parked karts of offline
 * test scenarios (also `remote`: only tests drive them).
 */
export function nameTagKarts(state: SimState, followId: number): KartState[] {
  return state.karts.filter(
    (kart) => kart.controller !== 'ai' && kart.name !== undefined && kart.id !== followId,
  );
}

/** A tag's world height and opacity at `distance` from the camera (0 opacity = hidden). */
export function tagSize(distance: number): { height: number; opacity: number } {
  if (distance >= HIDE_FROM) return { height: 0, opacity: 0 };
  const height = TAG_WORLD_HEIGHT * Math.max(1, distance / GROW_FROM);
  const fade = (distance - FADE_FROM) / (HIDE_FROM - FADE_FROM);
  return { height, opacity: 1 - Math.min(1, Math.max(0, fade)) };
}

interface Tag {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  texture: THREE.CanvasTexture;
  /** The name and colour drawn on it. */
  key: string;
}

/**
 * Name tags over the other people's karts (MK-55): the nickname in the player's colour, floating
 * above the kart, scaled with distance, fading out when far. Tags test depth like the rest of the
 * scene, so a hill or wall in front hides them.
 */
export class NameTags {
  private readonly tags = new Map<number, Tag>();
  private readonly cameraPosition = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Places a tag over each tagged kart's drawn model (`models`), for `camera`; hides the rest.
   * `enabled` is false for the menu cameras (lineup, overview).
   */
  sync(
    state: SimState,
    followId: number,
    models: (kartId: number) => THREE.Object3D | undefined,
    camera: THREE.Camera,
    colourOf: (kartId: number) => string,
    enabled: boolean,
  ): void {
    const tagged = enabled ? nameTagKarts(state, followId) : [];
    const shown = new Set<number>();
    camera.getWorldPosition(this.cameraPosition);
    for (const kart of tagged) {
      const model = models(kart.id);
      if (!model) continue;
      const tag = this.tag(kart.id, kart.name ?? '', colourOf(kart.id));
      tag.sprite.position.copy(model.position);
      tag.sprite.position.y += TAG_HEIGHT;
      const { height, opacity } = tagSize(tag.sprite.position.distanceTo(this.cameraPosition));
      if (opacity <= 0) continue;
      tag.sprite.scale.set((height * TEXTURE_WIDTH) / TEXTURE_HEIGHT, height, 1);
      tag.material.opacity = opacity;
      tag.sprite.visible = true;
      shown.add(kart.id);
    }
    for (const [kartId, tag] of this.tags) if (!shown.has(kartId)) tag.sprite.visible = false;
  }

  /** Removes every tag (a new race was loaded). */
  reset(): void {
    for (const tag of this.tags.values()) {
      this.scene.remove(tag.sprite);
      tag.material.dispose();
      tag.texture.dispose();
    }
    this.tags.clear();
  }

  /** Kart `kartId`'s tag, (re)drawn if its name or colour changed. */
  private tag(kartId: number, name: string, colour: string): Tag {
    const key = `${name}\n${colour}`;
    const existing = this.tags.get(kartId);
    if (existing?.key === key) return existing;
    if (existing) {
      drawTag(existing.texture.image as HTMLCanvasElement, name, colour);
      existing.texture.needsUpdate = true;
      existing.key = key;
      return existing;
    }
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_WIDTH;
    canvas.height = TEXTURE_HEIGHT;
    drawTag(canvas, name, colour);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = `name-tag-${kartId}`;
    sprite.renderOrder = 1;
    this.scene.add(sprite);
    const tag = { sprite, material, texture, key };
    this.tags.set(kartId, tag);
    return tag;
  }
}

/** A dark rounded pill with the name in the player's colour, outlined so any colour reads. */
function drawTag(canvas: HTMLCanvasElement, name: string, colour: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.font = FONT;
  const textWidth = Math.min(ctx.measureText(name).width, TEXT_MAX_WIDTH);
  const pillWidth = textWidth + height * 0.6;
  const x = (width - pillWidth) / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.roundRect(x, 4, pillWidth, height - 8, (height - 8) / 2);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.strokeText(name, width / 2, height / 2 + 2, TEXT_MAX_WIDTH);
  ctx.fillStyle = colour;
  ctx.fillText(name, width / 2, height / 2 + 2, TEXT_MAX_WIDTH);
}

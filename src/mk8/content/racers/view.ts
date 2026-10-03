// How an MK8 racer sits in its kart (MK-101): `<id>/render.ts` default-exports one of these. The
// model comes from the pack (`models/racers/<model>.glb`); `render/racerModel.ts` scales it to
// `height` and puts the bottom of its bounding box at `seat` in the kart.

export interface Mk8RacerView {
  /** The racer id (`mk8-mario`). */
  id: string;
  /** The pipeline's model id (`tools/mk8/sources.json`): `models/racers/<model>.glb`. */
  model: string;
  /** Height of the model once scaled, metres (sets the scale). */
  height: number;
  /** Where the bottom centre of the model sits, metres, in the kart's frame (+Y up, −Z forward). */
  seat: readonly [number, number, number];
  /** Extra turn about +Y, radians, for a model that doesn't face +Z (glTF's forward). */
  yaw?: number;
}

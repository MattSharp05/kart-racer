// Our five unique items' MK8-style looks (MK-115): their sims stay ours; in MK8 races the `mk8`
// skin gives the original renderer these models instead of our views' (`ItemSkin.looks`) and
// draws each one held over the driver. One line per item.
import bubbleShield from '../../content/items/bubble-shield/render';
import hornetSwarm from '../../content/items/hornet-swarm/render';
import magnet from '../../content/items/magnet/render';
import oilSlick from '../../content/items/oil-slick/render';
import phase from '../../content/items/phase/render';
import type { Mk8OurLook } from '../../content/items/ours/style';

export const MK8_OUR_LOOKS: readonly Mk8OurLook[] = [
  oilSlick,
  hornetSwarm,
  bubbleShield,
  magnet,
  phase,
];

/** Each look by item id. */
export const OUR_LOOKS: ReadonlyMap<string, Mk8OurLook> = new Map(
  MK8_OUR_LOOKS.map((look) => [look.id, look]),
);

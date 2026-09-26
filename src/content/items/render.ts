import type * as THREE from 'three';
import { items } from '.';
import { itemViews, registerItemView, type ItemRenderer } from './views';
import banana from './banana/render';
import boomerang from './boomerang/render';
import bubbleShield from './bubble-shield/render';
import green from './green/render';
import hornetSwarm from './hornet-swarm/render';
import inkCloud from './ink-cloud/render';
import lightning from './lightning/render';
import magnet from './magnet/render';
import mushroom from './mushroom/render';
import oilSlick from './oil-slick/render';
import phase from './phase/render';
import red from './red/render';
import star from './star/render';
import testKit from './test-kit/render';
import turboTrio from './turbo-trio/render';

export * from './views';

// One line per item folder, alphabetical (a unit test checks none is missing).
for (const view of [
  banana,
  boomerang,
  bubbleShield,
  green,
  hornetSwarm,
  inkCloud,
  lightning,
  magnet,
  mushroom,
  oilSlick,
  phase,
  red,
  star,
  testKit,
  turboTrio,
]) {
  registerItemView(view);
}

/** Each distinct item renderer class, in item order (the world creates one of each). */
export function itemRendererClasses(): (new (scene: THREE.Scene) => ItemRenderer)[] {
  const classes = items
    .list()
    .flatMap((item) => (itemViews.has(item.id) ? [itemViews.get(item.id).renderer] : []));
  return [...new Set(classes.filter((c) => c !== undefined))];
}

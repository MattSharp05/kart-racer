import type * as THREE from 'three';
import { items } from '.';
import { itemViews, registerItemView, type ItemRenderer } from './views';
import banana from './banana/render';
import green from './green/render';
import lightning from './lightning/render';
import mushroom from './mushroom/render';
import oilSlick from './oil-slick/render';
import red from './red/render';
import star from './star/render';
import testKit from './test-kit/render';
import turboTrio from './turbo-trio/render';

export * from './views';

// One line per item folder, alphabetical (a unit test checks none is missing).
for (const view of [banana, green, lightning, mushroom, oilSlick, red, star, testKit, turboTrio]) {
  registerItemView(view);
}

/** Each distinct item renderer class, in item order (the world creates one of each). */
export function itemRendererClasses(): (new (scene: THREE.Scene) => ItemRenderer)[] {
  const classes = items
    .list()
    .flatMap((item) => (itemViews.has(item.id) ? [itemViews.get(item.id).renderer] : []));
  return [...new Set(classes.filter((c) => c !== undefined))];
}

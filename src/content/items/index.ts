import { registerItem } from './registries';
import banana from './banana/sim';
import green from './green/sim';
import lightning from './lightning/sim';
import mushroom from './mushroom/sim';
import oilSlick from './oil-slick/sim';
import red from './red/sim';
import star from './star/sim';
import testKit from './test-kit/sim';
import turboTrio from './turbo-trio/sim';

export * from './registries';

// One line per item folder, alphabetical (a unit test checks none is missing).
for (const item of [banana, green, lightning, mushroom, oilSlick, red, star, testKit, turboTrio])
  registerItem(item);

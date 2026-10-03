// The MK8 UI kit's style guide (MK-104, `?scenario=mk8-ui-kit`): every kit component on three
// stacked screens. Mode tiles + colours + type → character grid + nameplate → a "ready" screen,
// so push/pop, the wipe, both tile kinds and every menu sound can be tried. Sprites come from the
// pack when it is loaded; without one (CI, previews) the tiles show stand-ins.
import type { Mk8ScreenFactory } from '../stack';
import {
  art,
  Menu,
  menuScreen,
  nameplate,
  panel,
  slanted,
  squareTile,
  TOKENS,
  wideTile,
  type TokenName,
} from './index';
import './styleGuide.css';

/** A sprite's URL when the pack has it. */
export type SpriteSource = (id: string) => string | undefined;

const MODES: { label: string; detail: string; sprite: string }[] = [
  { label: 'Grand Prix', detail: 'Race a cup of four courses', sprite: 'u_mushroomcup' },
  { label: 'Time Trials', detail: 'Race the clock', sprite: 'i_mushroom' },
  { label: 'VS Race', detail: 'Your own rules', sprite: 'i_green' },
];

interface Character {
  name: string;
  weight: string;
  sprite: string;
}

const MARIO: Character = { name: 'Mario', weight: 'Medium', sprite: 'c_mario' };
const CHARACTERS: Character[] = [
  MARIO,
  { name: 'Luigi', weight: 'Medium', sprite: 'c_luigi' },
  { name: 'Peach', weight: 'Medium', sprite: 'c_peach' },
  { name: 'Daisy', weight: 'Medium', sprite: 'c_daisy' },
  { name: 'Yoshi', weight: 'Medium', sprite: 'c_yoshi' },
  { name: 'Toad', weight: 'Light', sprite: 'c_toad' },
  { name: 'Koopa Troopa', weight: 'Light', sprite: 'c_koopa' },
  { name: 'Shy Guy', weight: 'Light', sprite: 'c_shyguy' },
];

const GRID_COLUMNS = 4;

const SWATCHES: TokenName[] = ['blue', 'blue-deep', 'sky', 'yellow', 'red', 'navy', 'grey', 'bar'];

function div(className: string, ...children: (Node | string)[]): HTMLDivElement {
  const node = document.createElement('div');
  node.className = className;
  node.append(...children);
  return node;
}

/** The first screen: mode tiles, the colour tokens and the type. */
export function styleGuide(sprites: SpriteSource): Mk8ScreenFactory {
  return (stack) => {
    const back = () => stack.back();
    const confirm = () => menu.confirm();
    const { el, body } = menuScreen({
      name: 'kit',
      title: 'UI kit',
      sub: 'Style guide',
      hints: [
        { button: 'a', label: 'OK', onPress: confirm },
        { button: 'b', label: 'Back', onPress: back },
      ],
    });
    body.classList.add('mk8-kit');
    const tiles = MODES.map((m) => wideTile(m.label, m.detail, art(sprites(m.sprite), m.label)));
    const menu = new Menu({
      items: tiles,
      sounds: stack.sounds,
      onConfirm: () => stack.push(characterSelect(sprites)),
    });

    const swatches = div('mk8-kit-swatches');
    for (const name of SWATCHES) {
      const chip = div('mk8-kit-swatch');
      chip.style.background = TOKENS[name];
      swatches.append(div('mk8-kit-token', chip, name));
    }
    const type = div(
      'mk8-kit-type',
      slanted('Heading 900', 'mk8-kit-h'),
      div('mk8-kit-b', 'Body 800 · M PLUS Rounded 1c'),
    );
    const side = panel('mk8-kit-side');
    side.append(type, swatches);
    body.append(div('mk8-kit-modes', ...tiles), side);
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/** The character grid with the nameplate panel. */
function characterSelect(sprites: SpriteSource): Mk8ScreenFactory {
  return (stack) => {
    const confirm = () => menu.confirm();
    const { el, body } = menuScreen({
      name: 'characters',
      title: 'Choose your character',
      hints: [
        { button: 'a', label: 'OK', onPress: confirm },
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-kit-chars');
    const big = div('mk8-kit-big');
    const plate = nameplate('');
    const side = panel('mk8-kit-portrait');
    side.append(big, plate.el);
    const tiles = CHARACTERS.map((c) => squareTile(c.name, art(sprites(c.sprite), c.name)));
    const show = (index: number) => {
      const c = CHARACTERS[index] ?? MARIO;
      big.replaceChildren(art(sprites(c.sprite), c.name));
      plate.set(c.name, c.weight);
      // Restart the pop.
      plate.el.classList.remove('pop');
      void plate.el.offsetWidth;
      plate.el.classList.add('pop');
    };
    const menu = new Menu({
      items: tiles,
      columns: GRID_COLUMNS,
      sounds: stack.sounds,
      onSelect: show,
      onConfirm: (index) => stack.push(ready(sprites, index)),
    });
    body.append(side, div('mk8-kit-grid', ...tiles));
    return { el, onKey: (e) => menu.handleKey(e) };
  };
}

/** The chosen character's name appears (the name-appear sound). */
function ready(sprites: SpriteSource, index: number): Mk8ScreenFactory {
  return (stack) => {
    const c = CHARACTERS[index] ?? MARIO;
    const { el, body } = menuScreen({
      name: 'ready',
      title: 'Ready!',
      hints: [{ button: 'b', label: 'Back', onPress: () => stack.back() }],
    });
    body.classList.add('mk8-kit-ready');
    const plate = nameplate(c.name, `${c.weight} · the name-appear sound plays`);
    plate.el.classList.add('pop');
    body.append(div('mk8-kit-big', art(sprites(c.sprite), c.name)), plate.el);
    stack.sounds.play('ui/name-appear');
    return { el };
  };
}

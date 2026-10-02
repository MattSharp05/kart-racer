// `/dev/mk8-sprites.html` (MK-95): every MK8 UI sprite with its id and size, for QA. Images load
// from the MK8 asset base (`?base=` to override); `pnpm dev` serves `$MK8_OUT` there.
import {
  MK8_ASSET_BASE,
  SPRITES,
  spriteUrl,
  type Sprite,
  type SpriteGroup,
} from '../mk8/ui/sprites';
import './mk8Sprites.css';

const base = new URLSearchParams(window.location.search).get('base') ?? MK8_ASSET_BASE;

function tile(id: string, sprite: Sprite): HTMLElement {
  const item = document.createElement('figure');
  item.className = 'sprite';
  item.dataset.sprite = id;
  const img = document.createElement('img');
  img.src = spriteUrl(id, base);
  img.alt = id;
  img.width = sprite.width;
  img.height = sprite.height;
  img.style.maxWidth = '100%';
  img.addEventListener('error', () => item.classList.add('missing'));
  img.addEventListener('load', () => {
    if (img.naturalWidth !== sprite.width || img.naturalHeight !== sprite.height)
      item.classList.add('wrong-size');
  });
  const caption = document.createElement('figcaption');
  caption.innerHTML = `<b>${id}</b> ${sprite.width}×${sprite.height}${sprite.transparent ? ' · keyed' : ''}`;
  item.append(img, caption);
  return item;
}

function render(app: HTMLElement): void {
  const heading = document.createElement('h1');
  heading.textContent = 'MK8 UI sprites';
  const note = document.createElement('p');
  note.textContent = `${Object.keys(SPRITES).length} sprites from ${base}. Built by pnpm mk8:build; a red tile means the file isn't there, an orange one a size different from src/mk8/ui/sprites.ts.`;
  const font = document.createElement('p');
  font.className = 'font-sample';
  font.innerHTML =
    '<span style="font-weight:800">M PLUS Rounded 1c 800 · 1st 2nd 3rd 150cc</span><br><span style="font-weight:900">900 · Mushroom Cup 0123456789</span>';
  app.append(heading, note, font);

  const groups = new Map<SpriteGroup, [string, Sprite][]>();
  for (const [id, sprite] of Object.entries(SPRITES))
    groups.set(sprite.group, [...(groups.get(sprite.group) ?? []), [id, sprite]]);
  for (const [group, sprites] of groups) {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = `${group} (${sprites.length})`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.append(...sprites.map(([id, sprite]) => tile(id, sprite)));
    section.append(title, grid);
    app.append(section);
  }
}

const app = document.querySelector<HTMLElement>('#app');
if (app) render(app);

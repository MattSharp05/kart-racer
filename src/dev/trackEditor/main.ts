// `/dev/track-editor.html?course=<id>` (MK-100, ADR 0010): authors a mesh course's route on top of
// its collision mesh. Dev only (its own HTML entry, never in the game bundle); desktop only. How to
// use it: docs/mk8-track-editor.md. `window.__editor` is the e2e test API.
import {
  clearEditorRoute,
  editorRouteKey,
  loadEditorRoute,
  saveEditorRoute,
  testDriveUrl,
} from '../../mk8/editorRoute';
import { MK8_ASSET_BASE } from '../../mk8/ui/sprites';
import { mk8Course } from '../../mk8/content/courses';
import { guessSurface } from '../../../tools/mk8/collisionFormat';
import type { Vec3 } from '../../sim/math';
import type { MeshMaterialSurface } from '../../sim/meshCollision';
import { MESH_SURFACES } from '../../sim/meshCollision';
import type { RouteDef, RouteZone } from '../../sim/route';
import { validateRoute, type RouteIssue } from '../../sim/routeValidation';
import { knownCourses, loadCourse, type EditorCourse } from './courses';
import {
  EditorModel,
  emptyRoute,
  listOf,
  type Layer,
  type ListLayer,
  type ZoneTool,
} from './model';
import { EditorScene, SURFACE_COLOURS, type Handle } from './scene';
import { materialsSource, routeSource } from './serialize';
import './trackEditor.css';

/** The dev server's write endpoint (`devServer.ts`, mounted by vite.config.ts under `pnpm dev`). */
const SAVE_PATH = '/__track-editor/save';
/** A press that moves less than this, px, is a click (not an orbit drag). */
const CLICK_SLOP = 5;

const LAYERS: { id: Layer; label: string; hint: string }[] = [
  {
    id: 'route',
    label: 'Route',
    hint: 'Click: add a point (after the selected one). Drag a point to move it, its blue handles to set the width. Del deletes.',
  },
  {
    id: 'racingLine',
    label: 'Racing line',
    hint: 'Click beside a point: the AI line passes there. Or drag the yellow handle of the selected point.',
  },
  {
    id: 'gates',
    label: 'Gates',
    hint: 'Click on the road: a lap gate (checkpoint) there. The finish line is gate 1 at t = 0.',
  },
  {
    id: 'respawn',
    label: 'Respawn',
    hint: 'Click: a respawn point. Falls between its from and to put karts back here.',
  },
  {
    id: 'grid',
    label: 'Grid',
    hint: 'Click: a grid slot (pole first, 8 in all), or use Auto grid.',
  },
  { id: 'itemBoxes', label: 'Item boxes', hint: 'Click: a row of item boxes across the road.' },
  { id: 'coins', label: 'Coins', hint: 'Click the start, then the end of a coin line.' },
  {
    id: 'zones',
    label: 'Zones',
    hint: 'Glide / anti-gravity: click start and end. Water: click two opposite corners. Bumper: one click.',
  },
];
const ZONE_TOOLS: { id: ZoneTool; label: string }[] = [
  { id: 'glide', label: 'Glide ramp' },
  { id: 'antigrav', label: 'Anti-gravity section' },
  { id: 'water', label: 'Water volume' },
  { id: 'boostBumper', label: 'Boost bumper' },
];

declare global {
  interface Window {
    __editor?: {
      ready: boolean;
      route: () => RouteDef;
      issues: () => RouteIssue[];
      routeSource: () => string;
      screenOf: (p: Vec3) => { x: number; y: number };
      lookAt: (target: Vec3, distance: number, view?: 'top' | 'angled') => void;
      setLayer: (layer: Layer) => void;
    };
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children);
  return node;
}

function numberField(label: string, value: number, onCommit: (v: number) => void, step = 0.01) {
  const input = el('input', { type: 'number', step: String(step), value: String(value) });
  input.addEventListener('change', () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onCommit(v);
  });
  return el('label', { className: 'field' }, el('span', {}, label), input);
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/typescript' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function coursePicker(app: HTMLElement, message?: string): void {
  const list = el(
    'ul',
    {},
    ...knownCourses().map((id) =>
      el('li', {}, el('a', { href: `?course=${encodeURIComponent(id)}` }, id)),
    ),
  );
  const input = el('input', { name: 'course', placeholder: 'mario-kart-stadium' });
  const form = el('form', { method: 'get' }, input, el('button', { type: 'submit' }, 'Open'));
  app.append(
    el(
      'div',
      { className: 'picker' },
      el('h1', {}, 'MK8 track editor'),
      ...(message ? [el('p', { className: 'error' }, message)] : []),
      el(
        'p',
        {},
        'Pick a course with a route, or type a pack course id (needs the local MK8 pack).',
      ),
      list,
      form,
    ),
  );
}

/** The `route.ts` a draft was made on (JSON), so a draft never replaces a newer file unasked. */
const draftBaseKey = (id: string) => `${editorRouteKey(id)}:base`;

function readDraftBase(id: string): string | null {
  try {
    return localStorage.getItem(draftBaseKey(id));
  } catch {
    return null;
  }
}

function writeDraftBase(id: string, base: string): void {
  try {
    localStorage.setItem(draftBaseKey(id), base);
  } catch {
    // Storage full or blocked: the draft won't be restored.
  }
}

function clearDraftBase(id: string): void {
  try {
    localStorage.removeItem(draftBaseKey(id));
  } catch {
    // Nothing to clear.
  }
}

class TrackEditor {
  readonly model: EditorModel;
  readonly scene: EditorScene;
  layer: Layer = 'route';
  zoneTool: ZoneTool = 'glide';
  private readonly overrides: Record<string, MeshMaterialSurface>;
  private readonly materialNames: string[] = [];
  /** The route as in `route.ts` (updated by a Save). */
  private committed: RouteDef;
  /** A draft made on an older `route.ts`, offered but not restored. */
  private staleDraft: RouteDef | undefined;
  private issues: RouteIssue[] = [];
  private status = '';
  private hover = '';
  private drag: Handle | undefined;
  private down: { x: number; y: number } | undefined;
  private readonly panel = el('aside', { className: 'panel' });
  private readonly toolbar = el('nav', { className: 'tools' });
  private readonly statusLine = el('div', { className: 'status' });

  constructor(
    app: HTMLElement,
    private readonly course: EditorCourse,
  ) {
    this.committed = course.route ?? emptyRoute();
    const draft = loadEditorRoute(course.id);
    const committedJson = JSON.stringify(this.committed);
    const differs = draft !== undefined && JSON.stringify(draft) !== committedJson;
    // Only restore a draft made on this very route.ts; one from before a pull or a hand edit is
    // offered instead, so it can't silently replace the newer file.
    const restored = differs && readDraftBase(course.id) === committedJson;
    if (differs && !restored) this.staleDraft = draft;
    this.model = new EditorModel(restored ? draft : this.committed);
    this.overrides = { ...course.materials };

    const viewport = el('div', { className: 'viewport' });
    app.append(
      el(
        'div',
        { className: 'editor' },
        el(
          'header',
          {},
          el('b', {}, 'MK8 track editor'),
          ` · ${course.id} · `,
          el('a', { href: '/dev.html' }, 'scenarios'),
          ' · ',
          el('a', { href: '?' }, 'other course'),
        ),
        this.toolbar,
        viewport,
        this.panel,
        this.statusLine,
      ),
    );
    this.scene = new EditorScene(viewport);
    this.scene.setCollision(course.collision);
    if (course.model) {
      this.scene.setModel(course.model);
      const names = new Set<string>();
      course.model.traverse((o) => {
        const material = (o as { material?: { name: string } | { name: string }[] }).material;
        for (const m of Array.isArray(material) ? material : material ? [material] : [])
          names.add(m.name);
      });
      this.materialNames.push(...[...names].sort());
      this.scene.setCollisionVisible(false);
    }
    this.status = [
      ...course.warnings,
      restored ? 'Restored your unsaved draft (Discard draft to go back to the file).' : '',
      this.staleDraft
        ? 'route.ts changed since your last draft: the file is loaded (Restore older draft to use the draft).'
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    this.model.onChange(() => {
      this.keepDraft();
      this.refresh();
    });
    this.bindPointer(viewport);
    this.bindKeys();
    this.refresh();

    window.__editor = {
      ready: true,
      route: () => structuredClone(this.model.route),
      issues: () => this.issues,
      routeSource: () => routeSource(this.model.route, course.id),
      screenOf: (p) => this.scene.screenOf(p),
      lookAt: (target, distance, view) => this.scene.lookAt(target, distance, view),
      setLayer: (layer) => this.setLayer(layer),
    };
  }

  surfaceOf = (material: string): MeshMaterialSurface =>
    this.overrides[material] ?? guessSurface(material);

  setLayer(layer: Layer): void {
    this.layer = layer;
    this.model.cancelPending();
    this.refresh();
  }

  // --- Input ---

  private bindPointer(viewport: HTMLElement): void {
    // Capture phase, so a press on a handle turns the orbit controls off before they see it.
    viewport.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        this.down = { x: e.clientX, y: e.clientY };
        const handle = this.scene.pickHandle(e.clientX, e.clientY);
        if (!handle) return;
        this.drag = handle;
        this.scene.controls.enabled = false;
        this.model.checkpoint();
        if (handle.kind === 'point' && this.model.selected !== handle.index)
          this.model.select(handle.index);
      },
      { capture: true },
    );
    viewport.addEventListener('pointermove', (e) => {
      if (this.drag) this.dragTo(this.drag, e.clientX, e.clientY);
      else this.hoverAt(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', (e) => {
      const down = this.down;
      this.down = undefined;
      if (this.drag) {
        this.drag = undefined;
        this.scene.controls.enabled = true;
        return;
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
      if (e.target !== this.scene.renderer.domElement) return;
      this.clickAt(e.clientX, e.clientY);
    });
  }

  private clickAt(x: number, y: number): void {
    const pick = this.scene.pickCollision(x, y);
    if (!pick) {
      this.setStatus('Click on the course');
      return;
    }
    this.setStatus(this.model.place(this.layer, pick, this.zoneTool));
  }

  private dragTo(handle: Handle, x: number, y: number): void {
    const pick = this.scene.pickCollision(x, y);
    if (!pick) return;
    if (handle.kind === 'point') {
      this.model.movePoint(handle.index, pick, false);
      return;
    }
    const point = this.model.route.points[handle.index];
    const frame = this.model.frameAtPoint(handle.index);
    if (!point || !frame) return;
    const offset =
      (pick.point.x - point.x) * frame.right.x +
      (pick.point.y - point.y) * frame.right.y +
      (pick.point.z - point.z) * frame.right.z;
    if (handle.kind === 'width') this.model.setWidth(handle.index, Math.abs(offset) * 2, false);
    else this.model.setRacingLine(handle.index, offset, false);
  }

  private hoverAt(x: number, y: number): void {
    const pick = this.scene.pickCollision(x, y);
    const material = this.scene.pickMaterial(x, y);
    const parts: string[] = [];
    if (material !== undefined) parts.push(`material ${material} → ${this.surfaceOf(material)}`);
    if (pick) {
      parts.push(`collision: ${pick.surface} (triangle ${pick.triangle})`);
      const p = pick.point;
      parts.push(`(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
      const at = this.model.locate(p);
      if (at) parts.push(`t ${at.t.toFixed(4)} · lateral ${at.lateral.toFixed(2)}`);
    }
    this.hover = parts.join(' · ');
    this.renderStatus();
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.model.redo();
        else this.model.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.model.redo();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        this.model.selected !== undefined
      ) {
        this.model.deletePoint(this.model.selected);
      } else if (e.key === 'Escape') {
        if (this.model.pending) this.model.cancelPending();
        else this.model.select(undefined);
      } else if (e.key === 'f' || e.key === 'F') {
        this.scene.frameAll();
      } else if (/^[1-8]$/.test(e.key) && !mod) {
        const layer = LAYERS[Number(e.key) - 1];
        if (layer) this.setLayer(layer.id);
      }
    });
  }

  private setStatus(message: string): void {
    this.status = message;
    this.renderStatus();
  }

  private renderStatus(): void {
    this.statusLine.replaceChildren(
      el('span', { className: 'message' }, this.status),
      el('span', { className: 'hover' }, this.hover),
    );
  }

  // --- Panels ---

  private refresh(): void {
    this.issues = validateRoute(this.model.route, this.course.collision);
    this.scene.drawRoute(this.model);
    this.renderToolbar();
    this.renderPanel();
    this.renderStatus();
  }

  private renderToolbar(): void {
    const layerButtons = LAYERS.map((layer, i) =>
      el(
        'button',
        {
          className: layer.id === this.layer ? 'active' : '',
          title: `${layer.hint} (key ${i + 1})`,
          dataset: { layer: layer.id },
          onclick: () => this.setLayer(layer.id),
        },
        `${i + 1} ${layer.label}`,
      ),
    );
    const zoneSelect = el('select', { name: 'zone' });
    zoneSelect.append(
      ...ZONE_TOOLS.map((z) =>
        el('option', { value: z.id, selected: z.id === this.zoneTool }, z.label),
      ),
    );
    zoneSelect.addEventListener('change', () => {
      this.zoneTool = zoneSelect.value as ZoneTool;
      this.model.cancelPending();
    });
    const toggle = (label: string, checked: boolean, onChange: (on: boolean) => void) => {
      const box = el('input', { type: 'checkbox', checked });
      box.addEventListener('change', () => onChange(box.checked));
      return el('label', { className: 'toggle' }, box, label);
    };
    const hint = LAYERS.find((l) => l.id === this.layer)?.hint ?? '';
    this.toolbar.replaceChildren(
      el('h2', {}, 'Layers'),
      ...layerButtons,
      ...(this.layer === 'zones' ? [zoneSelect] : []),
      el('p', { className: 'hint' }, hint),
      el('h2', {}, 'View'),
      toggle('Collision (by surface)', !this.scene.hasModel, (on) =>
        this.scene.setCollisionVisible(on),
      ),
      ...(this.scene.hasModel
        ? [
            toggle('Course model', true, (on) => this.scene.setModelVisible(on)),
            toggle('Model by surface', false, (on) =>
              this.scene.colourModel(on ? this.surfaceOf : undefined),
            ),
          ]
        : []),
      el('button', { onclick: () => this.scene.frameAll() }, 'Frame all (F)'),
      this.legend(),
      el(
        'p',
        { className: 'hint' },
        'Drag: orbit · right-drag: pan · wheel: zoom · WASD/QE: fly (Shift faster) · Ctrl+Z / Ctrl+Shift+Z · Esc',
      ),
    );
  }

  private legend(): HTMLElement {
    return el(
      'ul',
      { className: 'legend' },
      ...MESH_SURFACES.map((s) => {
        const swatch = el('i');
        swatch.style.background = `#${SURFACE_COLOURS[s].toString(16).padStart(6, '0')}`;
        return el('li', {}, swatch, s);
      }),
    );
  }

  private renderPanel(): void {
    this.panel.replaceChildren(
      this.layerSection(),
      this.validationSection(),
      this.exportSection(),
      ...(this.materialNames.length ? [this.materialsSection()] : []),
    );
  }

  private layerSection(): HTMLElement {
    const section = el('section', { className: 'layer' });
    const { route } = this.model;
    const label = LAYERS.find((l) => l.id === this.layer)?.label ?? '';
    if (this.layer === 'route' || this.layer === 'racingLine') {
      section.append(el('h2', {}, `${label} · ${route.points.length} points`));
      const i = this.model.selected;
      const point = i === undefined ? undefined : route.points[i];
      if (i === undefined || !point) {
        section.append(el('p', { className: 'hint' }, 'Click a point to select it.'));
        return section;
      }
      section.append(
        el('p', {}, `Point ${i + 1}: (${point.x}, ${point.y}, ${point.z})`),
        numberField('Width', point.width, (v) => this.model.setWidth(i, v), 0.5),
        numberField(
          'Racing line',
          point.racingLine ?? 0,
          (v) => this.model.setRacingLine(i, v),
          0.5,
        ),
        el('button', { onclick: () => this.model.deletePoint(i) }, 'Delete point'),
        el('button', { onclick: () => this.model.select(undefined) }, 'Deselect'),
      );
      return section;
    }
    const layer = this.layer;
    const items = listOf(route, layer);
    section.append(el('h2', {}, `${label} · ${items.length}`));
    if (layer === 'grid')
      section.append(
        el('button', { onclick: () => this.model.autoGrid() }, 'Auto grid (8 behind the line)'),
      );
    const list = el('ol', { className: 'items' });
    items.forEach((_, index) => list.append(this.itemRow(layer, index)));
    section.append(list);
    return section;
  }

  private itemRow(layer: ListLayer, index: number): HTMLElement {
    const { route } = this.model;
    const fields: HTMLElement[] = [];
    const set = <T extends object>(item: T, patch: Partial<T>) =>
      this.model.update(layer, index, { ...item, ...patch } as never);
    switch (layer) {
      case 'gates': {
        const t = route.checkpoints[index] ?? 0;
        fields.push(numberField('t', t, (v) => this.model.update('gates', index, v), 0.001));
        break;
      }
      case 'respawn': {
        const r = route.respawnPoints[index];
        if (r)
          fields.push(
            numberField('t', r.t, (v) => set(r, { t: v }), 0.001),
            numberField('from', r.from, (v) => set(r, { from: v }), 0.001),
            numberField('to', r.to, (v) => set(r, { to: v }), 0.001),
          );
        break;
      }
      case 'grid': {
        const g = route.gridSlots[index];
        if (g)
          fields.push(
            numberField('t', g.t, (v) => set(g, { t: v }), 0.001),
            numberField('lateral', g.lateral, (v) => set(g, { lateral: v }), 0.5),
          );
        break;
      }
      case 'itemBoxes': {
        const row = route.itemBoxRows[index];
        if (row) {
          const input = el('input', { value: row.laterals.join(', ') });
          input.addEventListener('change', () => {
            const laterals = input.value.split(',').map(Number).filter(Number.isFinite);
            set(row, { laterals });
          });
          fields.push(
            numberField('t', row.t, (v) => set(row, { t: v }), 0.001),
            el('label', { className: 'field' }, el('span', {}, 'laterals'), input),
          );
        }
        break;
      }
      case 'coins': {
        const line = route.coinLines[index];
        if (line)
          fields.push(
            numberField('from', line.from, (v) => set(line, { from: v }), 0.001),
            numberField('to', line.to, (v) => set(line, { to: v }), 0.001),
            numberField('lateral', line.lateral, (v) => set(line, { lateral: v }), 0.5),
            numberField(
              'count',
              line.count,
              (v) => set(line, { count: Math.max(1, Math.round(v)) }),
              1,
            ),
            numberField(
              'spacing m',
              Number((this.model.coinSpacing(index) ?? 0).toFixed(2)),
              (v) => this.model.setCoinSpacing(index, v),
              0.5,
            ),
          );
        break;
      }
      case 'zones': {
        const zone = route.zones[index];
        if (zone)
          fields.push(...this.zoneFields(zone, (z) => this.model.update('zones', index, z)));
        break;
      }
    }
    return el(
      'li',
      { dataset: { layer, index: String(index) } },
      ...fields,
      el('button', { className: 'remove', onclick: () => this.model.remove(layer, index) }, '✕'),
    );
  }

  private zoneFields(zone: RouteZone, commit: (z: RouteZone) => void): HTMLElement[] {
    const kind = el('b', {}, ZONE_TOOLS.find((z) => z.id === zone.kind)?.label ?? zone.kind);
    if (zone.kind === 'glide' || zone.kind === 'antigrav')
      return [
        kind,
        numberField('from', zone.from, (v) => commit({ ...zone, from: v }), 0.001),
        numberField('to', zone.to, (v) => commit({ ...zone, to: v }), 0.001),
      ];
    const vec = (name: string, p: Vec3, onCommit: (p: Vec3) => void) =>
      (['x', 'y', 'z'] as const).map((axis) =>
        numberField(`${name}.${axis}`, p[axis], (v) => onCommit({ ...p, [axis]: v }), 0.5),
      );
    if (zone.kind === 'water')
      return [
        kind,
        ...vec('min', zone.min, (min) => commit({ ...zone, min })),
        ...vec('max', zone.max, (max) => commit({ ...zone, max })),
      ];
    return [
      kind,
      ...vec('at', zone.position, (position) => commit({ ...zone, position })),
      numberField('radius', zone.radius, (radius) => commit({ ...zone, radius }), 0.25),
    ];
  }

  private validationSection(): HTMLElement {
    const section = el('section', { className: 'validation' });
    section.append(
      el('h2', {}, this.issues.length ? `Problems · ${this.issues.length}` : 'No problems'),
    );
    const list = el('ul', { className: 'issues' });
    for (const issue of this.issues) {
      const layer = issue.layer === 'route' ? 'route' : issue.layer;
      list.append(
        el('li', {}, el('button', { onclick: () => this.setLayer(layer) }, issue.message)),
      );
    }
    section.append(list);
    return section;
  }

  private exportSection(): HTMLElement {
    const { id } = this.course;
    const routeFile = () => routeSource(this.model.route, id);
    const buttons: HTMLElement[] = [
      el(
        'button',
        { dataset: { action: 'download-route' }, onclick: () => download('route.ts', routeFile()) },
        'Download route.ts',
      ),
      el(
        'button',
        {
          onclick: () =>
            void navigator.clipboard
              .writeText(routeFile())
              .then(() => this.setStatus('route.ts copied'))
              .catch(() => this.setStatus('Copy failed: use Download')),
        },
        'Copy route.ts',
      ),
    ];
    if (import.meta.env.DEV && !this.course.handWritten)
      buttons.push(
        el(
          'button',
          { onclick: () => void this.save('route') },
          `Save to src/mk8/content/courses/${id}/route.ts`,
        ),
      );
    buttons.push(
      el('button', { onclick: () => this.testDrive() }, 'Test drive'),
      el(
        'button',
        {
          onclick: () => {
            this.model.load(this.committed);
            this.setStatus('Back to the committed route.ts (Ctrl+Z undoes)');
          },
        },
        'Discard draft',
      ),
    );
    const stale = this.staleDraft;
    if (stale)
      buttons.push(
        el(
          'button',
          {
            onclick: () => {
              this.staleDraft = undefined;
              this.model.load(stale);
              this.setStatus('Restored the older draft (Ctrl+Z undoes)');
            },
          },
          'Restore older draft',
        ),
      );
    return el('section', { className: 'export' }, el('h2', {}, 'Export'), ...buttons);
  }

  private materialsSection(): HTMLElement {
    const section = el(
      'section',
      { className: 'materials' },
      el('h2', {}, `Materials · ${this.materialNames.length}`),
    );
    const list = el('ul', {});
    for (const name of this.materialNames) {
      const select = el('select', {});
      const current = this.surfaceOf(name);
      select.append(
        ...[...MESH_SURFACES, 'ignore' as const].map((s) =>
          el('option', { value: s, selected: s === current }, s),
        ),
      );
      select.addEventListener('change', () => {
        this.overrides[name] = select.value as MeshMaterialSurface;
        this.refresh();
      });
      const overridden = name in this.overrides;
      list.append(
        el(
          'li',
          { className: overridden ? 'overridden' : '' },
          el('span', { title: name }, name),
          select,
        ),
      );
    }
    const file = () => materialsSource(this.overrides, this.course.id);
    section.append(
      el(
        'p',
        { className: 'hint' },
        mk8Course(this.course.id)?.collisionFromModel
          ? 'Unlisted materials use the name guesses. This course builds its collision from the model at load: saved overrides apply on the next page load, no pack rebuild.'
          : 'Unlisted materials use the name guesses. Overrides apply at the next pnpm mk8:build.',
      ),
      list,
      el('button', { onclick: () => download('materials.ts', file()) }, 'Download materials.ts'),
      ...(import.meta.env.DEV
        ? [el('button', { onclick: () => void this.save('materials') }, 'Save materials.ts')]
        : []),
    );
    return section;
  }

  /** Sends the data (the dev server writes the file from it, see `devServer.ts`). */
  private async save(file: 'route' | 'materials'): Promise<void> {
    const route = structuredClone(this.model.route);
    const data = file === 'route' ? { route } : { materials: { ...this.overrides } };
    try {
      const response = await fetch(SAVE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course: this.course.id, file, ...data }),
      });
      const body = (await response.json()) as { path?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? response.statusText);
      if (file === 'route') {
        this.committed = route;
        this.keepDraft();
      }
      this.setStatus(`Saved ${body.path}`);
    } catch (error) {
      this.setStatus(`Save failed: ${String(error)}`);
    }
  }

  /** Keeps the route as the course's draft while it differs from `route.ts`; clears it otherwise. */
  private keepDraft(): void {
    const { id } = this.course;
    const committed = JSON.stringify(this.committed);
    if (JSON.stringify(this.model.route) === committed) {
      clearEditorRoute(id);
      clearDraftBase(id);
    } else {
      saveEditorRoute(id, this.model.route);
      writeDraftBase(id, committed);
    }
  }

  private testDrive(): void {
    saveEditorRoute(this.course.id, this.model.route);
    window.open(testDriveUrl(this.course.id), '_blank');
  }
}

async function start(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('course');
  if (!id) {
    coursePicker(app);
    return;
  }
  try {
    const course = await loadCourse(id, params.get('base') ?? MK8_ASSET_BASE);
    new TrackEditor(app, course);
  } catch (error) {
    coursePicker(app, String(error instanceof Error ? error.message : error));
  }
}

void start();

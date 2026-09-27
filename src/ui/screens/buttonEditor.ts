import type { Hand } from '../../game/storage/settings';
import { readSettings, updateSettings } from '../../game/storage/settings';
import type { KeyValueStore } from '../../game/storage/store';
import {
  BUTTON_SIZE_MAX,
  BUTTON_SIZE_MIN,
  clampSize,
  defaultButtonLayout,
  dropButton,
  separateButtons,
  toPosition,
  TOUCH_BUTTONS,
  type Area,
  type ButtonCircle,
  type ButtonLayout,
  type TouchButtonName,
} from '../../input/buttonLayout';
import { applyButtonLayout, setTouchLayout, touchHand } from '../../input/touch';
import { registerScreen } from '../router';
import { button, heading } from './common';
import './buttonEditor.css';

export interface ButtonEditorProps {
  store: KeyValueStore;
  /** Leave the editor (after Save or Cancel). */
  onClose: () => void;
}

declare module '../router' {
  interface ScreenProps {
    buttonEditor: ButtonEditorProps;
  }
}

/** Hold this long without moving to pick one button's size instead of all of them. */
const LONG_PRESS_MS = 450;
/** A finger moving further than this (px) is a drag, not a long-press. */
const DRAG_SLOP_PX = 8;
const LABELS: Record<TouchButtonName, string> = { drift: 'Drift', item: 'Item', brake: 'Brake' };

/** The safe area on screen (client px), for converting between the page and the stored layout. */
interface SafeBox {
  left: number;
  right: number;
  bottom: number;
  area: Area;
}

/**
 * The button editor (MK-57), from Settings → Controls → Customise buttons, over the paused race:
 * a copy of the touch buttons, laid out exactly like the real ones (same CSS, same hand). Drag a
 * button to move it (it snaps back if dropped on another; it can't leave the screen). The slider
 * sizes all buttons, or one after a long-press on it. Save applies to the live controls and keeps
 * it; Reset goes back to the default layout (Save keeps that too).
 */
registerScreen('buttonEditor', (panel, { store, onClose }) => {
  let layout = structuredClone(readSettings(store).buttons);
  const hand: Hand = touchHand();
  let selected: TouchButtonName | null = null;

  // The preview: a `.touch-controls` like the live one, so it looks and lays out the same.
  const preview = document.createElement('div');
  preview.className = 'touch-controls button-editor-preview';
  preview.dataset.hand = hand;
  const safe = document.createElement('div');
  safe.className = 'button-editor-safe';
  const group = document.createElement('div');
  group.className = 'touch-buttons';
  const buttons = {} as Record<TouchButtonName, HTMLElement>;
  // Same DOM order as the live controls.
  for (const name of ['brake', 'item', 'drift'] as const) {
    const el = document.createElement('div');
    el.className = `touch-button touch-${name}`;
    el.textContent = LABELS[name];
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Move ${LABELS[name]}`);
    buttons[name] = el;
    group.append(el);
  }
  preview.append(safe, group);

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'button-editor-size-label';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'button-editor-size';
  slider.min = String(BUTTON_SIZE_MIN * 100);
  slider.max = String(BUTTON_SIZE_MAX * 100);
  slider.step = '5';
  const sizeRow = document.createElement('label');
  sizeRow.className = 'button-editor-size-row';
  sizeRow.append(sizeLabel, slider);

  const toolbar = document.createElement('div');
  toolbar.className = 'button-editor-toolbar';
  const hint = document.createElement('p');
  hint.className = 'button-editor-hint';
  hint.textContent = 'Drag a button to move it · long-press one to size it alone';
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(
    button(
      'Reset to default',
      () => {
        layout = defaultButtonLayout();
        select(null);
        render();
      },
      'button-editor-reset',
    ),
    button('Cancel', onClose, 'button-editor-cancel'),
    button('Save', save, 'primary button-editor-save'),
  );
  toolbar.append(heading('h2', 'Customise buttons'), hint, sizeRow, actions);
  panel.append(preview, toolbar);

  slider.addEventListener('input', () => {
    const size = clampSize(Number(slider.value) / 100);
    if (selected) layout.sizes[selected] = size;
    else layout.scale = size;
    render();
    // Bigger buttons may now touch: push them apart and keep them on screen.
    if (layout.positions) {
      const box = safeBox();
      const moved = separateButtons(circles(box), box.area);
      for (const name of TOUCH_BUTTONS) layout.positions[name] = toPosition(moved[name], box.area);
      render();
    }
  });

  function save(): void {
    updateSettings(store, { buttons: layout });
    setTouchLayout(structuredClone(layout));
    onClose();
  }

  function select(name: TouchButtonName | null): void {
    selected = name;
    for (const n of TOUCH_BUTTONS) buttons[n].classList.toggle('selected', n === name);
    renderSlider();
  }

  function renderSlider(): void {
    const size = selected ? layout.sizes[selected] : layout.scale;
    slider.value = String(Math.round(size * 100));
    sizeLabel.textContent = `${selected ? `${LABELS[selected]} size` : 'Size'} ${Math.round(size * 100)}%`;
  }

  function render(): void {
    applyButtonLayout(preview, layout);
    renderSlider();
  }

  function safeBox(): SafeBox {
    const r = safe.getBoundingClientRect();
    return {
      left: r.left,
      right: r.right,
      bottom: r.bottom,
      area: { width: r.width, height: r.height },
    };
  }

  /** A button's circle in layout coordinates (px from the outer edge and the bottom). */
  function circleOf(name: TouchButtonName, box: SafeBox): ButtonCircle {
    const r = buttons[name].getBoundingClientRect();
    const cx = r.left + r.width / 2;
    return {
      x: hand === 'left' ? cx - box.left : box.right - cx,
      y: box.bottom - (r.top + r.height / 2),
      r: r.width / 2,
    };
  }

  function circles(box: SafeBox): Record<TouchButtonName, ButtonCircle> {
    return {
      drift: circleOf('drift', box),
      item: circleOf('item', box),
      brake: circleOf('brake', box),
    };
  }

  /** The first move turns the default arrangement into positions, exactly where they are now. */
  function ensurePositions(box: SafeBox): NonNullable<ButtonLayout['positions']> {
    if (!layout.positions) {
      const now = circles(box);
      layout.positions = {
        drift: toPosition(now.drift, box.area),
        item: toPosition(now.item, box.area),
        brake: toPosition(now.brake, box.area),
      };
      render();
    }
    return layout.positions;
  }

  for (const name of TOUCH_BUTTONS) {
    const el = buttons[name];
    el.addEventListener('pointerdown', (down) => {
      down.preventDefault();
      const box = safeBox();
      const start = circleOf(name, box);
      const positions = ensurePositions(box);
      const from = positions[name];
      const others = TOUCH_BUTTONS.filter((n) => n !== name).map((n) => circleOf(n, box));
      // Screen px → layout px: the outer edge is on the right for a right hand.
      const sign = hand === 'left' ? 1 : -1;
      let dragging = false;
      let current = start;
      el.classList.add('down');
      const timer = window.setTimeout(() => {
        if (!dragging) select(selected === name ? null : name);
      }, LONG_PRESS_MS);

      const move = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        const dx = e.clientX - down.clientX;
        const dy = e.clientY - down.clientY;
        if (!dragging && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
        dragging = true;
        window.clearTimeout(timer);
        current = { ...start, x: start.x + sign * dx, y: start.y - dy };
        positions[name] = toPosition(current, box.area);
        render();
      };
      const end = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        el.classList.remove('down');
        if (!dragging) return;
        const placed = dropButton(current, others, box.area);
        // On another button: snap back to where the drag began.
        positions[name] = placed ? toPosition(placed, box.area) : from;
        render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }
  // A tap away from the buttons goes back to sizing all of them.
  safe.addEventListener('pointerdown', () => select(null));

  render();
  return {
    onKey: (e) => {
      if (e.key === 'Escape') onClose();
    },
  };
});

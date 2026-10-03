// MK8 Mode's title (MK-116, the approved mockup's screen 2): the logo pops in on the pale sky
// gradient, "Press start" blinks and the 12 racers bob along the bottom. Enter, Space or a tap
// (which also starts audio) wipes to the mode select; Back (Esc, the corner button) returns to
// the Kart Racer title. Without a pack the logo and racers are stand-ins.
import { art } from '../kit';
import { menuAction } from '../kit/nav';
import { CHARACTER_SPRITES } from '../sprites';
import type { Mk8ScreenFactory } from '../stack';
import type { Mk8Context, Mk8Screen } from './session';
import './title.css';

/** The racers' names, for the stand-ins' initials (same order as CHARACTER_SPRITES). */
const RACER_NAMES: Record<(typeof CHARACTER_SPRITES)[number], string> = {
  c_mario: 'Mario',
  c_luigi: 'Luigi',
  c_peach: 'Peach',
  c_daisy: 'Daisy',
  c_yoshi: 'Yoshi',
  c_toad: 'Toad',
  c_koopa: 'Koopa Troopa',
  c_shyguy: 'Shy Guy',
  c_bowser: 'Bowser',
  c_dk: 'Donkey Kong',
  c_wario: 'Wario',
  c_waluigi: 'Waluigi',
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The logo from the pack, or (no pack) MK8 Mode's own wordmark. */
function logo(url: string | undefined): HTMLElement {
  if (url) {
    const img = el('img', 'mk8-title-logo');
    img.src = url;
    img.alt = 'Mario Kart 8';
    img.draggable = false;
    return img;
  }
  const mark = el('div', 'mk8-title-logo mk8-title-logo-stand-in');
  mark.append(el('b', 'mk8-slant', 'MK8'), el('span', 'mk8-slant', 'Mode'));
  return mark;
}

export function titleScreen(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const screen = el('section', 'mk8-scr mk8-scr-title');
    const back = el('button', 'mk8-title-back');
    back.type = 'button';
    back.tabIndex = -1;
    back.setAttribute('aria-label', 'Back to Kart Racer');
    back.append(el('b', '', '‹ Kart Racer'), ' › MK8 Mode');
    back.addEventListener('mousedown', (e) => e.preventDefault());
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      stack.back();
    });

    const press = el('div', 'mk8-title-press');
    const text = el('span', 'mk8-slant');
    text.append(
      el('span', 'mk8-title-press-keys', 'Press Enter / Tap to start'),
      el('span', 'mk8-title-press-touch', 'Tap to start'),
    );
    press.append(text);
    const racers = el('div', 'mk8-title-racers');
    for (const id of CHARACTER_SPRITES) racers.append(art(ctx.sprites(id), RACER_NAMES[id]));
    screen.append(back, logo(ctx.sprites('logo')), press, racers);

    const start = () => {
      if (stack.transitioning) return;
      // The first press is the gesture that lets audio start (iOS).
      stack.sounds.unlock?.();
      stack.sounds.play('ui/decide');
      stack.push(ctx.next('title'));
    };
    screen.addEventListener('click', start);
    return {
      el: screen,
      onKey: (e) => {
        if (menuAction(e.key)?.kind !== 'ok') return false;
        e.preventDefault();
        start();
        return true;
      },
    };
  };
}

/** MK8 Mode's title (MK-116): first in the flow; the `title` scenario start opens on it. */
export const screen: Mk8Screen = { id: 'title', build: titleScreen, starts: { title: {} } };

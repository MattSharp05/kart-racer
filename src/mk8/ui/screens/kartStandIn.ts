// Where character select leads (MK-117): the kart builder, which a later ticket builds. Until then
// a stand-in that shows the mode and racer it was given; OK goes on to the engine class (MK-119),
// except Online, whose rooms come with their ticket.
import { MK8_RACERS } from '../../content/racers';
import { DEFAULT_LOADOUT } from '../../flow';
import { menuScreen, panel } from '../kit';
import { menuAction } from '../kit/nav';
import type { Mk8ScreenFactory } from '../stack';
import { engineClass } from './engineClass';
import { modeInfo, type Mk8Context, type Mk8GameMode } from './session';
import './modeSelect.css';

export function kartStandIn(ctx: Mk8Context): Mk8ScreenFactory {
  return (stack) => {
    const mode: Mk8GameMode = ctx.flow.mode ?? 'grand-prix';
    const racerId = ctx.flow.loadout?.racer ?? DEFAULT_LOADOUT.racer;
    const name = MK8_RACERS.find((r) => r.id === racerId)?.name ?? racerId;
    const goesOn = mode !== 'online';
    const ok = () => {
      stack.sounds.play('ui/decide');
      stack.push(engineClass(ctx));
    };
    const { el, body } = menuScreen({
      name: 'kart-next',
      title: 'Customize',
      sub: modeInfo(mode).label,
      hints: [
        ...(goesOn ? [{ button: 'a' as const, label: 'OK', onPress: ok }] : []),
        { button: 'b', label: 'Back', onPress: () => stack.back() },
      ],
    });
    body.classList.add('mk8-modes-next');
    body.dataset.mode = mode;
    body.dataset.racer = racerId;
    const note = panel('mk8-modes-note');
    note.textContent = `${name}, ${modeInfo(mode).label}: the kart builder is on the way.`;
    body.append(note);
    return {
      el,
      onKey: (e) => {
        if (!goesOn || menuAction(e.key)?.kind !== 'ok') return false;
        e.preventDefault();
        ok();
        return true;
      },
    };
  };
}

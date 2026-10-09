# MK8 menu screens (MK-142)

Every screen of MK8 Mode's menus is one file here that exports a `screen` (`Mk8Screen`, in
`session.ts`): its id, how to build it from the `Mk8Context`, the scenario starts that open on it
and, optionally, when the flow skips it. `index.ts` finds the files (`import.meta.glob`), and
`order.ts` is the one list of ids in the order the player meets them. A screen never imports the
next one: OK pushes `ctx.next('<its id>')`.

To add a screen (e.g. a rules screen between the engine class and the cups):

1. Create `src/mk8/ui/screens/rules.ts` (+ `rules.css`):
   ```ts
   import type { Mk8ScreenFactory } from '../stack';
   import type { Mk8Context, Mk8Screen } from './session';

   export function rules(ctx: Mk8Context): Mk8ScreenFactory {
     return (stack) => {
       // … build the screen; on OK:
       stack.push(ctx.next('rules'));
       return { el };
     };
   }

   /** VS Race rules (MK-xxx); the `rules` scenario start opens on it for a VS Race. */
   export const screen: Mk8Screen = {
     id: 'rules',
     build: rules,
     starts: { rules: { mode: 'vs', engineClass: 150 } },
     skip: (flow) => flow.mode !== 'vs',
   };
   ```
2. Add `'rules'` to `MK8_SCREEN_ORDER` in `order.ts`, after `'cc'`.
3. Its scenario goes in its own file in `src/scenarios/mk8/` (`setup: openMk8('rules')`).

`index.test.ts` fails if `order.ts` and the screen files disagree, or a scenario uses a start no
screen declares.

## Race screens (MK-121)

`pause.ts` and `results.ts` are not in the menu flow (no `screen` export, not in `order.ts`): they
show over an MK8 race, each in its own MK8 stack, through `src/mk8/raceScreens.ts`, which
`src/game/flow.ts` loads when an MK8 race (from the menus, or a scenario with MK8's items) pauses or
finishes. The rows, points and choices are pure in `src/mk8/results.ts`. Scenarios:
`mk8-ui-pause`, `mk8-ui-results` and `mk8-ui-standings` (`src/scenarios/mk8/raceScreens.ts`, on the
test ramp; their `mk8Start` names the MK8 mode the results are for).

MK-130 adds two more of these: `confirm.ts` (the "Quit the Grand Prix?" prompt the pause menu and
the results push on their own stack before quitting a cup) and `podium.ts` (a Grand Prix's podium,
its 3D in `src/mk8/render/podium.ts`). The cup logic is in `src/mk8/gp/` (README there).

## Players (MK-148)

`players.ts` (after `mode`, VS Race only) sets `Mk8Flow.players`, 1–4. With several players the
character select and kart builder are built once per player (`Mk8Flow.picking`, read when the
screen is pushed and set again on `onShow`, so Back gives the pick back): P1's pick is
`flow.loadout` (saved on the device), P2–P4's `flow.others`; the kart builder's OK opens
`ctx.open('char')` for the next player, and the last player's goes on as before. Helpers:
`src/mk8/localPlayers.ts`. Scenarios `mk8-ui-players`, `mk8-ui-char-p2` (`src/scenarios/mk8/local.ts`).

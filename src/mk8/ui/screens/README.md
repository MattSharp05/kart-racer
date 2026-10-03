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

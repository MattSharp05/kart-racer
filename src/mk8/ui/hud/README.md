# MK8 race HUD (MK-127)

MK8 Mode's race HUD, after screen 8 of the approved mockup: a DOM/CSS layer that only reads the sim
state. `src/mk8/index.ts` installs it as our HUD's skin (`src/ui/hud/skin.ts`) when MK8 Mode's chunk
loads; it then draws every MK8 race (`isMk8Race`: MK8's item set, or a mesh course) and our `Hud`
keeps only its screen effects and warnings there.

- `hud.ts` — the DOM: item box + reel and the second slot (top-left), minimap with racer heads and
  the incoming warning (top-right, left of the pause button), coins and lap (bottom-left), position
  (bottom-right), Lakitu's start light / lap sign and the big countdown (top-centre). Phones
  (`body.touch`) move coins, lap and position up, clear of the touch controls (`hud.css`).
- `reel.ts` — the roulette as a pure state machine over the slot's sim state: it spins on the sim's
  time left and lands on `held`, so it can't show anything but the sim's item.
- `map.ts` — the minimap projection: the centreline from above (+X right, −Z up); heads sit at the
  kart's route progress (`race.lastT`).
- `cues.ts` — countdown text, Lakitu's cue (timed by `render/lakitu.ts`'s `lakituPose`) and the race
  sounds (MK8 sound ids, played through MK8 Mode's audio player).
- `icons.ts` — item → pack sprite (`MK8_ITEMS` icons; triples with fewer than 3 left show the single
  sprite and a ×n count), racer → head sprite. Without the pack: our SVG item icons, the racer's
  paint and a CSS coin.

Split-screen (MK-148): our HUD makes one skin per `Hud` (`HudSkinFactory`), so every player's view
gets its own `Mk8Hud`, placed in the view by `setView` (`--u` is one mockup pixel of the view, the
player's P1–P4 label under the item box). Only the screen's own (P1's) HUD plays the race-wide
sounds (countdown, GO); each plays its own player's.

Animations run on sim ticks, so a paused scenario always draws the same frame (visual baselines).
Test hooks: `window.__mk8.hud` (`frameMs()`, `ready`). Scenarios: `src/scenarios/mk8/hud.ts`
(`mk8-hud-roulette`, `-two-slots`, `-final-lap`, `-countdown`).

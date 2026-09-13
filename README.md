# Deep Supper

A 2D sidescroller. You are a small boy on a fishing boat. Your father tells you to
catch supper and then leaves. It gets dark. The fish are not fish.

Plain HTML and JavaScript, rendered as crisp 480x270 pixel art and shipped as a Windows
desktop app. Every pixel is drawn at runtime on a canvas and every note of music is
synthesised from oscillators. There are no asset files of any kind.

## Playing it

**The app:** run `DeepSupper-1.0.0.exe`. It is a single portable file: no installer, and
nothing to uninstall. It isn't code-signed, so Windows SmartScreen may ask you to
confirm the first time ("More info" → "Run anyway").

**From source** (needs [Node.js](https://nodejs.org) 20 or newer):

```bash
npm install
```

```bash
npm start
```

**Building the .exe:**

```bash
npm run dist
```

This writes `dist/DeepSupper-1.0.0.exe`. `npm run dist:folder` builds an unpacked
`dist/win-unpacked/` instead, which is quicker to rebuild while testing.

The game still runs in a browser too: open `index.html`. Saves and settings then live in
that browser's local storage, and there is no Quit option.

## The loop

1. **Opening cutscene** (no player input) — Dad hands over the boat, walks off down the
   quay, and the *Margaret* sails out while the sun goes down. Something the length of
   the hull passes between you and the water. Hold `ESC` to skip.
2. **Walk the deck** — find the crate by the wheelhouse and take the dip net.
3. **Fish at the bow.** The line goes in and keeps going: the view follows it down
   through the thermoclines while the light fails, silhouettes cruise past at depth and
   the fathoms tick by. Your rod decides how deep you can reach.
4. **Set the hook** when something takes it, then hold `SPACE` to reel — keep it inside
   the bar without snapping the line. You watch it come up the water column at you.
5. **Fight what surfaces.** Swing, roll through its lunges, jump its shockwaves and the
   sweeps that scythe the whole deck.
6. **Sell it to Dorran** at the stall amidships, and spend the coin on a deeper rod or
   something heavier to hit things with.

Your first cast is a lie. An ordinary little fish takes the bait, and you start reeling
it up. Halfway to the surface, something comes out of the dark underwater, eats it off
your line and dives with the hook in its mouth. Now you have to haul *that* up, and
fight it. Everything after that is a monster.

From the Deepline rod onward, something far bigger than anything you can catch rises
out of the dark below your hook while you wait, looks at you, and goes away again. The
Abyssal Rod is what finally reaches it.

## Menus, options and saves

The game opens on a title menu: **Continue** (when there is a save), **New voyage**,
**Options**, **Credits** and **Quit**. `ESC` during play opens the pause menu, which can
also reach Options, save and return to the title, or save and quit.

| Options screen | What's on it |
|---|---|
| Graphics | windowed / fullscreen, sharp whole-number pixel scaling or fill the window, render quality (auto steps down on slow machines), brightness, screen shake, particles, FPS counter |
| Audio | master, music and effects volume; mute everything; music off; mute when the window is in the background |
| Controls | rebind every gameplay action; reset controls |
| Gameplay | text speed (slow to instant), damage numbers |

Everything saves as you change it. The voyage autosaves whenever something worth keeping
happens: starting out, taking the dip net, leaving Dorran's stall, the end of every
fight, returning to the title, and closing the window.

## Controls

These are the defaults. Every gameplay key can be rebound under Options → Controls.

| Key | |
|---|---|
| `A` `D` / arrows | walk |
| `SPACE` / `W` | jump · hold to reel |
| `E` | interact · set the hook · put the rod down |
| `J` | swing your weapon |
| `K` / `L-SHIFT` | roll (brief invulnerability) |
| `Q` | bandage |
| `ENTER` | advance dialogue · select in menus |
| `ESC` | pause · back out of a menu · hold to skip a cutscene |
| `M` · `N` | mute everything · music only |
| `F11` | fullscreen |

`ESC`, `ENTER`, `M`, `N` and `F11` always keep those jobs, so you can never rebind your
way out of the menus.

## What's in it

**17 monsters** across four depths, drawn from nine body plans — eel, anglerfish,
tentacled, ray, crustacean, jellyfish bloom, drowned husk, all-mouth, and whatever The
Old One is. None of them are rigid sprites: each silhouette is rebuilt every frame
around a spine or a pulse, so they undulate, breathe and blink.

**Six weapons**, only one of which is a blade you would recognise: a bent dip net, a
gaff hook, a gutting cleaver, a whaling harpoon, six feet of anchor chain, and a tooth.
Each has its own artwork and swing style — wide arcs, slow overhead chops, or fast
narrow thrusts that whiff against anything rearing up.

**Five pieces of music** in D minor, crossfaded by game state, played on synthesised
harp, lead, pad, bell, drums and a drone.

**A three-phase final boss** that changes its attack pool twice on the way down.

## Tests

493 tests: 394 unit (80%), 74 integration (15%) and 25 end-to-end (5%).

```bash
npm test
```

runs the unit and integration suites (about 20 seconds, no window opens).

```bash
npm run test:e2e
```

launches the real desktop app and plays it with a keyboard (about a minute). Set
`DEEPSUPPER_EXE` to `dist/win-unpacked/Deep Supper.exe` to run the same tests against a
packaged build. `npm run test:all` runs everything.

- **Unit** (`tests/unit`) load the real game scripts into a Node `vm` sandbox with a
  recording canvas, a fake keyboard and mouse, and a fake Web Audio graph, then test one
  system at a time: the pixel pipeline, input, the font, settings and key binding, save
  validation, data tables, deck movement, fishing and the reel minigame, the ambush,
  combat and boss phases, the shop, menus, cutscenes, the icon encoder, and every drawing
  routine.
- **Integration** (`tests/integration`) play through whole journeys with real key presses
  and full rendered frames: the first voyage from the title menu to the first sale,
  saving and continuing (including damaged saves), options taking effect in play, fishing
  into fights, the boss and the ending, pausing, and every screen through the renderer.
- **End-to-end** (`tests/e2e`) drive the Electron app with Playwright: the window and its
  lockdown, a voyage played with the keyboard, settings and fullscreen surviving a
  restart, quitting, and the single-instance lock. Each launch gets a throwaway profile,
  so tests never touch your real saves.

## Files

```
index.html               page + canvas
src/font.js              the 5x7 bitmap font
src/core.js              pixel pipeline, math, input, WebAudio sfx, particles, text, camera
src/music.js             the procedural score
src/data.js              rods, weapons, goods, monsters, catch tables
src/settings.js          options and the save file, both validated on load
src/art.js               all drawing: sky, sea, water column, boat, people, monsters
src/cutscene.js          dialogue box, step sequencer, opening + ending
src/fishing.js           cast → sink → wait → hook → reel, and the ambush
src/battle.js            player combat, monster AI and attacks, boss phases
src/shop.js              Dorran's stall (sell / gear / goods)
src/menu.js              title menu, pause menu, every options screen
src/game.js              state machine, deck exploration, HUD, main loop
electron/main.js         the desktop window
electron/preload.js      the page's only bridge to the app: fullscreen and quit
scripts/make-icon.js     draws build/icon.png (npm run icon)
tests/                   unit, integration and end-to-end suites, and their helpers
```

`.claude/serve.js` + `launch.json` are a tiny local static server used during
development; the game does not need them.

## Notes on balance

Losing a fight costs you the catch, not your progress — you wake up on the deck at full
health. Rods and weapons must be bought in order. A Heart Locket raises your maximum
health (four available, price climbs), the Storm Lantern makes bites come faster, and
the Drowned Charm pulls bigger things onto your hook.

# Deep Supper

A 2D sidescroller. You are a small boy on a fishing boat. You never say a word, and
nothing in the sea is half as dangerous as you are. Your father tells you to catch supper
and then leaves. It gets dark. The fish are not fish.

Plain HTML and JavaScript, rendered as crisp 480x270 pixel art and shipped as a Windows
desktop app. Every pixel is drawn at runtime on a canvas and every note of music is
synthesised from oscillators. There are no asset files of any kind.

## Playing it

**The app:** run `DeepSupper-1.3.0.exe`. It is a single portable file: no installer, and
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

This writes `dist/DeepSupper-1.3.0.exe`. `npm run dist:folder` builds an unpacked
`dist/win-unpacked/` instead, which is quicker to rebuild while testing.

The game still runs in a browser too: open `index.html`. Saves and settings then live in
that browser's local storage, and there is no Quit option.

## The loop

1. **Opening cutscene** — Dad hands over the boat, walks off down the
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
6. **Sell it to Uncle Dorran** at the stall amidships, and spend the coin on a deeper rod or
   something heavier to hit things with.

Your first cast is a lie. An ordinary little fish takes the bait, and you start reeling
it up. Halfway to the surface, something comes out of the dark underwater, eats it off
your line and dives with the hook in its mouth. Now you have to haul *that* up, and
fight it. Everything after that is a monster.

From the Deepline rod onward, something far bigger than anything you can catch rises
out of the dark below your hook while you wait, looks at you, and goes away again. The
Abyssal Rod is what finally reaches it.

Somewhere around the second or third rod, one bite doesn't fight back. What comes up
on the line is Nerys, from Lanthorne, a city eighty fathoms under the boat. She has
things to say about what is rising out of the trench, and about your great-grandfather.

The boy never speaks. Dad, Nerys and his Uncle Dorran do all the talking, and every one
of them notices. Dorran keeps the stall amidships and a flask in his coat, and has never
once found anything the boy brings him strange: a nine-eyed thing with a mouth for a face
is a lovely bit of haddock. He talks you through the opening, tells you where the net is,
rambles while you browse, calls out from behind his counter as you walk the deck, shouts
about whatever you haul aboard or climb back up the ladder with, answers Dad for you at
the end of part one, and forgets all his news whenever a save is loaded.

Lines of dialogue wait for you: the first press (`E`, `ENTER`, `SPACE` or a click)
finishes typing a line, and the next moves on.

## Part two: diving

Beating the Old One ends part one, and it leaves something on the deck: a diving suit
and a harpoon. From then on, `E` at the bow suits the boy up and he goes over the rail.

Below the *Margaret* is an open sea in four bands, each walled off from the next by a
rock shelf with a gap in it: **the Shelf**, **the Drop**, **the Drowned Halls** and, on the
seabed, **Lanthorne**. Sixteen creatures live down there, and they notice you. Your tank
runs out of air (it refills at the surface), and every suit buckles past its depth, so
going deeper means climbing the ladder at the bow, selling what you killed to Dorran,
and buying a better suit: four in all, down to the Trench Hardsuit.

Nothing that goes bang works underwater, so every diving weapon is a launcher of some
other kind, and none of them ever runs out. Aim with the mouse (the pointer becomes a
crosshair) or with the direction you swim, and hold the button to keep firing. The
**Drowned Harpoon** flies out on a line, bites, and reels back in before it can fire again;
the **Barnacle Trident** throws a spread of three prongs; the **Eel on a Rope** spits a ball of
lightning that jumps to the creatures around whatever it hits; the **Narwhal Tusk** goes
through everything in a line; and the **Sunken Bell** sends out a widening wave of sound that
shoves a whole crowd back. Blacking out, from injury or lack of air, costs you what you
caught on that dive.

It sounds like being underwater, too. Going over the side closes a low-pass filter over
every sound in the game and starts the rumble of deep water; you hear your own breathing
and bubbles, a low-air alarm, the suit creaking past its depth, sonar pings and far-off
calls in the deep, creatures growling as they wind up (only when they are close), and
each launcher's own shot. Climbing out, drowning, loading or quitting opens it back up.

At the bottom, in front of Lanthorne's gate, Nerys is in trouble, and the Old One turns
out not to have been the worst thing in the sea.

## Menus, options and saves

The game opens on a title menu: **Continue** (when there is a save), **Load game** (when a
slot is used), **New voyage**, **Options**, **Test shortcuts**, **Credits** and **Quit**. `ESC`
during play opens the pause menu: **Save game** and **Load game** (three save slots, which
ask before overwriting or throwing away progress), Options, save and return to the title,
or save and quit.

**Test shortcuts** jump straight to later parts of the game with the right gear: the Old
One with every fishing item bought, a fresh diving suit at the bow, or the bottom of the
sea in the best suit. They replace your Continue save, so use a save slot first if you
want to keep a voyage.

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
| `SPACE` / `W` | jump · hold to reel · swim up |
| `S` / ↓ | swim down (↑ swims up too) |
| `E` | interact · set the hook · put the rod down · dive · climb aboard |
| `J` / left click | swing your weapon on deck · fire underwater (hold to keep firing) |
| mouse | aim underwater (otherwise you aim the way you swim) |
| `K` / `L-SHIFT` | roll on deck, dash underwater (brief invulnerability) |
| `Q` | bandage |
| `ENTER` | read on through dialogue (so do `E`, `SPACE` and a click) · select in menus |
| `ESC` | pause · back out of a menu · hold to skip a cutscene |
| `M` · `N` | mute everything · music only |
| `F11` | fullscreen |

`ESC`, `ENTER`, `M`, `N` and `F11` always keep those jobs, so you can never rebind your
way out of the menus.

## What's in it

**17 monsters** to fish up across four depths, and **18 more** below the surface, drawn from
ten body plans: eel, anglerfish, octopus, manta, crab, jellyfish, drowned skeleton,
all-mouth, and the fanged serpents that are the Old One and the Mother. They are real
pixel art, but not sprite sheets. Each creature is rasterised at the game's true pixel size
from shapes rebuilt around a spine or a pulse, then shaded through a five-tone palette
(cool purple shadows, warm highlights) with creases, a light ordered dither and a
one-pixel outline, so they swim, breathe, bite and blink. Like hand-animated sprites they
change pose 20 times a second, staggered so only a third of them redraw on any frame; in
between, each one's last pixels are put down again wherever it has swum to.

**Six weapons**, only one of which is a blade you would recognise: a bent dip net, a
gaff hook, a gutting cleaver, a whaling harpoon, six feet of anchor chain, and a tooth.
Each has its own artwork and swing style — wide arcs, slow overhead chops, or fast
narrow thrusts that whiff against anything rearing up.

**Eight pieces of music**, crossfaded by game state, played on synthesised
harp, lead, pad, bell, drums and a drone.

**Two three-phase bosses**, each of which changes its attack pool twice on the way down.

## Tests

760 tests: 607 unit (80%), 116 integration (15%) and 37 end-to-end (5%).

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
  validation and save slots, data tables, deck movement, fishing and the reel minigame,
  the ambush, Nerys, combat and boss phases, diving (swimming, air, pressure, every
  launcher, every creature, the Mother), underwater sound, the shop and everything
  Dorran says there and on deck, a boy who never speaks, menus, cutscenes, the icon
  encoder, the pixel-art creature rasteriser and its animation cache, and every drawing
  routine.
- **Integration** (`tests/integration`) play through whole journeys with real key presses
  and full rendered frames: the first voyage from the title menu to the first sale,
  saving and continuing (including damaged saves and save slots), options taking effect in
  play, fishing into fights, Nerys, the Old One and the end of part one, diving from the
  bow to a deeper suit and back, fighting at range with mouse and keys, what the sea sounds
  like however you leave it, creatures animating in a crowd, Dorran talking across the deck
  and over the counter while the boy stays silent, the Mother and the end of part
  two, pausing, and every screen through the renderer.
- **End-to-end** (`tests/e2e`) drive the Electron app with Playwright: the window and its
  lockdown, a voyage played with the keyboard, Dorran calling out from his stall, dialogue that waits, save slots, settings
  and fullscreen surviving a restart, the test shortcuts, diving with real mouse aiming,
  creatures on screen, the Mother, quitting,
  and the single-instance lock. Each launch gets a throwaway profile,
  so tests never touch your real saves.

## Files

```
index.html               page + canvas
src/font.js              the 5x7 bitmap font
src/core.js              pixel pipeline, math, input, WebAudio sfx and the underwater mix, particles, text, camera
src/music.js             the procedural score
src/data.js              rods, weapons, goods, monsters, catch tables, everything Dorran says
src/settings.js          options and the save file, both validated on load
src/art.js               drawing: sky, sea, water column, boat, people, weapons, HUD
src/art-deep.js          drawing for part two: Nerys, the suit, launchers and shots, the sea below
src/beasts.js            every creature, rasterised as pixel art, and its animation cache
src/cutscene.js          dialogue box, step sequencer, opening, Nerys, both endings
src/fishing.js           cast → sink → wait → hook → reel, and the ambush
src/battle.js            player combat, monster AI and attacks, boss phases
src/dive.js              diving: swimming, air and pressure, the creatures below, the Mother
src/shop.js              Uncle Dorran's stall (sell / gear / goods), and how he talks
src/menu.js              title menu, pause menu, every options screen
src/game.js              state machine, deck exploration, Dorran calling across the deck, HUD, main loop
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

# Deep Supper

A 2D sidescroller. You are a small boy on a fishing boat. You never say a word, and
nothing in the sea is half as dangerous as you are. Your father tells you to catch supper
and then leaves. It gets dark. The fish are not fish.

Plain HTML and JavaScript, rendered as crisp 480x270 pixel art and shipped as a Windows
desktop app. Every pixel is drawn at runtime on a canvas and every note of music is
synthesised from oscillators. There are no asset files of any kind.

## Playing it

Download the game from the
[Releases page](https://github.com/DanielKyhl/Deep-Supper-game-/releases/latest).

**Windows:** run `DeepSupper-1.9.0.exe`. It is a single portable file: no installer, and
nothing to uninstall. It isn't code-signed, so Windows SmartScreen may ask you to
confirm the first time ("More info" → "Run anyway").

**Mac:** download `DeepSupper-1.9.0-mac-arm64.dmg` for an Apple Silicon Mac (M1 or
later), or `DeepSupper-1.9.0-mac-x64.dmg` for an Intel Mac (Apple menu → About This Mac shows
which). Open it and drag Deep Supper into Applications. The game isn't signed by Apple,
so the first time you open it macOS refuses. Click **Done**, then go to **System Settings →
Privacy & Security**, scroll down and click **Open Anyway**. After that it opens normally.
If macOS instead says the app "is damaged", that's the same missing signature. Run this
once in Terminal, then open the game again:

```bash
xattr -cr "/Applications/Deep Supper.app"
```

On a Mac, `Cmd+Q` quits, and `Ctrl+Cmd+F` or the window's green button toggles
fullscreen (`F11` usually belongs to macOS there).

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

This writes `dist/DeepSupper-1.9.0.exe`. `npm run dist:folder` builds an unpacked
`dist/win-unpacked/` instead, which is quicker to rebuild while testing.

**Building for Mac** has to happen on a Mac:

```bash
npm run dist:mac
```

This writes `dist/DeepSupper-1.9.0-mac-arm64.dmg` and `dist/DeepSupper-1.9.0-mac-x64.dmg`.

You don't need a Mac for a release, though. GitHub builds both versions
(`.github/workflows/build.yml`):
- **Every push to main:** builds and tests the Mac and Windows versions, including
  end-to-end tests on the packaged Mac app. The files stay under that run's Artifacts
  for a week.
- **A release:** when you publish a release on GitHub, that version is built and about
  fifteen minutes later the `.dmg` files and the `.exe` are attached to it. You don't
  need to upload anything yourself.

The game still runs in a browser too: open `index.html`. Saves and settings then live in
that browser's local storage, and there is no Quit option.

## The loop

1. **Opening cutscene** — Dad hands over the boat, walks off down the
   quay, and the *Margaret* sails out while the sun goes down and the harbour gets
   smaller. Something the length of the hull passes under you, and it was not a wave.
   Hold `ESC` to skip.
2. **Walk the deck** — find the crate by the wheelhouse and take the dip net.
3. **Fish at the bow.** The line goes in and keeps going: the view follows it down
   through the thermoclines while the light fails, silhouettes cruise past at depth and
   the fathoms tick by. Your rod decides how deep you can reach.
4. **Set the hook** when something takes it, then hold `SPACE` to reel — keep it inside
   the bar without snapping the line. You watch it come up the water column at you.
5. **Fight what surfaces.** Every creature has the same two moves as the rest (a lunge, and
   a slam that sends a shockwave down the deck) plus one that belongs to its body alone.
   Eels spring over you and lash down behind, anglers flare their lure and lunge out of
   the glare, tentacled things burst up through the boards where you stand, and crabs
   tuck in and bowl across the deck. Swing, roll and jump, or hold the swing for a heavy blow.
6. **Sell it to Uncle Dorran** at the stall amidships, and spend the coin on a deeper rod or
   something heavier to hit things with. His counter has a section for what you sell, one
   for rods and deck weapons, one for goods, and — once you have a suit — one for diving
   gear and underwater weapons.

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

The boy never speaks. Dad, Nerys and his Uncle Dorran do the talking, and every one of
them notices. Dorran keeps the stall amidships and a flask in his coat, and has never
once found anything the boy brings him strange: a nine-eyed thing with a mouth for a face
is a lovely bit of haddock. He doesn't say much unless you're at his counter. He rambles
while you browse, calls across the deck now and then, answers Dad for you at the end of
part one, and forgets all his news whenever a save is loaded. Everything else is told
plainly in the dialogue box by nobody in particular: what the crate holds, the harbour
going out of sight, and what the thing under the boat was not.

**The bosses don't just attack; they ask you something.**
- **The Old One:** it brings its jaw down, and you press `J` as the ring closes to parry,
  which leaves it open to the tooth. It breaches, and you keep your feet by pressing the
  keys it shows you, in order. It drags you toward the rail, and you hold against it.
- **The Mother below:** she makes you shoot her eye as the ring closes, swim against her
  whirlpool, and slip her coils.

Each check freezes the fight while you answer, and says **SUCCESS** or **FAIL**. Checks get
faster in the last phase, and a miss costs you hearts.

**Losing costs you.** Going down in a fight, or blacking out on a dive, loses what you
caught. On top of that, Dorran charges a salvage fee for fishing you out of the
scuppers: a quarter of your coins, but never more than 1,500§.

**A rematch with the Old One.** Once the Old One has beaten you, you don't have to wait for
it to bite again by chance. Dorran starts selling a **Bucket of Chum** (250§). Tip it over
the side with the Abyssal Rod and the very next bite is the Old One. The bucket is used up
when the fight starts, so a missed bite or a snapped line leaves the chum in the water for
the next cast. If you lose again, he has another bucket.

## Fighting

Press `J` to swing. Keep holding it once the swing is over and the boy winds up a
**heavy blow**, slower to walk while he does and cancelled by a roll. A row of pips over
his head fills, the blow's name lights up with a spark and a note when it is ready, and
letting go swings it. Every weapon has its own:

| Weapon | Heavy blow | |
|---|---|---|
| Dip net | Scoop | stuns |
| Gaff hook | Haul | drags the creature in, and stuns |
| Cleaver | Cleave | three times the damage, and it bleeds |
| Harpoon | Lunge | dashes forward a long way, and it bleeds |
| Anchor chain | Whirl | hits both sides of him, and stuns |
| The tooth | Rend | always a critical hit, and it bleeds |
| Excalibur | Judgement | both sides, and nothing survives it |

Catch a creature winding up an attack with a heavy blow and it is knocked out of it.

**Things that linger.** Some hits leave something behind, shown as a small icon over
whoever has it:
- **Bleeding:** the cleaver, the harpoon and the tooth sometimes open a wound (a heavy blow
  always does). It keeps taking a little health for three seconds, and it can finish a
  creature off. Underwater, the Narwhal Tusk bleeds too.
- **Stunned:** the anchor chain sometimes rings a creature's head, and so do the net's and
  the gaff's heavy blows. It stands there for a moment. Bosses shake it off quickly.
  Underwater, the Sunken Bell stuns everything its wave reaches.
- **Poisoned:** the Weeping Bell's curtains of stingers, and the stinging rings of the
  blooms below, poison the boy. The sting costs a heart when it runs its course, unless
  a bandage (`Q`) draws it out first.
- **Inked:** underwater, a squirt of ink blots out the view and slows him to under half
  speed for a couple of seconds.

Whoever is talking is drawn beside what they say: Dad under his cap, Dorran under his
hat with his nose and his flask, Nerys with her gills and her glowing eyes. They blink,
and their mouths move while the line is still typing itself out. Narration — what happens,
told by nobody in particular — has no face and sits in the middle of the box.

Lines of dialogue wait for you: the first press (`E`, `ENTER`, `SPACE` or a click)
finishes typing a line, and the next moves on.

## Letters, relics and a sword

About one cast in seventeen brings up a bottle instead of a fish, with a letter inside.
Eight come up, in order: from a great-grandfather who saw lights under his boat, from the
city those lights belong to, from a whaler who met the Old One, one in a hand you
will recognise, the reply that was never sent, and, once you have met Nerys, a green
bottle from Lanthorne. In part two, twelve more things lie on the sea floor for you to
swim over and pick up: four letters, and eight relics that shouldn't be down there.
Everything you find goes into the **Journal** in the pause menu, where you can read it again.
Picking one up underwater stops the sea while you read: nothing swims, no air goes, and
when you look up, whatever was lunging at you has to start again.

Once in a thousand casts, the line comes up with **Excalibur** on it. From then on it is
your weapon on deck, and it kills anything on the boat in one blow. It is no use
underwater.

## The bestiary and records

The **Bestiary** in the pause menu has a page for all 35 creatures, in chapters: the four
depths you fish, and the four bands of sea you dive. A creature you haven't killed yet is a
question mark. One you have is drawn, with a note on how it fights, how many you've
killed, and your **record**: every catch is weighed, and landing a heavier one than before
says so.

Kill five of a kind (one, for a boss) and the boy has **studied** it: he knows where to hit
it, and hits it 15% harder from then on. Killing every creature in a chapter earns a
reward, because the town museum buys the drawings: from 150§ for the shallowest fishing up
to 4,000§ for Lanthorne. Fill the whole book and every catch is worth 15% more.

## Storms and quiet nights

Out at sea the weather turns. Now and then a **storm** rolls in over a quarter of a minute,
rages for a couple of minutes and blows over. The rain comes down, the swell lifts the
boat, and the sky goes dark until lightning strikes, with the thunder coming
after it, later the further off it was. Fish bite faster in a storm, and bigger things
come up on the hook. And sometimes the lightning shows something in the water, much
longer than the boat. If the flashes are too much, set **Lightning flashes** to Soft or
Off under Options → Graphics.

On a **quiet night** at sea, when nobody is talking and there is no storm, something
strange happens once in a long while. It's never dangerous, and never explained. A
lantern goes out on its own, the bell rings with no wind, there are wet footprints on
the deck, or something knocks on the hull from below. Turn off **Strange things at
night** under Options → Gameplay if you'd rather it didn't.

## Achievements

Thirty-one of them, two of them secret: the first catch, the first sale, the best rod,
weapon, suit and launcher, parrying the Old One, beating it without losing a heart, a
creature bled to death, a kill with a heavy blow, a catch in a storm, a record, climbing
out with almost no air, filling in the bestiary, and so on. A card slides in when you earn
one, and the **Achievements** screen on the title and pause menus lists them all.

They're kept apart from your saves, so starting a new voyage never loses them. The test
shortcuts don't earn any.

## Part two: diving

Beating the Old One ends part one, and it leaves something on the deck: a diving suit
and a harpoon. A rope ladder goes over the side amidships, and `E` there suits the boy up
and sends him over the rail in flippers. The bow is still the bow: you can fish for the
rest of the game whenever you would rather do that.

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
shoves a whole crowd back. Blacking out, from injury or lack of air, is its own small scene: he
goes limp, the suit takes him down, the screen says **YOU DIED** — and then he comes round
flat on his own deck, with Uncle Dorran standing over him, having hauled him up the ladder
and charged him for it. It costs what he caught on that dive, and nothing else.

It sounds like being underwater, too. Going over the side closes a low-pass filter over
every sound in the game and starts the rumble of deep water; you hear your own breathing
and bubbles, a low-air alarm, the suit creaking past its depth, sonar pings and far-off
calls in the deep, creatures growling as they wind up (only when they are close), and
each launcher's own shot. Climbing out, drowning, loading or quitting opens it back up.

At the bottom, in front of Lanthorne's gate, Nerys is in trouble, and the Old One turns
out not to have been the worst thing in the sea. That water is hers: when she comes up,
everything else is driven out of it and stays out, so the fight is between the two of you.

## The end

Once the Mother is back in her trench and the boy has climbed back aboard, the wheel in
the wheelhouse offers to **Sail home**. The *Margaret* turns for the harbour through the
night, something far below says goodbye in the only way it can, and she comes in on the
morning tide. Dad is waiting. If the boy found a certain pocket watch on the Shelf, Dad
has something to say about it.

After **THE END** the credits roll. They list the crew, then every creature in the sea by
name: the ones you met are drawn, with how many you killed, and the ones you missed stay a
question mark. Last come your voyage's numbers: casts, kills, letters and relics found,
and whether Excalibur ever came up. Hold `ENTER`, `SPACE` or `E` to roll them faster,
or hold `ESC` to skip.

When the credits finish, that is the game: it goes back to the title screen, with the
voyage saved. **Continue** puts you back aboard in the harbour with everything you had, so
the sea is still there to fish and dive, and the wheel will take you home again if you want
to watch it twice.

When there's more story to tell, the ending can move: it's unlocked by `FINALE.ready` in
`src/data.js`, currently "the Mother is beaten". Change that one line to put the voyage
home and the credits after whatever comes next.

## Menus, options and saves

The game opens on a title menu: **Continue** (when there is a save), **Load game** (when a
slot is used), **New voyage**, **Options**, **Test shortcuts**, **Credits**, **Achievements**
and **Quit**. `ESC` during play opens the pause menu: **Save game** and **Load game** (three
save slots, which ask before overwriting or throwing away progress), **Gear**, the
**Journal**, the **Bestiary**, **Achievements**, Options, save and return to the title, or
save and quit.

**Gear.** Nothing you buy is ever thrown away, and you can go back to it. The **Gear**
screen in the pause menu shows the rod, the weapon on deck, the suit and the underwater
launcher you have in hand, and the arrow keys (or a click on ‹ and ›) swap each one for
anything else you own, with a line on what it does. Excalibur is on the list once you
have it, so you can put it down. At Dorran's stall, pressing `E` on something you
already own takes it in hand too. Anything new you buy goes straight into your hands.
Gear only changes on deck, not in the middle of a cast, a fight or a dive, and your
choice is saved with the voyage.

**Test shortcuts** jump straight to later parts of the game with the right gear: the Old
One with every fishing item bought, a fresh diving suit at the bow, the bottom of the
sea in the best suit, or the wheel with everything beaten, straight into the ending and
the credits. They replace your Continue save, so use a save slot first if you
want to keep a voyage.

| Options screen | What's on it |
|---|---|
| Graphics | windowed / fullscreen, sharp whole-number pixel scaling or fill the window, render quality (auto steps down on slow machines), brightness, screen shake, particles, lightning flashes (full, soft or off), FPS counter |
| Audio | master, music and effects volume; mute everything; music off; mute when the window is in the background |
| Controls | rebind every gameplay action; reset controls |
| Gameplay | text speed (slow to instant), damage numbers, strange things at night |

Every screen works with the mouse as well as the keys. Click or drag along a slider to set
it where you let go, and click the ‹ or › of a setting to step it back or forward.
Clicking a slider's name only selects it.

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
| `J` / left click | swing your weapon on deck (hold for a heavy blow) · fire underwater (hold to keep firing) |
| mouse | aim underwater (otherwise you aim the way you swim) |
| `K` / `L-SHIFT` | roll on deck, dash underwater (brief invulnerability) |
| `Q` | bandage |
| `ENTER` | read on through dialogue (so do `E`, `SPACE` and a click) · select in menus |
| `ESC` | pause · back out of a menu · hold to skip a cutscene |
| `M` · `N` | mute everything · music only |
| `F11` | fullscreen (on a Mac, `Ctrl+Cmd+F` or the green button) |

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

The people and the boat use the same pixel art. The boy, Dad, Dorran and Nerys are each
posed from a few joint angles, for a walk, a hiccup, or a flutter kick in a diving suit.
They go through the same palette, outline and dither, and are redrawn only when their
pose changes. The *Margaret* is painted once, in layers: the planking, the wheelhouse,
Dorran's stall and counter, and the crates, pots, barrels and buoys. Only the sail,
flag, bell and washing line move, a step at a time, and after dark the lanterns and
strings of bulbs glow over it all.

**Six weapons**, only one of which is a blade you would recognise: a bent dip net, a
gaff hook, a gutting cleaver, a whaling harpoon, six feet of anchor chain, and a tooth.
Each has its own pixel art and swing style — wide arcs, slow overhead chops, or fast
narrow thrusts that whiff against anything rearing up — and a heavy blow of its own.

**Eight pieces of music**, crossfaded by game state, played on synthesised
harp, lead, pad, bell, drums and a drone.

**Two three-phase bosses**, each of which changes its attack pool twice on the way down
and has three skill checks.

**Twenty letters and relics**, a journal to keep them in, and one sword.

**A bestiary** of 35 creatures with records and rewards, **31 achievements**, **storms**,
and **nine strange things** that can happen on a quiet night.

## Tests

1,010 tests: 809 unit (80%), 148 integration (15%) and 53 end-to-end (5%).

```bash
npm test
```

runs the unit and integration suites (under a minute, no window opens).

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
  the ambush, Nerys, combat and boss phases, every creature's two shared attacks and its
  own, the skill checks, diving (swimming, air, pressure, every launcher, every creature,
  the Mother), underwater sound, the shop and everything Dorran says there and on deck,
  narration, the salvage fee and its cap, the bucket of chum, the faces beside the dialogue,
  the flippers and the kick, drowning and coming round on deck, her water kept clear of
  everything else, the two stations at the rail, gear in hand (the Gear screen, the stall, and what the rod,
  weapon, suit and launcher in hand change), menus under the mouse (sliders clicked and
  dragged, the arrows of a choice), bottles, letters, relics, the journal and
  Excalibur, heavy blows for every weapon, bleeding, stuns, poison and ink, the bestiary,
  records and chapter rewards, storms and lightning, the strange things at night,
  achievements, what the sea pays at each depth, a boy who never speaks, the voyage home and the credits, menus, cutscenes, the icon encoder, the pixel-art rasteriser and its
  animation caches, the posing rig for people, the layered boat, and every drawing
  routine.
- **Integration** (`tests/integration`) play through whole journeys with real key presses
  and full rendered frames: the first voyage from the title menu to the first sale,
  saving and continuing (including damaged saves and save slots), options taking effect in
  play, fishing into fights, Nerys, the Old One and the end of part one, diving from the
  bow to a deeper suit and back, fighting at range with mouse and keys, what the sea sounds
  like however you leave it, creatures animating in a crowd, Dorran talking across the deck
  and over the counter while the boy stays silent, answering both bosses' skill checks,
  finding letters and relics, the Mother and the end of part two, sailing home through
  the credits to a save that remembers it, heavy blows that bleed a creature out, a
  sting drawn out with a bandage, records and a filled bestiary chapter, a cast in a
  storm, a quiet night, an achievement kept across launches, what a second Old One sells for, a rematch bought from Dorran after losing, and a bucket of chum kept in a save,
  diving from the ladder and then casting from the bow, a find read with the sea held
  still, drowning through to Dorran's fee, the diving counter at the stall,
  an older weapon taken back in hand from the Gear screen and fought with, a rod picked
  with the mouse and cast with, a rod picked at the stall kept through Continue, a
  volume slider dragged with the mouse, pausing, walking the
  pixel-art deck, a line tied to the painted rod tip, and every screen through the
  renderer.
- **End-to-end** (`tests/e2e`) drive the Electron app with Playwright: the window and its
  lockdown (and a Mac's menu), fullscreen however the window gets there, a voyage played with the keyboard, what a frame on deck costs, Dorran calling out from his stall, dialogue that waits, save slots, settings
  and fullscreen surviving a restart, the test shortcuts, diving with real mouse aiming,
  creatures on screen, the Mother, the ending, a heavy blow held on a real
  key, poison and a bandage, the bestiary, lightning on screen with flashes on and off,
  the strange things at night, achievements and both new options surviving a restart, losing to the Old One
  and buying a bucket of chum for the rematch, the ladder and the bow as two stations,
  drowning and being hauled out, swapping gear with a real mouse, dragging
  a volume slider and clicking a setting's arrow, quitting,
  and the single-instance lock. Each launch gets a throwaway profile,
  so tests never touch your real saves.

## Files

```
index.html               page + canvas
src/font.js              the 5x7 bitmap font
src/core.js              pixel pipeline, math, input, WebAudio sfx and the underwater mix, particles, text, camera
src/music.js             the procedural score
src/data.js              rods, weapons, goods, monsters, attacks, catch tables, Dorran, narration
src/settings.js          options and the save file, both validated on load
src/art.js               drawing: sky, sea, water column, harbour, HUD
src/art-deep.js          drawing for part two: shots and the sea below
src/beasts.js            the pixel-art rasteriser, every creature, and the animation caches
src/figures.js           the boy, Dad, Dorran, Nerys, suits, weapons and launchers, posed in pixels
src/ship.js              the Margaret and everything on her deck, as layered pixel art
src/lore.js              letters, relics, bottles, Excalibur, and what the journal holds
src/status.js            bleeding, stuns, poison and ink: who has them, what they do, their icons
src/bestiary.js          the bestiary: creatures met and studied, records, chapter rewards, the book
src/weather.js           storms: rain, swell, lightning, thunder, and what shows in the flash
src/omens.js             the strange things that happen on quiet nights
src/achievements.js      achievements, kept apart from saves, their cards and their screen
src/skill.js             boss skill checks: the closing ring, the key sequence, the hold
src/cutscene.js          dialogue box, step sequencer, opening, Nerys, both part endings, the voyage home and the credits
src/fishing.js           cast → sink → wait → hook → reel, and the ambush
src/battle.js            player combat, monster AI and attacks, boss phases and skill checks
src/dive.js              diving: swimming, air and pressure, the creatures below, the Mother
src/shop.js              Uncle Dorran's stall (sell / gear / goods), and how he talks
src/menu.js              title menu, pause menu, the journal, every options screen
src/game.js              state machine, deck exploration, Dorran calling across the deck, HUD, main loop
electron/main.js         the desktop window (and a Mac's minimal menu)
electron/preload.js      the page's only bridge to the app: fullscreen and quit
.github/workflows/       builds for Mac and Windows on GitHub, and puts them on releases
scripts/make-icon.js     draws build/icon.png (npm run icon)
tests/                   unit, integration and end-to-end suites, and their helpers
```

`.claude/serve.js` + `launch.json` are a tiny local static server used during
development; the game does not need them.

## Notes on balance

Losing a fight costs you the catch and a quarter of your coins (at most 1,500§), but not
your progress: you wake up on the deck at full health, a little poorer. Rods and weapons must be bought in order, but anything you
own can be taken back in hand. A Heart Locket raises your maximum
health (four available, price climbs), the Storm Lantern makes bites come faster, and
the Drowned Charm pulls bigger things onto your hook. The Bucket of Chum, on sale once the
Old One has beaten you, makes it take your next bite.

The deepest fishing pays more than it used to, so the Abyssal Rod earns its price. Once
the Old One is beaten it bites less often, and a second one is worth well under half of
the first. By then diving is the better living.

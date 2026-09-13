# Deep Supper

A 2D sidescroller. You are a small boy on a fishing boat. Your father tells you to
catch supper and then leaves. It gets dark. The fish are not fish.

**To play: double-click `index.html`.** No install, no build step, no dependencies —
plain HTML and JavaScript, rendered as crisp 480x270 pixel art. Every pixel is drawn at runtime on a canvas and every note
of music is synthesised from oscillators. There are no asset files of any kind.

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

Your first cast is a lie: an ordinary little fish takes the bait and is eaten off your
line by something that comes most of the way out of the water to do it. Everything
after that is a monster.

From the Deepline rod onward, something far bigger than anything you can catch rises
out of the dark below your hook while you wait, looks at you, and goes away again. The
Abyssal Rod is what finally reaches it.

## Controls

| Key | |
|---|---|
| `A` `D` / arrows | walk |
| `SPACE` | jump · hold to reel · advance dialogue |
| `E` | interact · set the hook |
| `J` | swing your weapon |
| `K` | roll (brief invulnerability) |
| `Q` | bandage |
| `M` | mute everything · `N` music only |
| `ESC` | pause · leave a menu · hold to skip a cutscene |

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

## Files

```
index.html        page + canvas
src/font.js       the 5x7 bitmap font
src/core.js       pixel pipeline, math, input, WebAudio sfx, particles, text, camera
src/music.js      the procedural score
src/data.js       rods, weapons, goods, monsters, catch tables
src/art.js        all drawing: sky, sea, water column, boat, people, monsters
src/cutscene.js   dialogue box, step sequencer, opening + ending
src/fishing.js    cast → sink → wait → hook → reel
src/battle.js     player combat, monster AI and attacks, boss phases
src/shop.js       Dorran's stall (sell / gear / goods)
src/game.js       state machine, deck exploration, HUD, main loop
```

`.claude/serve.js` + `launch.json` are a tiny local static server used during
development; the game does not need them.

## Notes on balance

Losing a fight costs you the catch, not your progress — you wake up on the deck at full
health. Rods and weapons must be bought in order. A Heart Locket raises your maximum
health (four available, price climbs), the Storm Lantern makes bites come faster, and
the Drowned Charm pulls bigger things onto your hook.

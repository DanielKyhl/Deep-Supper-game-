# Deep Supper

A 2D sidescroller. You are a small boy on a fishing boat. Your father tells you to
catch supper and then leaves. It gets dark. The fish are not right.

**To play: double-click `index.html`.** No install, no build step, no dependencies —
it's plain HTML and JavaScript, and every pixel is drawn at runtime on a canvas.

## The loop

1. **Opening cutscene** (no input) — Dad hands you the boat, walks off down the dock,
   and the *Margaret* sails out while the sun goes down. Something very large passes
   under the hull. Hold `ESC` to skip.
2. **Walk the deck** — find the crate by the cabin and take the rusty cutlass. Nothing
   sharp aboard, nothing goes in the water.
3. **Fish** at the bow. Wait for the bite, press `E` to set the hook, then hold `SPACE`
   to reel — keep the fish inside the moving bar without snapping the line.
4. **Fight what comes up.** It is not a fish. Swing, roll through its lunges, jump its
   shockwaves, and put it down.
5. **Sell it to Dorran** at the stall amidships.
6. **Spend the coin** on deeper rods and heavier blades, and go back for something worse.

Four depths of water, eight things living in them. The deepest line reaches **The Old
One** — beat it and you sail home for the ending.

## Controls

| Key | |
|---|---|
| `A` `D` / arrows | walk |
| `SPACE` | jump · hold to reel · advance dialogue |
| `E` | interact · set the hook |
| `J` | swing your sword |
| `K` | roll (brief invulnerability) |
| `Q` | use a bandage |
| `M` | mute |
| `ESC` | pause · leave a menu · hold to skip a cutscene |

## Files

```
index.html        page + canvas
src/core.js       math, input, WebAudio sfx, particles, floating text, camera
src/data.js       rods, swords, goods, monsters, catch tables
src/art.js        all drawing: sky, sea, harbour, boat, people, monsters
src/cutscene.js   dialogue box, step sequencer, opening + ending
src/fishing.js    cast → wait → hook → reel minigame
src/battle.js     player combat, monster AI and attacks
src/shop.js       Dorran's stall (sell / gear / goods)
src/game.js       state machine, deck exploration, HUD, main loop
```

`.claude/serve.js` + `launch.json` are a tiny local static server used for development;
the game does not need them.

## Notes on balance

Losing a fight costs you the catch, not your progress — you wake up on the deck at full
health. Rods and swords must be bought in order. A Heart Locket raises your maximum
health (four available, price climbs), the Storm Lantern speeds up bites, and the
Drowned Charm pulls bigger things onto your hook.

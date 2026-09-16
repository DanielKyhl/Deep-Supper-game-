'use strict';
/* ========================================================================
   data.js — gear, goods, and the things in the water
   ======================================================================== */

const RODS = [
  { id: 'bamboo',   name: 'Bamboo Rod',     price: 0,   depth: 1, bar: 100, reel: 1.00,
    desc: "Dad's old spare. Splinters included, free of charge." },
  { id: 'iron',     name: 'Iron Reel Rod',  price: 85,  depth: 2, bar: 112, reel: 1.14,
    desc: 'Heavier line. Reaches the cold water under the swell.' },
  { id: 'deepline', name: 'Deepline Rod',   price: 240, depth: 3, bar: 128, reel: 1.28,
    desc: 'Sinks well past the point where the light gives up.' },
  { id: 'abyssal',  name: 'Abyssal Rod',    price: 600, depth: 4, bar: 146, reel: 1.44,
    desc: 'The line hums on its own. Something down there answers.' }
];

/* Weapons. `style` drives both the animation and the hitbox:
     swing  — wide arc, generous vertical coverage
     chop   — slow overhead, huge damage, small window
     thrust — long and narrow, fast, poor against tall targets
   `kind` is purely how Art draws it.                                      */

const WEAPONS = [
  { id: 'dipnet', name: 'Dip Net', kind: 'net', style: 'swing', price: 0,
    dmg: 8, reach: 1.05, speed: 1.0, knock: 0.6,
    metal: '#9aa6b4', grip: '#8a6a3c', accent: '#d9d2b8',
    desc: 'For scooping herring. You are not scooping herring.' },

  { id: 'gaff', name: 'Gaff Hook', kind: 'gaff', style: 'swing', price: 120,
    dmg: 14, reach: 1.22, speed: 1.05, knock: 0.9,
    metal: '#b7bec8', grip: '#6b4a2a', accent: '#8e6a3a',
    desc: 'A hook on a stick. Honest work, honest tool.' },

  { id: 'cleaver', name: 'Gutting Cleaver', kind: 'cleaver', style: 'chop', price: 280,
    dmg: 26, reach: 0.98, speed: 0.78, knock: 1.5,
    metal: '#d3dae4', grip: '#4a3b2a', accent: '#8e2c3a',
    desc: 'Meant for taking heads off things that already stopped moving.' },

  { id: 'harpoon', name: 'Whaling Harpoon', kind: 'harpoon', style: 'thrust', price: 520,
    dmg: 33, reach: 1.48, speed: 1.22, knock: 0.7,
    metal: '#a7c6d8', grip: '#3f5b6b', accent: '#c9b27a',
    desc: 'Barbed, so it only travels one direction through a thing.' },

  { id: 'chain', name: 'Anchor Chain', kind: 'chain', style: 'swing', price: 860,
    dmg: 44, reach: 1.40, speed: 0.72, knock: 2.0,
    metal: '#8d949e', grip: '#5a5f6b', accent: '#3f434d',
    desc: 'Six feet of ground tackle. No edge at all. Doesn’t need one.' },

  { id: 'tooth', name: "Leviathan's Tooth", kind: 'tooth', style: 'swing', price: 1500,
    dmg: 62, reach: 1.20, speed: 1.10, knock: 1.4,
    metal: '#f2ead6', grip: '#4a3b52', accent: '#a88ad0',
    desc: 'Pulled from a jaw by a boy who should not have survived doing it.' }
];

/* One sword, not for sale. It comes up on a line once in a thousand casts,
   and nothing on the boat survives a single blow from it.                 */
const EXCALIBUR = {
  id: 'excalibur', name: 'Excalibur', kind: 'excalibur', style: 'swing', price: 0,
  dmg: 999, reach: 1.34, speed: 1.2, knock: 2.4,
  metal: '#e6eeff', grip: '#34407a', accent: '#f0cf6a',
  desc: 'It came out of the sea, not a stone. Nothing on this boat survives one blow of it.'
};

// what he fights with on deck
function deckWeapon() {
  return Player.excalibur ? EXCALIBUR : WEAPONS[Math.max(0, Player.weapon)];
}

/* ------------------------------ below the surface -------------------------
   Diving suits, for after the Old One. `depth` is how far down (in pixels
   of water, fifty to a fathom) the suit holds before it starts to buckle,
   `air` is seconds in the tank, and `lamp` widens the helmet light.        */

const SUITS = [
  { id: 'drowned', name: 'Drowned Diving Suit', price: 0, depth: 950, air: 70, speed: 1.00, lamp: 1.00,
    brass: '#a8844a', rubber: '#4a4f45',
    desc: "Your great-grandfather's. Patched. Mostly watertight." },
  { id: 'brass', name: 'Brass Helmet Rig', price: 900, depth: 1950, air: 95, speed: 1.08, lamp: 1.15,
    brass: '#d0a650', rubber: '#3f4a52',
    desc: 'A proper hard hat and a bigger tank. Dorran swears it has never leaked.' },
  { id: 'riveted', name: 'Riveted Pressure Suit', price: 2400, depth: 3050, air: 120, speed: 1.16, lamp: 1.30,
    brass: '#9aa3ad', rubber: '#34383f',
    desc: 'Iron plates over rubber. You clank. The deep does not care.' },
  { id: 'trench', name: 'Trench Hardsuit', price: 5200, depth: 4200, air: 150, speed: 1.24, lamp: 1.50,
    brass: '#5d8aa0', rubber: '#1f2a33',
    desc: 'Built for the very bottom. Nobody has ever needed to go further.' }
];

/* Launchers that work underwater. Every one of them fires, none of them
   ever runs out, and nothing goes bang.
     harpoon  one barbed harpoon on a line: it bites the first thing it hits,
              then reels back in before it can fly again
     spread   a fan of prongs, all at once
     chain    a ball of lightning that jumps from what it hits to what is near
     pierce   a heavy bolt that goes through everything in a line
     wave     a ring of sound that rolls forward, widening, through everything
   `speed` and `range` are the shot's, in pixels; `size` its radius.        */
const DIVE_WEAPONS = [
  { id: 'harpoon', name: 'Drowned Harpoon', kind: 'dharpoon', style: 'harpoon', price: 0,
    dmg: 30, speed: 950, range: 560, cd: .15, knock: 160, size: 10,
    metal: '#9fb8c4', grip: '#5b4a3a', accent: '#c9b27a',
    desc: "The Old One's harpoon on a spring launcher. It bites, then reels back in." },
  { id: 'trident', name: 'Barnacle Trident', kind: 'trident', style: 'spread', price: 1100,
    dmg: 24, speed: 860, range: 480, cd: .55, knock: 120, size: 8, count: 3, spread: .16,
    metal: '#b7c4bc', grip: '#3f5a52', accent: '#e8dcc0',
    desc: 'Fires all three barnacled prongs at once, fanned out. Hard to miss with.' },
  { id: 'eel', name: 'Eel on a Rope', kind: 'eel', style: 'chain', price: 2200,
    dmg: 54, speed: 640, range: 600, cd: .8, knock: 100, size: 12, chain: 3, jump: 240,
    metal: '#7fe0ff', grip: '#4a5a3a', accent: '#d8f06a',
    desc: 'A live electric eel on a leash. It spits lightning at what you point it at, and at whatever is next to that.' },
  { id: 'tusk', name: 'Narwhal Tusk', kind: 'tusk', style: 'pierce', price: 3600,
    dmg: 115, speed: 1200, range: 760, cd: 1.0, knock: 260, size: 10,
    metal: '#efe6d0', grip: '#5a4a52', accent: '#b9a88e',
    desc: "A narwhal's tusk in a whaler's crossbow. It goes through the first thing, and the next." },
  { id: 'bell', name: 'Sunken Bell', kind: 'bell', style: 'wave', price: 6000,
    dmg: 135, speed: 520, range: 640, cd: 1.2, knock: 380, size: 26, grow: 90,
    metal: '#b8864a', grip: '#4a3b2a', accent: '#e8c76a',
    desc: "Lanthorne's old warning bell. Its ring rolls out ahead of you and breaks everything it passes." }
];

// how the shop describes each way of firing
const FIRE_STYLES = { harpoon: 'harpoon on a line', spread: 'spread of 3', chain: 'chain lightning', pierce: 'pierces', wave: 'sound wave' };

const GOODS = [
  { id: 'bandage', name: 'Oiled Bandage',  price: 24,  type: 'consume', max: 5,
    desc: 'Binds 2 hearts back together. Press Q to use.' },
  { id: 'locket',  name: 'Heart Locket',   price: 150, type: 'maxhp', max: 4, scale: 1.55,
    desc: 'A portrait of nobody. Raises your maximum health by one.' },
  { id: 'lantern', name: 'Storm Lantern',  price: 95,  type: 'lantern', max: 1,
    desc: 'Curious things rise to the light. Bites come far quicker.' },
  { id: 'charm',   name: 'Drowned Charm',  price: 210, type: 'luck', max: 1,
    desc: 'Barnacled and cold. Bigger things take the bait.' }
];

/* ------------------------------- monsters -------------------------------- */
/* plan  : which body Art draws it with — eel, angler, tentacle, ray,
           crustacean, bloom, husk, maw, leviathan
   len   : nose-to-tail in px      girth : half-height as a fraction of len
   eyes  : how many, and how badly arranged
   glow  : bioluminescence colour, or null for things that do not light up  */

const MONSTERS = [

  /* ------------------------------ depth 1 ------------------------------ */

  { id: 'gnashfin', name: 'Gnashfin', depth: 1, plan: 'eel',
    hp: 58, len: 240, girth: .13, value: 44, dmg: 1, speed: 84, eyes: 2,
    body: [86, 130, 122], belly: [188, 214, 198], fin: [60, 96, 96], eye: '#ffd76a', glow: null,
    atk: ['lunge', 'lunge', 'spit'],
    flavour: 'Far too many teeth for a thing that size. They keep going back.' },

  { id: 'bristlejaw', name: 'Bristlejaw', depth: 1, plan: 'angler',
    hp: 76, len: 230, girth: .30, value: 58, dmg: 1, speed: 78, eyes: 2,
    body: [120, 96, 132], belly: [210, 190, 206], fin: [84, 62, 100], eye: '#ff8f5a', glow: '#ffb05a',
    atk: ['lunge', 'spit', 'slam'],
    flavour: 'The little light on its head is doing an impression of a friend.' },

  { id: 'palefinger', name: 'Palefinger', depth: 1, plan: 'tentacle',
    hp: 66, len: 210, girth: .34, value: 52, dmg: 1, speed: 92, eyes: 3,
    body: [206, 196, 188], belly: [236, 230, 222], fin: [170, 156, 150], eye: '#4a3b52', glow: null,
    atk: ['lunge', 'slam', 'spit'],
    flavour: 'It has hands. Small ones. Rather a lot of them.' },

  { id: 'netbiter', name: 'Netbiter', depth: 1, plan: 'crustacean',
    hp: 92, len: 226, girth: .28, value: 66, dmg: 1, speed: 70, eyes: 4,
    body: [150, 88, 64], belly: [214, 168, 130], fin: [110, 60, 44], eye: '#f2e2bd', glow: null,
    atk: ['slam', 'lunge', 'slam'],
    flavour: 'Every net on this coast has a piece missing. Here it all is.' },

  /* ------------------------------ depth 2 ------------------------------ */

  { id: 'glasseye', name: 'Glasseye Lurker', depth: 2, plan: 'angler',
    hp: 148, len: 286, girth: .33, value: 122, dmg: 1, speed: 96, eyes: 1,
    body: [72, 108, 148], belly: [176, 206, 226], fin: [48, 74, 112], eye: '#c9f6ff', glow: '#8fe6ff',
    atk: ['lunge', 'slam', 'spit', 'spit'],
    flavour: 'The eye does not blink. It has not blinked in a very long time.' },

  { id: 'nettlejack', name: 'Nettlejack', depth: 2, plan: 'bloom',
    hp: 132, len: 264, girth: .42, value: 136, dmg: 1, speed: 104, eyes: 6,
    body: [92, 134, 88], belly: [196, 214, 162], fin: [62, 96, 58], eye: '#ffe066', glow: '#b6ff8a',
    atk: ['spit', 'spit', 'slam', 'lunge'],
    flavour: 'Stinging threads trail off it like cut rigging. They are still growing.' },

  { id: 'ropethroat', name: 'Rope-Throat', depth: 2, plan: 'eel',
    hp: 170, len: 320, girth: .11, value: 158, dmg: 1, speed: 118, eyes: 2,
    body: [64, 70, 96], belly: [162, 170, 196], fin: [42, 46, 70], eye: '#ff6a6a', glow: null,
    atk: ['lunge', 'lunge', 'slam'],
    flavour: 'Knotted three times around itself and still longer than the boat.' },

  { id: 'shalebank', name: 'Shalebank Crawler', depth: 2, plan: 'crustacean',
    hp: 196, len: 272, girth: .30, value: 176, dmg: 1, speed: 74, eyes: 6,
    body: [98, 104, 92], belly: [172, 178, 158], fin: [66, 72, 62], eye: '#ffcf4a', glow: null,
    atk: ['slam', 'slam', 'lunge', 'spit'],
    flavour: 'It wears the seabed. Some of the seabed is other crawlers.' },

  /* ------------------------------ depth 3 ------------------------------ */

  { id: 'tidemaw', name: 'Tidemaw', depth: 3, plan: 'maw',
    hp: 310, len: 300, girth: .44, value: 288, dmg: 2, speed: 112, eyes: 8,
    body: [58, 74, 116], belly: [150, 168, 208], fin: [38, 48, 84], eye: '#ff6a6a', glow: '#7a9cff',
    atk: ['lunge', 'slam', 'slam', 'spit'],
    flavour: 'Mostly mouth. The eyes are arranged around it like an audience.' },

  { id: 'gallowsgill', name: 'Gallowsgill', depth: 3, plan: 'ray',
    hp: 356, len: 360, girth: .26, value: 336, dmg: 2, speed: 124, eyes: 2,
    body: [104, 62, 62], belly: [206, 168, 154], fin: [70, 40, 44], eye: '#ffcf4a', glow: null,
    atk: ['lunge', 'slam', 'spit', 'lunge'],
    flavour: 'Rope scars ring its throat. Somebody tried this before you.' },

  { id: 'weepingbell', name: 'The Weeping Bell', depth: 3, plan: 'bloom',
    hp: 288, len: 330, girth: .48, value: 352, dmg: 2, speed: 96, eyes: 0,
    body: [122, 96, 150], belly: [216, 198, 236], fin: [88, 68, 118], eye: '#ffffff', glow: '#d6a8ff',
    atk: ['spit', 'spit', 'slam', 'spit'],
    flavour: 'It makes a sound underwater. Dorran says not to describe it.' },

  { id: 'hookhand', name: 'Hookhand', depth: 3, plan: 'tentacle',
    hp: 400, len: 318, girth: .36, value: 404, dmg: 2, speed: 116, eyes: 5,
    body: [72, 92, 84], belly: [166, 190, 174], fin: [48, 64, 58], eye: '#a8ff9e', glow: '#6effc4',
    atk: ['lunge', 'slam', 'lunge', 'spit'],
    flavour: 'Four of the arms end in hooks. One of them is holding a hook.' },

  /* ------------------------------ depth 4 ------------------------------ */

  { id: 'hollow', name: 'The Hollow Trawler', depth: 4, plan: 'husk',
    hp: 620, len: 380, girth: .34, value: 700, dmg: 2, speed: 126, eyes: 4,
    body: [64, 68, 74], belly: [158, 164, 170], fin: [40, 44, 50], eye: '#9effc4', glow: '#9effc4',
    atk: ['lunge', 'slam', 'spit', 'sweep'],
    flavour: 'There are planks in its belly. Painted ones. You know the colour.' },

  { id: 'cathedral', name: 'Cathedral Ray', depth: 4, plan: 'ray',
    hp: 700, len: 440, girth: .28, value: 780, dmg: 2, speed: 134, eyes: 3,
    body: [46, 56, 92], belly: [140, 152, 200], fin: [30, 38, 66], eye: '#ffe9a8', glow: '#8fa8ff',
    atk: ['lunge', 'sweep', 'spit', 'lunge', 'slam'],
    flavour: 'It passes over you slowly, the way weather does.' },

  { id: 'penance', name: 'Nine-Eyed Penance', depth: 4, plan: 'maw',
    hp: 780, len: 360, girth: .46, value: 850, dmg: 3, speed: 128, eyes: 9,
    body: [88, 48, 62], belly: [198, 150, 160], fin: [58, 30, 42], eye: '#ffd257', glow: '#ff7a5a',
    atk: ['lunge', 'slam', 'spew', 'sweep', 'lunge'],
    flavour: 'Nine eyes and all of them apologetic. That is somehow worse.' },

  { id: 'choir', name: 'The Drowned Choir', depth: 4, plan: 'bloom',
    hp: 660, len: 400, girth: .50, value: 820, dmg: 2, speed: 118, eyes: 12,
    body: [70, 84, 118], belly: [186, 200, 226], fin: [48, 58, 86], eye: '#e8f4ff', glow: '#a8d8ff',
    atk: ['spit', 'spew', 'slam', 'sweep', 'spit'],
    flavour: 'Every face in it is roughly the same face, and it is nearly yours.' },

  /* -------------------------------- boss ------------------------------- */

  { id: 'leviathan', name: 'The Old One', depth: 4, boss: true, plan: 'leviathan',
    hp: 2400, len: 560, girth: .30, value: 2600, dmg: 3, speed: 140, eyes: 7,
    body: [38, 44, 78], belly: [128, 140, 186], fin: [24, 28, 54], eye: '#ff4d4d', glow: '#ff4d4d',
    atk: ['lunge', 'slam', 'spit', 'lunge', 'slam'],
    flavour: 'The sea went flat and quiet, the way a room does when you walk in.' }
];

/* ----------------------------- the Brood, below ----------------------------
   What you meet swimming. `zone` is which band of water it lives in (see
   DIVE_ZONES in dive.js), `aggro` how close you get before it notices.
   Attacks: bite (a short lunge), charge (a long straight run), ink (three
   globs), pulse (a ring of force spreading out from its body).            */

const DIVE_MONSTERS = [

  /* ------------------------------ The Shelf ------------------------------ */

  { id: 'kelpstrangler', name: 'Kelp Strangler', zone: 1, plan: 'eel',
    hp: 90, len: 200, girth: .12, value: 110, dmg: 1, speed: 110, eyes: 2, aggro: 280,
    body: [70, 110, 70], belly: [170, 200, 150], fin: [50, 80, 50], eye: '#e8f06a', glow: null,
    atk: ['bite', 'bite', 'charge'],
    flavour: 'It looks like kelp right up until it has you by the ankle.' },

  { id: 'reefgnasher', name: 'Reef Gnasher', zone: 1, plan: 'angler',
    hp: 110, len: 170, girth: .32, value: 130, dmg: 1, speed: 90, eyes: 2, aggro: 300,
    body: [150, 100, 80], belly: [220, 190, 160], fin: [110, 70, 60], eye: '#ffcf4a', glow: '#ffb05a',
    atk: ['bite', 'ink'],
    flavour: 'Lives in the shipwrecks. Built most of them.' },

  { id: 'bladderjelly', name: 'Bladder Jelly', zone: 1, plan: 'bloom',
    hp: 80, len: 160, girth: .45, value: 120, dmg: 1, speed: 60, eyes: 0, aggro: 240,
    body: [150, 120, 190], belly: [220, 200, 240], fin: [110, 90, 150], eye: '#ffffff', glow: '#d6a8ff',
    atk: ['pulse'],
    flavour: 'Drifts toward warmth. You are warmth.' },

  { id: 'shelfcrab', name: 'Shelf Crab', zone: 1, plan: 'crustacean',
    hp: 140, len: 180, girth: .3, value: 150, dmg: 1, speed: 70, eyes: 2, aggro: 260,
    body: [170, 80, 60], belly: [230, 170, 130], fin: [130, 60, 40], eye: '#f2e2bd', glow: null,
    atk: ['charge', 'bite'],
    flavour: 'A crab the size of a rowing boat, and just as keen to be in the water with you.' },

  /* ------------------------------ The Drop ------------------------------- */

  { id: 'clifflamprey', name: 'Cliff Lamprey', zone: 2, plan: 'eel',
    hp: 220, len: 260, girth: .1, value: 300, dmg: 1, speed: 150, eyes: 2, aggro: 340,
    body: [80, 80, 100], belly: [170, 170, 190], fin: [55, 55, 75], eye: '#ff6a6a', glow: null,
    atk: ['charge', 'bite', 'bite'],
    flavour: 'Hangs off the cliff by its mouth, waiting for something with blood in it.' },

  { id: 'hollowshell', name: 'Hollowshell', zone: 2, plan: 'crustacean',
    hp: 320, len: 230, girth: .34, value: 360, dmg: 2, speed: 80, eyes: 4, aggro: 280,
    body: [96, 104, 92], belly: [172, 178, 158], fin: [66, 72, 62], eye: '#9effc4', glow: null,
    atk: ['charge', 'pulse'],
    flavour: 'Something else lives inside the shell. It has never come out to be introduced.' },

  { id: 'gulperwidow', name: 'Gulper Widow', zone: 2, plan: 'maw',
    hp: 260, len: 240, girth: .42, value: 340, dmg: 2, speed: 110, eyes: 6, aggro: 320,
    body: [60, 40, 70], belly: [150, 120, 160], fin: [40, 26, 50], eye: '#ff8f5a', glow: '#ff7a5a',
    atk: ['bite', 'ink', 'bite'],
    flavour: 'All mouth and mourning. It wears the nets of every boat it has emptied.' },

  { id: 'sootwing', name: 'Sootwing', zone: 2, plan: 'ray',
    hp: 240, len: 300, girth: .24, value: 320, dmg: 1, speed: 130, eyes: 2, aggro: 360,
    body: [40, 44, 60], belly: [130, 136, 160], fin: [28, 30, 44], eye: '#c9f6ff', glow: null,
    atk: ['ink', 'charge'],
    flavour: 'Leaves a cloud of black behind it, and whatever it was chasing inside the cloud.' },

  /* --------------------------- The Drowned Halls ------------------------- */

  { id: 'hallwarden', name: 'Hall Warden', zone: 3, plan: 'husk',
    hp: 560, len: 320, girth: .32, value: 680, dmg: 2, speed: 110, eyes: 4, aggro: 360,
    body: [70, 74, 80], belly: [160, 166, 172], fin: [44, 48, 54], eye: '#9effc4', glow: '#9effc4',
    atk: ['bite', 'pulse', 'charge'],
    flavour: 'It still walks its old rounds. The hall it guards has no roof any more.' },

  { id: 'lanternthief', name: 'Lantern Thief', zone: 3, plan: 'angler',
    hp: 480, len: 280, girth: .33, value: 620, dmg: 2, speed: 130, eyes: 1, aggro: 400,
    body: [50, 70, 110], belly: [150, 180, 220], fin: [34, 48, 80], eye: '#c9f6ff', glow: '#8fe6ff',
    atk: ['bite', 'ink', 'ink'],
    flavour: "The light on its head was somebody's front door lamp." },

  { id: 'palechoir', name: 'Pale Choir-Ray', zone: 3, plan: 'ray',
    hp: 520, len: 360, girth: .25, value: 700, dmg: 2, speed: 140, eyes: 3, aggro: 380,
    body: [200, 196, 210], belly: [236, 232, 240], fin: [150, 146, 160], eye: '#4a3b52', glow: null,
    atk: ['charge', 'pulse', 'ink'],
    flavour: 'Sings as it comes for you. Beautifully. That is the worst part.' },

  { id: 'brinetongue', name: 'Brinetongue', zone: 3, plan: 'tentacle',
    hp: 600, len: 300, girth: .36, value: 760, dmg: 2, speed: 115, eyes: 5, aggro: 350,
    body: [110, 60, 70], belly: [200, 150, 160], fin: [80, 40, 50], eye: '#ffd257', glow: '#ff7a5a',
    atk: ['bite', 'charge', 'bite'],
    flavour: 'Tastes the water for you from three halls away.' },

  /* ------------------------------ Lanthorne ------------------------------ */

  { id: 'broodsister', name: 'Brood Sister', zone: 4, plan: 'tentacle',
    hp: 900, len: 360, girth: .36, value: 1150, dmg: 2, speed: 140, eyes: 7, aggro: 420,
    body: [60, 40, 62], belly: [160, 120, 160], fin: [40, 26, 44], eye: '#c46bff', glow: '#c46bff',
    atk: ['bite', 'charge', 'pulse'],
    flavour: 'The Old One had siblings. This is one of the small ones.' },

  { id: 'trenchmaw', name: 'Trench Maw', zone: 4, plan: 'maw',
    hp: 1100, len: 380, girth: .44, value: 1300, dmg: 3, speed: 120, eyes: 9, aggro: 400,
    body: [40, 50, 80], belly: [140, 150, 190], fin: [26, 32, 56], eye: '#ff6a6a', glow: '#7a9cff',
    atk: ['bite', 'ink', 'pulse'],
    flavour: 'It came up out of the trench with its mouth already open.' },

  { id: 'gatecrawler', name: 'Gate Crawler', zone: 4, plan: 'crustacean',
    hp: 1200, len: 340, girth: .3, value: 1250, dmg: 2, speed: 100, eyes: 6, aggro: 380,
    body: [90, 96, 120], belly: [170, 176, 200], fin: [60, 64, 84], eye: '#ffcf4a', glow: null,
    atk: ['charge', 'charge', 'pulse'],
    flavour: "Has been trying to get through Lanthorne's gate for a hundred years. Patient." },

  { id: 'drownedwarden', name: 'Drowned Warden', zone: 4, plan: 'husk',
    hp: 1000, len: 360, girth: .34, value: 1200, dmg: 2, speed: 130, eyes: 4, aggro: 420,
    body: [64, 68, 74], belly: [158, 164, 170], fin: [40, 44, 50], eye: '#9ff0ff', glow: '#9ff0ff',
    atk: ['bite', 'pulse', 'ink', 'charge'],
    flavour: "One of Lanthorne's own, once. It doesn't remember which side it was on." },

  /* ------------------------ hers, and her ------------------------------ */

  { id: 'broodling', name: 'Broodling', zone: 4, plan: 'eel', spawnOnly: true,
    hp: 70, len: 120, girth: .14, value: 40, dmg: 1, speed: 170, eyes: 2, aggro: 2000,
    body: [70, 40, 72], belly: [170, 130, 170], fin: [50, 26, 52], eye: '#ff4d7a', glow: '#c46bff',
    atk: ['bite', 'bite', 'charge'],
    flavour: 'Newly hatched. Already hungry. Already hers.' },

  { id: 'mother', name: 'The Mother Below', zone: 4, plan: 'mother', boss: true,
    hp: 5200, len: 860, girth: .2, value: 9000, dmg: 2, speed: 150, eyes: 12, aggro: 5000,
    body: [52, 34, 60], belly: [170, 130, 170], fin: [36, 22, 44], eye: '#ff4d7a', glow: '#c46bff',
    atk: ['maw', 'pulse', 'sweep', 'brood', 'inhale'],
    flavour: 'The Old One was hers.' }
];

// every creature the game knows, above and below, for saves and trophies
function allMonsters() { return MONSTERS.concat(DIVE_MONSTERS); }
function monsterDef(id) { return allMonsters().find(m => m.id === id) || null; }

const JUNK = [
  { name: 'a waterlogged boot', value: 4,  icon: 'boot' },
  { name: 'a knot of black kelp', value: 3, icon: 'kelp' },
  { name: 'an empty green bottle', value: 7, icon: 'bottle' },
  { name: 'half a ship\'s wheel', value: 11, icon: 'wheel' }
];

/* ------------------------------ Uncle Dorran ------------------------------
   The boy's uncle keeps a stall amidships and a flask in his coat. He has
   never once found anything the boy brings him strange: it is all fish to
   him. The boy never says a word, which suits Dorran. More room for his.

   {fish} is an ordinary fish, picked fresh each time ({Fish} capitalised);
   {name}, {value}, {total} and {short} are filled in by the stall.        */

const DORRAN = {
  greet: [
    "Evening, nephew. Or morning. One of the two. *hic*",
    "Ah! My favourite nephew. My only nephew? Don't answer that.",
    "Come in, come in. Mind the bucket. Mind the other bucket.",
    "Quiet as ever. Good lad. Leaves more of the talking for me.",
    "What've you brought your old uncle? Fish? Lovely. It's all fish.",
    "I wasn't asleep. I was resting my eyes. Both of them. At once.",
    "Your dad says I'm a bad influence. Your dad says a lot of things.",
    "Don't mind the smell. That's the stall. Or it's me."
  ],
  // once he's in the suit
  greetDiving: [
    "Back from the bottom? Wet down there, I hear.",
    "You're dripping on my counter. That's fine. Everything drips.",
    "Been swimming? Your great-grandad swam. Or sank. One of those.",
    "Take the helmet off, I can't hear you. Ha. As if I ever could."
  ],
  // once the Mother has gone back down
  greetDone: [
    "They're saying the sea's gone quiet. Probably the weather.",
    "Lights on under the boat these days. Very nice. Saves on candles."
  ],
  // things he notices once a voyage, the first time he sees you after (then forgets)
  remark: {
    first:  "Caught something already? That's my nephew. Pop it on the scale.",
    girl:   "You've the look of a lad who's met a girl. Out of the sea? Happens.",
    suit:   "Is that a diving suit? Suits you. SUITS you. ...Nobody ever laughs.",
    mother: "Lanthorne's all lit up, they're saying. Where's Lanthorne? Cheers."
  },
  // what everything the boy brings him is
  fish: ['cod', 'haddock', 'mackerel', 'whiting', 'plaice', 'herring', 'pollock', 'sprat', 'turbot'],
  sell: [
    "Lovely bit of {fish}, that.",
    "{Fish}. Big {fish}. Cross {fish}.",
    "Nice {fish}. More teeth than I remember {fish} having.",
    "{name}? We used to get those in a tin.",
    "Still twitching. Still counts. {value} it is.",
    "Put it with the others. The others are in the bucket. Mostly.",
    "Counting its eyes'd take all night. Here's {value}.",
    "Did it bite you? Doesn't matter. Everything bites.",
    "Your aunt made a pie of one of those. Then she left. Unrelated."
  ],
  sellBig: [
    "Now THAT is a {fish}. Your dad caught one that big once. In a story.",
    "Heavy! Help me get it up on the... no, leave it. Floor's fine."
  ],
  sellAll: [
    "{total} for the lot. Don't tell your mother where you got it.",
    "All of it? Right. {total}. I'll count it again later. I won't."
  ],
  buy: {
    rod: [
      "Longer string, deeper fish. That's science, that is.",
      "Good rod. Don't wave it about, you'll have someone's eye out."
    ],
    weapon: [
      "Mind the edge. It's the sharp bit. The sharp bit's the edge.",
      "Sold. No refunds, no reattachments.",
      "What's a boy need with that? Fish. Course. For the fish."
    ],
    suit: [
      "Deeper's colder. Wear a vest under it. Your mother'd want that.",
      "Never leaked once. Not that anyone's been in it. For a while."
    ],
    diveweapon: [
      "Point that end at the fish, and the other end at nothing.",
      "Shoots underwater, that. Don't ask me how. Don't ask me anything."
    ],
    consume: ["Wrap it tight. Wrap it twice. Wrap me one while you're at it."],
    maxhp:   ["Somebody loved somebody. Now it's yours. Lucky somebody."],
    lantern: ["They come to the light. So do I. Where's my bottle."],
    luck:    ["Cold, isn't it. It was on a neck once. Nice neck."]
  },
  owned:  ["You've got one of those. I've got two. Of something."],
  locked: ["One thing at a time, lad. I can only count to one just now."],
  poor:   ["That's {short} short. I'd lend it you, but I've drunk it."],
  // when nothing is happening, which to him is a gap in the conversation
  mutter: [
    "*hic*",
    "Fifteen men on a dead man's... something. Chest? Leg?",
    "Where'd I put my medicine. Oh. It's in me.",
    "Ever noticed the sea's bigger at night? No. Me neither.",
    "Take your time. Browse. Browse away. I'll be here. Somewhere.",
    "Your dad was quiet like you. No he wasn't. Never shut up.",
    "I had a boat once. This one. I've still got it. Hang on.",
    "Did you say something? No. You never do. Good lad."
  ],
  // called out from behind the counter while the boy is about the deck
  deck: {
    near: [
      "Oi! Nephew! Come here. No, go away. No, come here.",
      "Buying? Selling? Just looking at me?",
      "Don't stand there dripping. Come and drip over here.",
      "Whatever it is, I'll weigh it."
    ],
    idle: [
      "*hic*",
      "Lovely night for it. For what? For it.",
      "Somebody's been counting my buckets.",
      "Oh the sea is wet and the fish are... fish...",
      "Is it Tuesday? Feels like a Tuesday."
    ],
    won: [
      "That'll sell! Bring it here before it gets up.",
      "Ooh, a big one. Don't let it back in."
    ],
    aboard: [
      "Back already? Wash your hands.",
      "Touch the bottom, did you? Don't touch me."
    ],
    woke: [
      "Having a lie down? Best part of the night.",
      "Wakey wakey. Sea's still there."
    ]
  },
};

/* -------------------------------- narration --------------------------------
   What happens, told by nobody in particular, in the dialogue box. {fee} is
   filled in with what Dorran charged for fishing him out.                  */

const NARRATION = {
  start: [
    "The boat is yours, the sea is dark, and your hands are empty.",
    "There is a crate by the cabin. Whatever is in it is better than nothing."
  ],
  crate: [
    "The old crate: rope, oilskins, a tin of something furred over, and a dip net.",
    "Bent hoop, splintered handle. It is for scooping herring out of a bucket. It will have to do."
  ],
  noNet: [
    "Empty hands. Nothing goes over the side without something to hit it with.",
    "The crate by the cabin, first."
  ],
  lost: [
    "You come to flat on the deck, soaked. Whatever it was has gone back down with your catch."
  ],
  fee: "Dorran fished you out of the scuppers. His salvage fee: {fee} coins.",
  excalibur: [
    "The line comes up heavy, and not with a fish.",
    "A sword. Bright as the day it went into the water, without a speck of rust on it.",
    "It hums in your hand. Nothing on this boat is going to survive it."
  ],
  bottle: "A bottle, corked and sealed, with a page rolled up inside."
};

// what it costs to be fished out: a quarter of what you carry, rounded down
const SALVAGE_CUT = .25;
function salvageFee() {
  const fee = Math.floor(Player.coins * SALVAGE_CUT);
  Player.coins -= fee;
  return fee;
}

/* --------------------------- catch generation ---------------------------- */

function rollCatch(depth, luck) {
  // junk is a small mercy
  if (chance(luck ? 0.07 : 0.13)) {
    const j = choice(JUNK);
    return { junk: true, name: j.name, icon: j.icon, value: Math.round(j.value * rand(.8, 1.4)) };
  }
  const pool = MONSTERS.filter(m => m.depth <= depth && !m.boss);
  const boss = MONSTERS.find(m => m.id === 'leviathan');

  if (depth >= 4 && chance(luck ? 0.42 : 0.3)) return boss;

  // weight toward the deepest thing your line can reach
  const weighted = [];
  for (const m of pool) {
    let w = m.depth === depth ? 5 : (m.depth === depth - 1 ? 2 : 1);
    if (luck) w *= (1 + m.depth * 0.5);
    for (let i = 0; i < Math.round(w); i++) weighted.push(m);
  }
  return choice(weighted);
}

function makeTrophy(m) {
  const weight = Math.round(m.len * rand(.45, .8) + rand(0, 24));
  const value = Math.round(m.value * rand(.85, 1.3));
  return { id: m.id, name: m.name, weight, value, body: m.body, belly: m.belly, len: m.len };
}

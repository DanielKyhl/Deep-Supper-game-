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
    atk: ['lunge', 'slam', 'spit', 'slam'],
    flavour: 'There are planks in its belly. Painted ones. You know the colour.' },

  { id: 'cathedral', name: 'Cathedral Ray', depth: 4, plan: 'ray',
    hp: 700, len: 440, girth: .28, value: 780, dmg: 2, speed: 134, eyes: 3,
    body: [46, 56, 92], belly: [140, 152, 200], fin: [30, 38, 66], eye: '#ffe9a8', glow: '#8fa8ff',
    atk: ['lunge', 'slam', 'spit', 'lunge', 'slam'],
    flavour: 'It passes over you slowly, the way weather does.' },

  { id: 'penance', name: 'Nine-Eyed Penance', depth: 4, plan: 'maw',
    hp: 780, len: 360, girth: .46, value: 850, dmg: 3, speed: 128, eyes: 9,
    body: [88, 48, 62], belly: [198, 150, 160], fin: [58, 30, 42], eye: '#ffd257', glow: '#ff7a5a',
    atk: ['lunge', 'slam', 'spit', 'slam', 'lunge'],
    flavour: 'Nine eyes and all of them apologetic. That is somehow worse.' },

  { id: 'choir', name: 'The Drowned Choir', depth: 4, plan: 'bloom',
    hp: 660, len: 400, girth: .50, value: 820, dmg: 2, speed: 118, eyes: 12,
    body: [70, 84, 118], belly: [186, 200, 226], fin: [48, 58, 86], eye: '#e8f4ff', glow: '#a8d8ff',
    atk: ['spit', 'spit', 'slam', 'lunge', 'spit'],
    flavour: 'Every face in it is roughly the same face, and it is nearly yours.' },

  /* -------------------------------- boss ------------------------------- */

  { id: 'leviathan', name: 'The Old One', depth: 4, boss: true, plan: 'leviathan',
    hp: 2400, len: 560, girth: .30, value: 2600, dmg: 3, speed: 140, eyes: 7,
    body: [38, 44, 78], belly: [128, 140, 186], fin: [24, 28, 54], eye: '#ff4d4d', glow: '#ff4d4d',
    atk: ['lunge', 'slam', 'spit', 'lunge', 'slam'],
    flavour: 'The sea went flat and quiet, the way a room does when you walk in.' }
];

const JUNK = [
  { name: 'a waterlogged boot', value: 4,  icon: 'boot' },
  { name: 'a knot of black kelp', value: 3, icon: 'kelp' },
  { name: 'an empty green bottle', value: 7, icon: 'bottle' },
  { name: 'half a ship\'s wheel', value: 11, icon: 'wheel' }
];

/* --------------------------- shop banter --------------------------------- */

const DORRAN_GREET = [
  "Evening. Boat's yours, sea's not.",
  "Anything with a face, I'll weigh it.",
  "Don't bleed on the counter, lad.",
  "Fresh? Fresh enough. Coin's coin.",
  "Your father sold me a tooth once. Still got it.",
  "I don't ask what it was. I ask what it weighs."
];
const DORRAN_SELL = [
  "Heavier than it looks.",
  "Someone'll eat this. Not me.",
  "Hm. Still twitching. Ten percent off.",
  "That's a good one. Don't let it go to your head.",
  "I'll take it before it wakes up."
];
const DORRAN_BUY = [
  "Mind the edge.",
  "Sold. No refunds, no reattachments.",
  "Use it before it uses you.",
  "Good choice. Grim, but good."
];

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

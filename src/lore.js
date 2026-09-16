'use strict';
/* ========================================================================
   lore.js — what the sea gives back: letters in bottles on the end of the
   line, and letters and relics lying in the dark below. Found once, kept
   in the journal, read on a page of their own.
   ======================================================================== */

/* where 'bottle': fished up, in this order, now and then
   where 'dive':   lying in the water at (x, y), found by swimming to it    */
const LORE = [
  { id: 'meg', kind: 'letter', where: 'bottle', title: 'A letter to Meg',
    from: 'Folded small into a medicine bottle',
    text: "Meg. There are lights under the boat again tonight. Not fish: windows. I let the lamp down on forty fathoms of line and something down there lifted one back. Tell nobody. They already think I'm mad. Tell the boys the Margaret is a good boat, and she always comes home. — T." },

  { id: 'ledger', kind: 'letter', where: 'bottle', title: 'A page from a ledger',
    from: 'Squid ink on kelp paper',
    text: "LANTHORNE, UPPER MARKET. The surface man, Tobias: two lamps of whale oil, for one bell-glass. Forty iron hooks, for a map of the upper halls. One wool coat (he says it is warm; nobody here knows what warm is), for three black pearls. Warden Ysolde says: no more maps." },

  { id: 'slate', kind: 'letter', where: 'bottle', title: 'A slate, sealed in wax',
    from: 'Scratched by a child',
    text: "To the people on top of the water. Is it true you breathe air ALL the time? Mother says the Brood are coming up the trench because something at the bottom is waking, and that is why we can't play in the outer halls any more. Please send a biscuit. Tobias says they are like bread, but happy. — Pell, age 9" },

  { id: 'whaler', kind: 'letter', where: 'bottle', title: "A whaler's warning",
    from: 'Corked with a scrap of sailcloth',
    text: "To any boat that finds this: do not put a line down east of the harbour at night. There is a thing there the length of a church. It has broken three boats and taken three harpoons, and it wears all three. We called it the Old One, because nothing young could be that angry. — The crew of the Constant, those of us left" },

  { id: 'iou', kind: 'letter', where: 'bottle', title: 'An IOU in a familiar hand',
    from: 'The bottle still smells of rum',
    text: "I, Dorran, owe my brother: one (1) rowing boat, one (1) mast, one (1) pair of oars, and an apology. The mast was already loose. The oars were already in the water. The apology is sincere. Signed, D. P.S. If found, do not return this to my brother." },

  { id: 'last', kind: 'letter', where: 'bottle', title: "Tobias's last letter",
    from: 'Wrapped in oilskin, twice',
    text: "Meg. I'm going down after it in the suit tomorrow. Ysolde says the Old One isn't the worst of it: there is a mother at the bottom of the trench, and that thing is only the first of her young. If I come back up, I'll stop. If I don't, keep the Margaret, keep her name on her, and don't let the boys fish deep water. Some of them won't listen. The best ones never do. — Tobias" },

  { id: 'tin', kind: 'letter', where: 'dive', x: 330, y: 900, title: 'A tin of hooks, and a note',
    from: 'Wedged in the rocks of the Shelf',
    text: "For the Lanthorne market, if the current is kind. Sixty good hooks, dry. I am out of coats. Ysolde, if you are reading this, you were right about the maps and I was wrong, and I will say so to your face next time I'm down, if you give me back my lamp. — T." },

  { id: 'log', kind: 'letter', where: 'dive', x: 900, y: 1884, title: "A warden's log, cut in shell",
    from: 'Lying on the ledge above the Drowned Halls',
    text: "Warden's log, outer halls. Day forty of the rising. The Brood came through the east door again; we lost two lamps and the old bridge. The surface man fought beside us with a harpoon that should not work underwater, and it did. He does not say a word while he fights. I am told his family are all like that. — Ysolde" },

  { id: 'order', kind: 'letter', where: 'dive', x: 4250, y: 3920, title: "Ysolde's last order",
    from: 'Nailed to a post outside the city, in a lead case',
    text: "By order of the Warden: the great gate stays shut. The surface man has gone down into the trench after the Mother's child, alone, against my word. If he comes back to the gate, open it. If something else comes back to the gate, do not. And if a boy comes one day wearing his helmet, let him in. I doubt he will need us to. — Y." },

  { id: 'watch', kind: 'relic', where: 'dive', x: 3950, y: 870, title: 'A brass pocket watch',
    from: 'Half buried in sand on the Shelf',
    text: "Stopped at twelve minutes past four. Engraved inside the lid: 'T. Keep time, and come home. M.' It is full of sand, and yet when you hold it to the glass of your helmet, you would swear it ticks." },

  { id: 'bellglass', kind: 'relic', where: 'dive', x: 4230, y: 1420, title: 'A bell-glass lens',
    from: 'Caught against the cliff in the Drop',
    text: "A thick lens of green glass from a Lanthorne street lamp. Held underwater it glows faintly all on its own, the way the whole city once did. Up on deck it will be just glass. Tobias traded two lamps of oil for one of these." },

  { id: 'eggcase', kind: 'relic', where: 'dive', x: 3820, y: 2985, title: 'An empty Brood egg-case',
    from: 'Among the pillars of the Drowned Halls',
    text: "Ribbed like a shell and as long as your arm. Something hatched out of it, not long ago. The inside is still warm, which nothing this deep has any business being." },

  { id: 'crown', kind: 'relic', where: 'dive', x: 700, y: 2520, title: 'The coral crown',
    from: 'In the throne room of the old city',
    text: "A circlet of white coral set with black pearls. Lanthorne has not had a king for two hundred years. It keeps a warden instead, because a warden can be told no." },

  { id: 'harpoonhead', kind: 'relic', where: 'dive', x: 520, y: 3935, title: 'A broken harpoon head',
    from: 'On the seabed, far from the gate',
    text: "Iron, barbed, snapped clean off its shaft. It matches the broken harpoon through the sleeve of your suit exactly. Whatever it went into, it went in deep, a long time ago. Something pulled it back out." }
];

function loreDef(id) { return LORE.find(l => l.id === id) || null; }

// the sea's own dice, for what turns up on a line, so luck never shifts what
// anything else in the game rolls
const SeaDice = {
  s: (Date.now() >>> 0) || 1,
  next() { this.s = (Math.imul(this.s ^ (this.s >>> 15), 2246822519) + 3266489917) >>> 0; return this.s / 4294967296; },
  chance(p) { return this.next() < p; }
};

// the rare and the odd, per cast
const EXCALIBUR_CHANCE = .01;
const BOTTLE_CHANCE = .06;

const Lore = {
  open: null,          // the page being read, or null
  t: 0,

  known(id) { return Player.lore.indexOf(id) >= 0; },
  count(kind) { return LORE.filter(l => (!kind || l.kind === kind) && this.known(l.id)).length; },
  total(kind) { return LORE.filter(l => !kind || l.kind === kind).length; },

  // the next letter a bottle can bring up, in order, or null when they are all found
  nextBottle() { return LORE.find(l => l.where === 'bottle' && !this.known(l.id)) || null; },
  // what still lies somewhere below
  unfound() { return LORE.filter(l => l.where === 'dive' && !this.known(l.id)); },

  // found for the first time: keep it and read it
  find(id) {
    if (!loreDef(id) || this.known(id)) return false;
    Player.lore.push(id);
    this.read(id);
    Sfx.buy();
    Game.autosave();
    return true;
  },
  read(id) {
    if (!loreDef(id)) return;
    this.open = id;
    this.t = 0;
    Sfx.select();
  },
  close() { this.open = null; Sfx.select(); },

  update(dt) {
    this.t += dt;
    if (this.t < .35) return;
    if (Input.tap('confirm') || Input.tap('interact') || Input.tap('cancel') || Input.mouse().click) this.close();
  },

  /* ------------------------------- the page ------------------------------ */

  draw(g) {
    const L = loreDef(this.open);
    if (!L) return;
    const a = clamp(this.t * 5, 0, 1);
    g.save();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(3,4,10,.72)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const relic = L.kind === 'relic';
    const w = 640, h = relic ? 420 : 440, x = snap(VIEW_W / 2 - w / 2), y = snap(VIEW_H / 2 - h / 2 + 6);
    const ink = relic ? '#e8e3d6' : '#3a2c22', faint = relic ? '#8d97b4' : '#7a6448';
    if (relic) {
      panel(g, x, y, w, h, { alpha: .98 });
    } else {
      // an old page: yellowed, foxed at the corners
      g.fillStyle = '#2a1e18'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
      g.fillStyle = '#e4d5b0'; g.fillRect(x, y, w, h);
      g.fillStyle = '#d6c49a';
      g.fillRect(x, y, w, 8); g.fillRect(x, y + h - 8, w, 8); g.fillRect(x, y, 8, h); g.fillRect(x + w - 8, y, 8, h);
    }
    let ty = y + 44;
    if (relic) {
      this.drawFind(g, L, x + w / 2, y + 70, 0, 3);
      ty = y + 150;
    }
    Text.draw(g, L.title, x + w / 2, ty, { size: 26, align: 'center', color: relic ? '#f2e2bd' : ink, font: 'Georgia, serif', weight: 'bold' });
    Text.draw(g, L.from, x + w / 2, ty + 26, { size: 14, align: 'center', color: faint, italic: true, font: 'Georgia, serif' });
    const opts = { size: 17, color: ink, font: 'Georgia, serif' };
    const lines = Text.wrap(g, L.text, w - 80, opts);
    for (let i = 0; i < lines.length; i++) Text.draw(g, lines[i], x + 40, ty + 64 + i * 24, opts);
    if (this.t > .35) {
      const n = Player.lore.length;
      Text.draw(g, n + ' of ' + LORE.length + ' found   ·   [E] put it away', x + w / 2, y + h - 16, {
        size: 13, align: 'center', color: faint, font: 'Verdana, sans-serif'
      });
    }
    g.restore();
  },

  /* ------------------------------ in the water ----------------------------- */

  // a find lying in the sea: a bottle for a letter, the thing itself for a relic,
  // with a slow gleam so it can be spotted. `scale` is in whole buffer pixels.
  drawFind(g, L, x, y, t, scale) {
    const pal = spritePalette('lore-' + L.id, LORE_COLORS[L.id] || LORE_COLORS.bottle);
    const art = L.kind === 'relic' ? RELIC_ART[L.id] : RELIC_ART.bottle;
    const bob = Math.round(Math.sin(t * 2 + L.x) * 1.5);
    const gleam = Math.floor(t * 6) % 12;
    Sprite.draw(g, 'lore:' + L.id + ':' + (scale || 1), gleam + '/' + bob, x, y + bob * PIX, {
      w: 28 * (scale || 1) + 8, h: 22 * (scale || 1) + 8, pal, paint: () => {
        art(gleam, scale || 1);
        // a faint gleam, so it can be spotted in the dark
        if ((scale || 1) === 1) Spr.emit.push({ x: 0, y: 0, r: 12, col: pal.glowCss, a: .12 + (gleam < 6 ? gleam : 12 - gleam) * .015 });
      }
    });
  },

  // swimming over a find picks it up
  pickups(D) {
    const p = D.p;
    for (const L of this.unfound()) {
      if (Math.hypot(p.x - L.x, p.y - L.y) < 54) { this.find(L.id); return L.id; }
    }
    return null;
  }
};

const LORE_COLORS = {
  bottle:      { BODY: '#3f7a5a', BELLY: '#9fd0b0', BONE: '#e8dcc0', WOOD: '#8a6a3c', WHITE: '#f4fff8', GLOW: '#bff0d8' },
  watch:       { METAL: '#c9a44c', BONE: '#efe6c8', DARK: '#2a2018', WHITE: '#fff6d0', GLOW: '#ffe9a8' },
  bellglass:   { BODY: '#3f9a7a', GLOW: '#9ff0c8', METAL: '#6a6a60', WHITE: '#e8fff4' },
  eggcase:     { SHELL: '#6a4a6a', BODY: '#4a3048', BELLY: '#a882a0', GLOW: '#d8a0ff', WHITE: '#ffe0ff' },
  crown:       { BONE: '#efe8e0', DARK: '#141018', METAL: '#8a8aa0', WHITE: '#ffffff', GLOW: '#dff0ff' },
  harpoonhead: { METAL: '#8a8f96', WOOD: '#6b4a2a', BONE: '#c4b49a', WHITE: '#eef4ff', GLOW: '#cfe8ff' }
};

// each find, drawn at the workbench: (0, 0) is its middle, `k` whole pixels per unit
const RELIC_ART = {
  bottle(gleam, k) {
    Spr.poly([[-6 * k, -2 * k], [4 * k, -3 * k], [6 * k, -1 * k], [6 * k, 2 * k], [4 * k, 3 * k], [-6 * k, 2 * k]], MAT.BODY, (x, y) => .45 - y / (6 * k) * .3);
    Spr.poly([[6 * k, -1 * k], [9 * k, -1 * k], [9 * k, 1 * k], [6 * k, 1 * k]], MAT.BODY, .6);
    Spr.poly([[9 * k, -1 * k], [11 * k, -1 * k], [11 * k, 1 * k], [9 * k, 1 * k]], MAT.WOOD, .5);
    Spr.poly([[-4 * k, -1 * k], [2 * k, -1 * k], [2 * k, 1 * k], [-4 * k, 1 * k]], MAT.BONE, .7);
    if (gleam < 2) Spr.plot(-2 * k, -2 * k, MAT.WHITE, 1);
  },
  watch(gleam, k) {
    Spr.blob(0, 0, 5 * k, 5 * k, MAT.METAL, {});
    Spr.blob(0, 0, 3.6 * k, 3.6 * k, MAT.BONE, { lit: .7 });
    Spr.stroke([[0, 0], [0, -2.6 * k]], .5 * k, .4, MAT.DARK, .1);
    Spr.stroke([[0, 0], [1.8 * k, .6 * k]], .5 * k, .4, MAT.DARK, .1);
    Spr.stroke([[0, -5 * k], [0, -7 * k], [2 * k, -8 * k], [5 * k, -7 * k]], .6 * k, .5, MAT.METAL, .7);
    if (gleam < 2) Spr.plot(-2 * k, -3 * k, MAT.WHITE, 1);
  },
  bellglass(gleam, k) {
    Spr.blob(0, 0, 5 * k, 6 * k, MAT.METAL, { lit: .35 });
    Spr.blob(0, 0, 4 * k, 5 * k, MAT.GLOW, { lit: .45 + (gleam < 6 ? gleam : 12 - gleam) * .05 });
    Spr.blob(-1 * k, -2 * k, 1.4 * k, 1.8 * k, MAT.WHITE, { lit: 1 });
    Spr.emit.push({ x: 0, y: 0, r: 7 * k, col: '#9ff0c8', a: .18 });
  },
  eggcase(gleam, k) {
    Spr.oval(0, 0, 9 * k, 4 * k, -.25, MAT.SHELL, { tex: (x, y, u) => Math.abs(Math.sin(u * 9)) < .2 ? -.2 : 0 });
    Spr.oval(-2 * k, .5 * k, 5 * k, 2 * k, -.25, MAT.BODY, { lit: .15 });
    Spr.stroke([[8 * k, -3 * k], [11 * k, -6 * k]], .8 * k, .4, MAT.SHELL, .5);
    Spr.stroke([[-8 * k, 3 * k], [-11 * k, 5 * k]], .8 * k, .4, MAT.SHELL, .4);
    if (gleam < 3) Spr.plot(1 * k, -2 * k, MAT.GLOW, .9);
  },
  crown(gleam, k) {
    Spr.poly([[-7 * k, 2 * k], [7 * k, 2 * k], [7 * k, -1 * k], [-7 * k, -1 * k]], MAT.BONE, .6);
    for (let i = 0; i < 5; i++) {
      const cx = (-6 + i * 3) * k;
      Spr.poly([[cx - 1 * k, -1 * k], [cx, -(4 + (i % 2) * 2) * k], [cx + 1 * k, -1 * k]], MAT.BONE, .75);
      Spr.blob(cx, .5 * k, .8 * k, .8 * k, MAT.DARK, { lit: .3 });
    }
    if (gleam < 2) Spr.plot(-3 * k, 0, MAT.WHITE, 1);
  },
  harpoonhead(gleam, k) {
    Spr.poly([[-7 * k, -1 * k], [3 * k, -1 * k], [8 * k, 0], [3 * k, 1 * k], [-7 * k, 1 * k]], MAT.METAL, .55);
    Spr.poly([[3 * k, -1 * k], [-1 * k, -5 * k], [0, -1 * k]], MAT.METAL, .7);
    Spr.poly([[3 * k, 1 * k], [-1 * k, 5 * k], [0, 1 * k]], MAT.METAL, .4);
    Spr.poly([[-9 * k, -1 * k], [-7 * k, -1 * k], [-7 * k, 1 * k], [-10 * k, 2 * k]], MAT.WOOD, .45);
    if (gleam < 2) Spr.plot(5 * k, 0, MAT.WHITE, 1);
  }
};

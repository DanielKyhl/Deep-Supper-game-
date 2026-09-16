'use strict';
/* ========================================================================
   bestiary.js — every creature in this sea, drawn and noted as he meets it.

   A creature is met once he has killed one, and studied once he has killed
   STUDY_KILLS: after that he knows where to hit it, and does, harder. The
   heaviest of each he has landed is kept as its record. The book is in
   chapters, four up the line and four below; filling a chapter pays (the
   town museum buys the drawings, and Dorran takes a cut), and filling the
   whole book is worth more on every catch he sells from then on.
   ======================================================================== */

const STUDY_KILLS = 5;         // kills to know a creature's weak places
const STUDY_EDGE = 1.15;       // how much harder he hits what he has studied
const NOTES_BONUS = 1.15;      // every catch is worth this much more once the book is full

const BESTIARY_CHAPTERS = [
  { id: 'depth1', title: 'Near the Surface', where: 'on the line, depth 1', reward: 200, list: () => MONSTERS.filter(m => m.depth === 1 && !m.boss) },
  { id: 'depth2', title: 'Under the Swell', where: 'on the line, depth 2', reward: 500, list: () => MONSTERS.filter(m => m.depth === 2 && !m.boss) },
  { id: 'depth3', title: 'Where the Light Gives Up', where: 'on the line, depth 3', reward: 1100, list: () => MONSTERS.filter(m => m.depth === 3 && !m.boss) },
  { id: 'depth4', title: 'The Deep Line', where: 'on the line, depth 4', reward: 2600, list: () => MONSTERS.filter(m => m.depth === 4) },
  { id: 'shelf', title: 'The Shelf', where: 'swimming, the Shelf', reward: 1200, list: () => DIVE_MONSTERS.filter(m => m.zone === 1) },
  { id: 'drop', title: 'The Drop', where: 'swimming, the Drop', reward: 2600, list: () => DIVE_MONSTERS.filter(m => m.zone === 2) },
  { id: 'halls', title: 'The Drowned Halls', where: 'swimming, the Drowned Halls', reward: 5000, list: () => DIVE_MONSTERS.filter(m => m.zone === 3) },
  { id: 'lanthorne', title: 'Lanthorne', where: 'swimming, before the gate', reward: 9000, list: () => DIVE_MONSTERS.filter(m => m.zone === 4) }
];

// what it does that nothing else does, and what to do about it
const BESTIARY_NOTES = {
  deck: {
    eel: 'Springs over you in an arc and lashes down behind. Roll under it.',
    angler: 'Its lure flares in your eyes, then it lunges for where you stood. Move before the glare.',
    tentacle: 'Arms burst up through the boards where you are standing. Keep walking.',
    crustacean: 'Tucks into its shell and bowls across the deck, twice. Jump it.',
    bloom: 'Lets down curtains of stingers with one gap between them. They poison.',
    ray: 'Goes up out of sight, and its shadow finds you. Be somewhere else when the shadow stops.',
    maw: 'Breathes in the whole deck. Walk against it, or roll.',
    husk: 'Flings bone splinters that stick in the boards. Mind where you stand.',
    leviathan: 'Parry the jaw as the ring closes. Keep your feet when it breaches. Pull free when it drags you.'
  },
  dive: {
    eel: 'Three quick darts, each from a new angle. Dash after the third.',
    angler: 'Its lure pulls you toward the teeth. Swim away from the light.',
    tentacle: 'Sprays ink that clouds your glass and slows you to a crawl.',
    crustacean: 'Snaps a claw and fires a shock of bubbles straight at you.',
    bloom: 'Pulses a ring of stinging force. It poisons; a bandage draws it out.',
    ray: 'Glides wide and curves back through you. Watch where the curve closes.',
    maw: 'Sucks you toward its mouth, then bites.',
    husk: 'Fires a fan of bone shards.',
    mother: 'Shoot her eye as the ring closes. Swim against the whirlpool. Slip the coils.'
  }
};

const Bestiary = {
  book: null,          // the open book: { chapter, sel, page, t }, or null
  _fits: new Map(),

  chapters() { return BESTIARY_CHAPTERS; },
  all() { return BESTIARY_CHAPTERS.flatMap(c => c.list()); },
  chapterOf(def) { return BESTIARY_CHAPTERS.find(c => c.list().indexOf(def) >= 0) || null; },

  kills(def) {
    const n = Player.kills[def.id] || 0;
    if (n) return n;
    // the two bosses count as met by beating them, even in saves that never counted it
    return (def.id === 'leviathan' && Player.beatBoss) || (def.id === 'mother' && Player.beatMother) ? 1 : 0;
  },
  met(def) { return this.kills(def) > 0; },
  studied(def) { return this.kills(def) >= (def.boss ? 1 : STUDY_KILLS); },
  // how much harder he hits it
  edge(def) { return def && this.studied(def) ? STUDY_EDGE : 1; },
  record(def) { return (Player.records && Player.records[def.id]) || 0; },
  note(def) { return BESTIARY_NOTES[def.zone ? 'dive' : 'deck'][def.plan] || ''; },

  count() { return this.all().filter(d => this.met(d)).length; },
  total() { return this.all().length; },
  chapterDone(c) { return c.list().every(d => this.met(d)); },
  complete() { return BESTIARY_CHAPTERS.every(c => this.chapterDone(c)); },
  // what every catch is worth, once the whole book is filled in
  valueBonus() { return this.complete() ? NOTES_BONUS : 1; },

  // a catch landed: the heaviest of each kind is kept. Returns 'first', 'record' or null
  landed(trophy) {
    if (!trophy || !trophy.id) return null;
    Player.records = Player.records || {};
    const old = Player.records[trophy.id] || 0;
    if (trophy.weight <= old) return null;
    Player.records[trophy.id] = trophy.weight;
    if (old === 0) return 'first';
    Game.toast('New record: ' + trophy.name + ', ' + trophy.weight + ' lb (was ' + old + ')');
    Sfx.coin();
    if (typeof Achievements !== 'undefined') Achievements.event('record');
    return 'record';
  },

  // pay for every chapter just filled in; returns the chapters paid for
  settle() {
    Player.chapters = Player.chapters || [];
    const paid = [];
    for (const c of BESTIARY_CHAPTERS) {
      if (Player.chapters.indexOf(c.id) >= 0 || !this.chapterDone(c)) continue;
      Player.chapters.push(c.id);
      Player.coins += c.reward;
      paid.push(c);
    }
    if (paid.length) {
      const c = paid[paid.length - 1];
      Game.toast('Bestiary: ' + c.title + ' filled in. The museum pays ' + paid.reduce((a, p) => a + p.reward, 0) + '§' +
        (this.complete() ? '. The book is full: every catch sells for more.' : '.'));
      Sfx.buy();
    }
    return paid;
  },

  /* -------------------------------- the book ------------------------------ */

  open() {
    this.book = { chapter: 0, sel: 0, page: false, t: 0 };
    Sfx.select();
  },
  close() { this.book = null; Sfx.select(); },

  update(dt) {
    const B = this.book;
    if (!B) return;
    B.t += dt;
    const list = BESTIARY_CHAPTERS[B.chapter].list();
    const mouse = Input.mouse();
    if (B.page) {
      if (Input.tap('cancel') || Input.tap('confirm') || Input.tap('interact') || mouse.click) { B.page = false; Sfx.select(); }
      else if (Input.tap('menuUp') || Input.tap('menuLeft')) { B.sel = (B.sel + list.length - 1) % list.length; Sfx.select(); }
      else if (Input.tap('menuDown') || Input.tap('menuRight')) { B.sel = (B.sel + 1) % list.length; Sfx.select(); }
      return;
    }
    if (Input.tap('cancel')) { this.close(); return; }
    if (Input.tap('menuLeft')) this.turn(-1);
    if (Input.tap('menuRight')) this.turn(1);
    if (Input.tap('menuUp')) { B.sel = (B.sel + list.length - 1) % list.length; Sfx.select(); }
    if (Input.tap('menuDown')) { B.sel = (B.sel + 1) % list.length; Sfx.select(); }
    if (Input.tap('confirm') || Input.tap('interact')) { B.page = true; Sfx.select(); }
    if (mouse.click && this.hits) {
      const hit = this.hits.find(r => mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h);
      if (hit && hit.turn) this.turn(hit.turn);
      else if (hit) { B.sel = hit.index; B.page = true; Sfx.select(); }
    }
  },

  turn(dir) {
    const B = this.book;
    B.chapter = (B.chapter + BESTIARY_CHAPTERS.length + dir) % BESTIARY_CHAPTERS.length;
    B.sel = 0;
    Sfx.select();
  },

  // a creature posed to fit a box, measured once
  pose(def, w, h, seed) {
    const key = def.id + '/' + w + 'x' + h;
    let len = this._fits.get(key);
    if (len === undefined) {
      const probe = { x: 0, y: 0, face: 1, rot: 0, len: 100, def, gape: .3, flash: 0, seed, thrashAmt: 1 };
      const [mw, mh] = Beast.measure(probe);
      len = mw > 0 && mh > 0 ? Math.max(24, Math.min(def.len, Math.round(100 * Math.min(w / mw, h / mh)))) : Math.min(def.len, 100);
      this._fits.set(key, len);
    }
    return { x: 0, y: 0, face: 1, rot: 0, len, def, gape: .3, flash: 0, seed, thrashAmt: 1, noShadow: true };
  },

  draw(g) {
    const B = this.book;
    if (!B) return;
    const t = Game.t;
    this.hits = [];
    g.save();
    g.globalAlpha = clamp(B.t * 6, 0, 1);
    g.fillStyle = 'rgba(3,4,10,.86)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const X = 90, Y = 34, W = VIEW_W - 180, H = VIEW_H - 68;
    // nothing from the pause menu underneath should show through the page
    g.fillStyle = '#0b0e18';
    g.fillRect(X, Y, W, H);
    panel(g, X, Y, W, H, { alpha: 1 });
    const c = BESTIARY_CHAPTERS[B.chapter], list = c.list();
    const serif = 'Georgia, serif', sans = 'Verdana, sans-serif';

    // the chapter, turned with the arrows
    Text.draw(g, 'BESTIARY', VIEW_W / 2, Y + 36, { size: 26, align: 'center', color: '#f2e2bd' });
    Text.draw(g, '‹', X + 40, Y + 76, { size: 28, align: 'center', color: '#c8a45c' });
    Text.draw(g, '›', X + W - 40, Y + 76, { size: 28, align: 'center', color: '#c8a45c' });
    this.hits.push({ x: X + 16, y: Y + 50, w: 50, h: 40, turn: -1 }, { x: X + W - 66, y: Y + 50, w: 50, h: 40, turn: 1 });
    Text.draw(g, c.title, VIEW_W / 2, Y + 72, { size: 22, align: 'center', color: '#e8e3d6', font: serif, weight: 'bold' });
    const met = list.filter(d => this.met(d)).length, done = Player.chapters && Player.chapters.indexOf(c.id) >= 0;
    Text.draw(g, (B.chapter + 1) + ' of ' + BESTIARY_CHAPTERS.length + '  ·  ' + c.where + '  ·  ' + met + ' of ' + list.length + ' met  ·  ' +
      (done ? 'paid ' + c.reward + '§' : 'fill it in: ' + c.reward + '§'), VIEW_W / 2, Y + 94, { size: 13, align: 'center', color: done ? '#8ce0a4' : '#8d97b4', font: sans });

    if (!B.page) {
      // the chapter's creatures, one row each
      const rowH = Math.min(62, Math.floor((H - 150) / list.length));
      list.forEach((d, i) => {
        const ry = Y + 112 + i * rowH, on = i === B.sel, seen = this.met(d);
        if (on) { g.fillStyle = 'rgba(200,164,92,.16)'; g.fillRect(X + 24, ry, W - 48, rowH - 4); g.fillStyle = '#e8c76a'; g.fillRect(X + 24, ry, 4, rowH - 4); }
        this.hits.push({ x: X + 24, y: ry, w: W - 48, h: rowH - 4, index: i });
        if (seen) {
          const pose = this.pose(d, 110, rowH - 10, 60 + i);
          pose.x = X + 110; pose.y = ry + rowH / 2 - 2;
          Art.monster(g, pose, t);
        } else Text.draw(g, '?', X + 110, ry + rowH / 2 + 10, { size: 28, align: 'center', color: '#4a526a' });
        Text.draw(g, seen ? d.name : '???', X + 200, ry + rowH / 2 - 2, { size: 18, color: seen ? (on ? '#f6e9c6' : '#d8d0bc') : '#5a6380', font: serif });
        if (seen) {
          const kills = this.kills(d), studied = this.studied(d);
          Text.draw(g, (studied ? 'studied' : kills + ' of ' + STUDY_KILLS + ' to study') + '  ·  ' + kills + ' killed' +
            (this.record(d) ? '  ·  record ' + this.record(d) + ' lb' : ''), X + 200, ry + rowH / 2 + 18, { size: 12, color: studied ? '#8ce0a4' : '#8d97b4', font: sans });
        }
      });
      Text.draw(g, '← → chapter     ↑↓ choose     ENTER read     ESC close', VIEW_W / 2, Y + H - 14, { size: 13, align: 'center', color: 'rgba(160,172,200,.7)', font: sans });
    } else {
      // one creature's page
      const d = list[B.sel], seen = this.met(d);
      g.fillStyle = 'rgba(8,10,18,.6)';
      g.fillRect(X + 30, Y + 116, 330, 250);
      if (seen) {
        const pose = this.pose(d, 300, 220, 91);
        pose.x = X + 195; pose.y = Y + 241;
        Art.monster(g, pose, t);
      } else Text.draw(g, '?', X + 195, Y + 262, { size: 80, align: 'center', color: '#3a4258' });
      const tx = X + 390, tw = W - 420;
      Text.draw(g, seen ? d.name : '???', tx, Y + 140, { size: 26, color: '#f2e2bd', font: serif, weight: 'bold' });
      Text.draw(g, 'Found ' + c.where, tx, Y + 164, { size: 14, color: '#8d97b4', italic: true, font: serif });
      let ty = Y + 196;
      const para = (text, o) => {
        for (const ln of Text.wrap(g, text, tw, o)) { Text.draw(g, ln, tx, ty, o); ty += 24; }
        ty += 8;
      };
      if (seen) {
        para(d.flavour, { size: 16, color: '#d8d0bc', font: serif, italic: true });
        para(this.note(d), { size: 15, color: '#c4cbe0', font: serif });
        const kills = this.kills(d);
        Text.draw(g, kills + ' killed' + (this.record(d) ? '   ·   heaviest landed: ' + this.record(d) + ' lb' : ''), tx, ty + 6, { size: 14, color: '#e8e3d6', font: sans });
        ty += 30;
        if (this.studied(d)) Text.draw(g, 'Studied: you hit it ' + Math.round((STUDY_EDGE - 1) * 100) + '% harder.', tx, ty + 6, { size: 14, color: '#8ce0a4', font: sans });
        else {
          const need = d.boss ? 1 : STUDY_KILLS;
          Text.draw(g, 'Kill ' + (need - kills) + ' more to study it.', tx, ty + 6, { size: 14, color: '#8d97b4', font: sans });
          for (let i = 0; i < need; i++) {
            g.fillStyle = i < kills ? '#c8a45c' : 'rgba(120,132,164,.3)';
            g.fillRect(tx + i * 22, ty + 18, 16, 6);
          }
        }
      } else {
        para('Nothing he has met yet. Something lives ' + c.where.replace(/^on the line, /, 'on the line at ').replace(/^swimming, /, 'in ') + '.', { size: 16, color: '#8d97b4', font: serif, italic: true });
      }
      Text.draw(g, '↑↓ next     ENTER / ESC back to the chapter', VIEW_W / 2, Y + H - 14, { size: 13, align: 'center', color: 'rgba(160,172,200,.7)', font: sans });
    }
    Text.draw(g, this.count() + ' of ' + this.total() + ' met' + (this.complete() ? '  ·  the book is full: catches sell for ' + Math.round((NOTES_BONUS - 1) * 100) + '% more' : ''),
      X + W - 24, Y + 36, { size: 12, align: 'right', color: this.complete() ? '#8ce0a4' : '#6f7892', font: sans });
    g.restore();
  }
};

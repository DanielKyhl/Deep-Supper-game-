'use strict';
/* ========================================================================
   achievements.js — things worth a small trophy.

   Achievements belong to whoever plays on this computer, not to a voyage:
   they are kept apart from the saves, and a new voyage or a load never takes
   one away. Most are noticed by looking at how things stand (checked once a
   second); the rest are told when they happen, through event(). Every id is
   fixed, so a storefront's achievements can be matched to these one to one:
   onUnlock() is the hook for that.
   ======================================================================== */

const ACHIEVEMENTS_KEY = 'deepsupper.achievements.v1';

const ACHIEVEMENTS = [
  { id: 'first_catch', name: "Supper's On", desc: 'Land your first catch.', check: () => Player.totalKills >= 1 },
  { id: 'first_sale', name: 'Honest Work', desc: 'Sell something to Dorran.', check: () => Player.sold >= 1 },
  { id: 'old_one', name: 'It Remembers Your Father', desc: 'Beat the Old One.', check: () => Player.beatBoss },
  { id: 'mother', name: 'Back in the Trench', desc: 'Put the Mother back in her trench.', check: () => Player.beatMother },
  { id: 'ending', name: 'Not One Word', desc: 'Sail home.', check: () => Player.sawEnding },
  { id: 'excalibur', name: 'Not a Stone', desc: 'Pull Excalibur out of the sea.', check: () => Player.excalibur },
  { id: 'letters', name: 'Correspondence', desc: 'Find every letter.', check: () => Lore.count('letter') >= Lore.total('letter') },
  { id: 'relics', name: 'Curator', desc: 'Find every relic.', check: () => Lore.count('relic') >= Lore.total('relic') },
  { id: 'bestiary_above', name: 'Field Guide: Above', desc: 'Meet everything that comes up on the line.', check: () => BESTIARY_CHAPTERS.slice(0, 4).every(c => Bestiary.chapterDone(c)) },
  { id: 'bestiary_below', name: 'Field Guide: Below', desc: 'Meet everything that lives below.', check: () => BESTIARY_CHAPTERS.slice(4).every(c => Bestiary.chapterDone(c)) },
  { id: 'studied', name: 'Know Thy Enemy', desc: 'Study every creature in the sea.', check: () => Bestiary.all().every(d => Bestiary.studied(d)) },
  { id: 'record', name: "The One That Didn't Get Away", desc: 'Beat your own record for a catch.' },
  { id: 'heavy_catch', name: 'Four Hundred Pounds', desc: 'Land a catch that weighs 400 lb or more.', check: () => Object.values(Player.records || {}).some(w => w >= 400) },
  { id: 'kills100', name: 'Deckhand', desc: 'Kill a hundred things.', check: () => Player.totalKills >= 100 },
  { id: 'rich', name: 'Deep Pockets', desc: 'Have 10,000§ at once.', check: () => Player.coins >= 10000 },
  { id: 'salvage', name: 'Scuppered', desc: "Pay Dorran's salvage fee." },
  { id: 'parry', name: 'Parry the Jaw', desc: "Parry the Old One's jaw." },
  { id: 'flawless', name: 'Not a Scratch', desc: 'Beat the Old One without losing a heart.' },
  { id: 'windup', name: 'Wind Up', desc: 'Finish a creature with a heavy blow.' },
  { id: 'bleedout', name: 'A Thousand Little Cuts', desc: 'Let something bleed to death.' },
  { id: 'poisoned', name: 'Should Have Worn Gloves', desc: 'Get stung and poisoned.' },
  { id: 'rods', name: 'Line to the Bottom', desc: 'Own the Abyssal Rod.', check: () => Player.rod >= RODS.length - 1 },
  { id: 'tooth', name: 'Tooth and Nail', desc: "Own Leviathan's Tooth.", check: () => Player.weapon >= WEAPONS.length - 1 },
  { id: 'trench', name: 'Built for the Bottom', desc: 'Own the Trench Hardsuit.', check: () => Player.suit >= SUITS.length - 1 },
  { id: 'bell', name: 'Ring the Bell', desc: 'Own the Sunken Bell.', check: () => Player.diveWeapon >= DIVE_WEAPONS.length - 1 },
  { id: 'lockets', name: 'Full Locket', desc: 'Buy every Heart Locket.', check: () => Player.lockets >= GOODS.find(x => x.type === 'maxhp').max },
  { id: 'weathered', name: 'Weathered', desc: 'Land a catch in a storm.' },
  { id: 'fine', name: 'Cutting It Fine', desc: 'Climb back aboard with less than three seconds of air.' },
  { id: 'something_big', name: 'Something Big', desc: 'See what the lightning shows.', hidden: true },
  { id: 'omens', name: 'Things in the Dark', desc: 'Notice five strange things at night.', hidden: true, check: () => (Player.omens || 0) >= 5 },
  { id: 'complete', name: 'Deep Supper', desc: 'Earn every other achievement.', check: () => ACHIEVEMENTS.every(a => a.id === 'complete' || Achievements.has(a.id)) }
];

// what happened, and which achievement it earns
const ACHIEVEMENT_EVENTS = {
  record: 'record', salvage: 'salvage', parry: 'parry', flawless: 'flawless', heavyKill: 'windup',
  bleedKill: 'bleedout', poisoned: 'poisoned', stormCatch: 'weathered', fine: 'fine', silhouette: 'something_big', omen: null
};

const Achievements = {
  got: null,           // id -> when it was earned
  queue: [],           // ones still to show, oldest first
  toast: null,         // the one on screen: { def, t }
  book: null,          // the list, while it is open
  listeners: [],
  _checkT: 0,

  load() {
    const raw = Store.readJSON(ACHIEVEMENTS_KEY);
    this.got = {};
    if (raw && raw.got && typeof raw.got === 'object') {
      for (const a of ACHIEVEMENTS) if (typeof raw.got[a.id] === 'number') this.got[a.id] = raw.got[a.id];
    }
    return this.got;
  },
  save() { Store.set(ACHIEVEMENTS_KEY, JSON.stringify({ got: this.got })); },

  def(id) { return ACHIEVEMENTS.find(a => a.id === id) || null; },
  has(id) { if (!this.got) this.load(); return !!this.got[id]; },
  count() { if (!this.got) this.load(); return ACHIEVEMENTS.filter(a => this.got[a.id]).length; },
  total() { return ACHIEVEMENTS.length; },

  // earn one; true if it is new. A voyage begun from a test shortcut earns nothing
  unlock(id) {
    const def = this.def(id);
    if (!def || this.has(id) || Player.shortcut) return false;
    this.got[id] = Date.now();
    this.save();
    this.queue.push(def);
    Sfx.landed();
    for (const fn of this.listeners) { try { fn(def); } catch (e) { /* a storefront's problem, not the game's */ } }
    return true;
  },
  // a storefront (or anything else) that wants to know as each one is earned
  onUnlock(fn) { this.listeners.push(fn); },

  // something happened that is worth one
  event(name) {
    const id = ACHIEVEMENT_EVENTS[name];
    if (id) this.unlock(id);
    this.check();
  },

  // look at how things stand and earn whatever that is worth
  check() {
    if (!this.got) this.load();
    let any = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const a of ACHIEVEMENTS) {
        if (!a.check || this.got[a.id]) continue;
        let ok = false;
        try { ok = !!a.check(); } catch (e) { ok = false; }
        if (ok && this.unlock(a.id)) any = true;
      }
    }
    return any;
  },

  update(dt) {
    this._checkT -= dt;
    if (this._checkT <= 0 && Game.state !== 'menu') { this._checkT = 1; this.check(); }
    if (!this.toast && this.queue.length) this.toast = { def: this.queue.shift(), t: 0 };
    if (this.toast) {
      this.toast.t += dt;
      if (this.toast.t > 4) this.toast = null;
    }
  },

  /* ----------------------------- the trophy card ---------------------------- */

  // a small gold cup, in pixels; grey when not yet earned
  drawCup(g, x, y, on) {
    const u = PIX;
    g.fillStyle = on ? '#6a4a14' : '#2a2e3a';
    g.fillRect(x - u * 5, y - u * 6, u * 10, u * 6);
    g.fillRect(x - u * 7, y - u * 5, u * 2, u * 3); g.fillRect(x + u * 5, y - u * 5, u * 2, u * 3);
    g.fillRect(x - u, y, u * 2, u * 3); g.fillRect(x - u * 4, y + u * 3, u * 8, u * 2);
    g.fillStyle = on ? '#e8b64a' : '#4a5064';
    g.fillRect(x - u * 4, y - u * 5, u * 8, u * 4);
    g.fillRect(x - u * 3, y + u * 3, u * 6, u);
    g.fillStyle = on ? '#fff0b0' : '#6a7088';
    g.fillRect(x - u * 3, y - u * 5, u * 2, u);
  },

  drawToast(g) {
    const T = this.toast;
    if (!T) return;
    const w = 330, h = 62;
    const slide = T.t < .3 ? easeOut(T.t / .3) : T.t > 3.6 ? 1 - (T.t - 3.6) / .4 : 1;
    // below the gear names in the corner, so it never covers what he is holding
    const x = snap(VIEW_W - 16 - w * slide), y = 72;
    panel(g, x, y, w, h, { alpha: .96 });
    this.drawCup(g, x + 34, y + 34, true);
    Text.draw(g, 'ACHIEVEMENT', x + 64, y + 22, { size: 11, color: '#c8a45c', weight: 'bold', font: 'Verdana, sans-serif' });
    Text.draw(g, T.def.name, x + 64, y + 46, { size: 18, color: '#f2e2bd', font: 'Georgia, serif' });
  },

  /* -------------------------------- the list ------------------------------- */

  PER_PAGE: 10,
  CARD_TEXT: 322,      // how wide a card's description may run, per line
  open() { this.book = { page: 0, t: 0 }; if (!this.got) this.load(); Sfx.select(); },
  close() { this.book = null; Sfx.select(); },
  pages() { return Math.ceil(ACHIEVEMENTS.length / this.PER_PAGE); },

  updateBook(dt) {
    const B = this.book;
    if (!B) return;
    B.t += dt;
    if (Input.tap('cancel') || Input.tap('confirm') || Input.tap('interact')) { this.close(); return; }
    if (Input.tap('menuRight') || Input.tap('menuDown')) { B.page = (B.page + 1) % this.pages(); Sfx.select(); }
    if (Input.tap('menuLeft') || Input.tap('menuUp')) { B.page = (B.page + this.pages() - 1) % this.pages(); Sfx.select(); }
    if (Input.mouse().click) { B.page = (B.page + 1) % this.pages(); Sfx.select(); }
  },

  drawBook(g) {
    const B = this.book;
    if (!B) return;
    const serif = 'Georgia, serif', sans = 'Verdana, sans-serif';
    g.save();
    g.fillStyle = 'rgba(3,4,10,.86)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const X = 60, Y = 34, W = VIEW_W - 120, H = VIEW_H - 68;
    g.fillStyle = '#0b0e18';
    g.fillRect(X, Y, W, H);
    panel(g, X, Y, W, H, { alpha: 1 });
    Text.draw(g, 'ACHIEVEMENTS', VIEW_W / 2, Y + 38, { size: 26, align: 'center', color: '#f2e2bd' });
    Text.draw(g, this.count() + ' of ' + this.total() + ' earned  ·  page ' + (B.page + 1) + ' of ' + this.pages(), VIEW_W / 2, Y + 62, { size: 13, align: 'center', color: '#8d97b4', font: sans });
    const list = ACHIEVEMENTS.slice(B.page * this.PER_PAGE, (B.page + 1) * this.PER_PAGE);
    const colW = (W - 60) / 2, rowH = 72;
    list.forEach((a, i) => {
      const on = this.has(a.id), secret = a.hidden && !on;
      const cx = X + 30 + (i % 2) * colW, cy = Y + 84 + Math.floor(i / 2) * rowH;
      g.fillStyle = on ? 'rgba(200,164,92,.1)' : 'rgba(120,132,164,.06)';
      g.fillRect(cx, cy, colW - 14, rowH - 6);
      this.drawCup(g, cx + 26, cy + 28, on);
      Text.draw(g, secret ? '???' : a.name, cx + 54, cy + 22, { size: 16, color: on ? '#f2e2bd' : '#9aa7c4', font: serif });
      const o = { size: 12, color: on ? '#c8b894' : '#6f7892', font: sans };
      Text.wrap(g, secret ? 'Keep your eyes open.' : a.desc, this.CARD_TEXT, o).slice(0, 2).forEach((ln, k) => Text.draw(g, ln, cx + 54, cy + 40 + k * 15, o));
    });
    Text.draw(g, '← → page     ESC close', VIEW_W / 2, Y + H - 14, { size: 13, align: 'center', color: 'rgba(160,172,200,.7)', font: sans });
    g.restore();
  }
};

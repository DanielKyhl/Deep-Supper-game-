'use strict';
/* ========================================================================
   shop.js — Uncle Dorran weighs anything with a face, and calls it cod
   ======================================================================== */

const TABS = ['SELL', 'GEAR', 'GOODS'];

// Dorran's own dice, so his chatter never changes anything the sea does
const DorranDice = {
  s: 20260916,
  next() { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; }
};
// one of his lines, and not the one he has just said if he can help it
function dorranPick(list, not) {
  let i = Math.floor(DorranDice.next() * list.length);
  if (list.length > 1 && list[i] === not) i = (i + 1) % list.length;
  return list[i];
}
// fill a line in: an ordinary fish for {fish}, and whatever else he was handed
function dorranLine(s, vars) {
  const fish = dorranPick(DORRAN.fish);
  const out = s.replace(/\{(\w+)\}/g, (m, k) =>
    k === 'fish' ? fish : k === 'Fish' ? fish[0].toUpperCase() + fish.slice(1) :
    vars && vars[k] !== undefined ? String(vars[k]) : m);
  return out[0].toUpperCase() + out.slice(1);
}

const Shop = {
  tab: 0, sel: 0, line: '', lineT: 0, shown: 0, t: 0, flashRow: -1, flashT: 0,
  remarked: {},
  TALK_CPS: 38,        // how fast he gets his words out
  SILENCE: 15,         // how long he can stand nobody saying anything

  open() {
    Game.state = 'shop';
    this.tab = Player.catches.length ? 0 : 1;
    this.sel = 0;
    this.t = 0;
    this.say(this.greeting());
    Sfx.select();
  },

  // what he opens with: something he has only just noticed, or else how things are
  greeting() {
    const P = Player, R = this.remarked;
    const news = [['mother', P.beatMother], ['suit', P.suit >= 0], ['girl', P.girlMet], ['first', P.sold === 0 && P.catches.length > 0]];
    for (let i = 0; i < news.length; i++) {
      if (!news[i][1] || R[news[i][0]]) continue;
      // the newest thing drives out anything older he hadn't got round to mentioning
      for (let j = i; j < news.length; j++) R[news[j][0]] = true;
      return DORRAN.remark[news[i][0]];
    }
    return dorranPick(P.beatMother ? DORRAN.greetDone : P.suit >= 0 ? DORRAN.greetDiving : DORRAN.greet, this.line);
  },
  close() {
    Game.state = 'play';
    Sfx.select();
    Game.autosave();
  },
  say(s) { this.line = s; this.lineT = 0; this.shown = 0; },

  rows() {
    if (this.tab === 0) {
      const r = [];
      if (Player.catches.length > 1) {
        const total = Player.catches.reduce((a, c) => a + c.value, 0);
        r.push({ kind: 'all', name: 'Sell the whole haul', sub: Player.catches.length + ' things, none of them right', value: total });
      }
      for (let i = 0; i < Player.catches.length; i++) {
        const c = Player.catches[i];
        r.push({ kind: 'fish', idx: i, name: c.name, sub: c.weight + ' lb', value: c.value, body: c.body, belly: c.belly });
      }
      if (!r.length) r.push({ kind: 'none', name: 'Nothing to sell', sub: 'Catch something first. Anything.' });
      return r;
    }
    if (this.tab === 1 && Player.suit >= 0) {
      // after the Old One: suits and things to fight with underwater
      const r = [{ kind: 'head', name: 'SUITS' }];
      SUITS.forEach((s, i) => {
        r.push({
          kind: 'suit', idx: i, name: s.name, sub: s.desc, price: s.price,
          owned: i <= Player.suit, locked: i > Player.suit + 1,
          stat: 'depth ' + Math.round(s.depth / 50) + ' fm  ·  air ' + s.air + 's'
        });
      });
      r.push({ kind: 'head', name: 'ARMS' });
      DIVE_WEAPONS.forEach((w, i) => {
        r.push({
          kind: 'diveweapon', idx: i, name: w.name, sub: w.desc, price: w.price,
          owned: i <= Player.diveWeapon, locked: i > Player.diveWeapon + 1,
          stat: 'damage ' + w.dmg + '  ·  ' + FIRE_STYLES[w.style] + statusTags(w)
        });
      });
      return r;
    }
    if (this.tab === 1) {
      const r = [{ kind: 'head', name: 'RODS' }];
      RODS.forEach((rod, i) => {
        r.push({
          kind: 'rod', idx: i, name: rod.name, sub: rod.desc, price: rod.price,
          owned: i <= Player.rod, locked: i > Player.rod + 1,
          stat: 'depth ' + rod.depth + '  ·  grip ' + rod.bar
        });
      });
      r.push({ kind: 'head', name: 'ARMS' });
      WEAPONS.forEach((s, i) => {
        r.push({
          kind: 'weapon', idx: i, name: s.name, sub: s.desc, price: s.price,
          owned: i <= Player.weapon, locked: i > Player.weapon + 1,
          stat: 'damage ' + s.dmg + '  ·  ' + s.style + statusTags(s) + (s.heavy ? '  ·  heavy: ' + s.heavy.name.toLowerCase() : '')
        });
      });
      return r;
    }
    return GOODS.map(gd => {
      let owned = false, price = gd.price, sub = gd.desc;
      if (gd.type === 'consume') { owned = Player.bandages >= gd.max; sub = gd.desc + '   (' + Player.bandages + '/' + gd.max + ')'; }
      if (gd.type === 'maxhp') { owned = Player.lockets >= gd.max; price = Math.round(gd.price * Math.pow(gd.scale, Player.lockets)); sub = gd.desc + '   (' + Player.lockets + '/' + gd.max + ')'; }
      if (gd.type === 'lantern') owned = Player.lantern;
      if (gd.type === 'luck') owned = Player.luck;
      return { kind: 'good', id: gd.id, name: gd.name, sub, price, owned, def: gd };
    });
  },

  selectable(r) { return r.kind !== 'head' && r.kind !== 'none'; },

  firstSelectable() {
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) if (this.selectable(rows[i])) return i;
    return 0;
  },

  move(d) {
    const rows = this.rows();
    let i = this.sel;
    for (let k = 0; k < rows.length; k++) {
      i = (i + d + rows.length) % rows.length;
      if (this.selectable(rows[i])) break;
    }
    if (i !== this.sel) Sfx.select();
    this.sel = i;
  },

  update(dt) {
    this.t += dt; this.lineT += dt;
    this.flashT = Math.max(0, this.flashT - dt);

    // he gets his words out at his own pace, mumbling
    if (this.shown < this.line.length) {
      const before = Math.floor(this.shown / 3);
      this.shown = Math.min(this.line.length, this.shown + dt * this.TALK_CPS);
      if (Math.floor(this.shown / 3) > before) Sfx.mumble();
    }
    // and when nobody says anything back, which is always, he fills the silence
    if (this.lineT > this.SILENCE) this.say(dorranPick(DORRAN.mutter, this.line));

    if (Input.tap('cancel')) { this.close(); return; }
    if (Input.tap('menuLeft')) { this.tab = (this.tab + 2) % 3; this.sel = this.firstSelectable(); Sfx.select(); }
    if (Input.tap('menuRight')) { this.tab = (this.tab + 1) % 3; this.sel = this.firstSelectable(); Sfx.select(); }
    if (Input.tap('menuUp')) this.move(-1);
    if (Input.tap('menuDown')) this.move(1);

    if (Input.tap('confirm') || Input.tap('interact')) this.act();
  },

  act() {
    const rows = this.rows();
    const r = rows[this.sel];
    if (!r || !this.selectable(r)) { Sfx.deny(); return; }

    if (r.kind === 'all') {
      const total = Player.catches.reduce((a, c) => a + c.value, 0);
      const n = Player.catches.length;
      Player.coins += total;
      Player.sold += n;
      Player.catches.length = 0;
      Sfx.coin();
      this.say(dorranLine(dorranPick(DORRAN.sellAll), { total }));
      Floaters.add(VIEW_W / 2, 250, '+' + total + '§', { color: '#f0cf8a', size: 34, fixed: true, life: 1.4 });
      this.sel = 0;
      return;
    }
    if (r.kind === 'fish') {
      const c = Player.catches[r.idx];
      Player.coins += c.value;
      Player.sold++;
      Player.catches.splice(r.idx, 1);
      Sfx.coin();
      this.say(dorranLine(dorranPick(c.value >= 600 ? DORRAN.sellBig : DORRAN.sell, this.line), { name: c.name, value: c.value }));
      Floaters.add(VIEW_W / 2, 250, '+' + c.value + '§', { color: '#f0cf8a', size: 28, fixed: true, life: 1.2 });
      this.sel = Math.min(Math.max(0, this.sel), Math.max(0, this.rows().length - 1));
      if (!this.selectable(this.rows()[this.sel])) this.sel = this.firstSelectable();
      return;
    }
    if (r.kind === 'none') { Sfx.deny(); return; }

    // buying
    if (r.owned) { Sfx.deny(); this.say(dorranPick(DORRAN.owned)); this.flash(); return; }
    if (r.locked) { Sfx.deny(); this.say(dorranPick(DORRAN.locked)); this.flash(); return; }
    if (Player.coins < r.price) {
      Sfx.deny();
      this.say(dorranLine(dorranPick(DORRAN.poor), { short: r.price - Player.coins }));
      this.flash();
      return;
    }

    Player.coins -= r.price;
    Sfx.buy();
    this.flash(true);

    if (r.kind === 'rod') {
      Player.rod = Math.max(Player.rod, r.idx);
    } else if (r.kind === 'weapon') {
      Player.weapon = Math.max(Player.weapon, r.idx);
    } else if (r.kind === 'suit') {
      Player.suit = Math.max(Player.suit, r.idx);
    } else if (r.kind === 'diveweapon') {
      Player.diveWeapon = Math.max(Player.diveWeapon, r.idx);
    } else {
      const gd = r.def;
      if (gd.type === 'consume') Player.bandages++;
      if (gd.type === 'maxhp') { Player.lockets++; Player.maxHp++; Player.hp++; }
      if (gd.type === 'lantern') Player.lantern = true;
      if (gd.type === 'luck') Player.luck = true;
    }
    this.say(dorranPick(DORRAN.buy[r.kind === 'good' ? r.def.type : r.kind]));
  },

  flash(good) { this.flashRow = this.sel; this.flashT = .4; this.flashGood = !!good; },

  /* ------------------------------- drawing ----------------------------- */

  draw(g) {
    g.fillStyle = 'rgba(4,6,14,.68)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const X = 92, Y = 42, W = VIEW_W - 184, H = 456;
    panel(g, X, Y, W, H, { alpha: .97 });

    // header
    Text.draw(g, 'DORRAN’S STALL', X + 26, Y + 40, {
      size: 26, color: '#f2e2bd', weight: 'bold', font: 'Georgia, serif'
    });
    Art.coin(g, X + W - 92, Y + 32, 1.1);
    Text.draw(g, String(Player.coins), X + W - 76, Y + 39, {
      size: 24, color: '#f0cf8a', weight: 'bold', font: 'Verdana, sans-serif'
    });

    // Dorran, talking
    const said = Math.floor(this.shown);
    Text.draw(g, '“' + this.line.slice(0, said) + (said >= this.line.length ? '”' : ''), X + 26, Y + 66, {
      size: 16, color: '#9fb0d0', italic: true, font: 'Georgia, serif'
    });

    // tabs
    const tabY = Y + 86;
    let tx = X + 26;
    for (let i = 0; i < TABS.length; i++) {
      const label = TABS[i] + (i === 0 && Player.catches.length ? ' (' + Player.catches.length + ')' : '');
      const w = Text.width(g, label, { size: 16, weight: 'bold', font: 'Verdana, sans-serif' }) + 34;
      const on = i === this.tab;
      panel(g, tx, tabY, w, 34, {
        alpha: on ? 1 : .55,
        top: on ? 'rgba(70,58,36,.98)' : 'rgba(22,26,42,.9)',
        bottom: on ? 'rgba(48,38,22,.99)' : 'rgba(14,17,30,.95)',
        border: on ? '#e8c76a' : 'rgba(120,132,164,.5)'
      });
      Text.draw(g, label, tx + w / 2, tabY + 23, {
        size: 15, align: 'center', weight: 'bold', font: 'Verdana, sans-serif',
        color: on ? '#f0cf8a' : '#8d97b4'
      });
      tx += w + 10;
    }

    // list
    const rows = this.rows();
    const listY = tabY + 50;
    const rowH = 60;
    const maxRows = Math.floor((Y + H - listY - 44) / rowH);
    let start = 0;
    if (rows.length > maxRows) start = clamp(this.sel - Math.floor(maxRows / 2), 0, rows.length - maxRows);

    for (let i = start; i < Math.min(rows.length, start + maxRows); i++) {
      const r = rows[i];
      const y = listY + (i - start) * rowH;
      const on = i === this.sel;

      if (r.kind === 'head') {
        Text.draw(g, r.name, X + 30, y + 26, {
          size: 13, color: '#7f8aa8', weight: 'bold', font: 'Verdana, sans-serif'
        });
        g.strokeStyle = 'rgba(140,150,180,.25)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(X + 84, y + 25); g.lineTo(X + W - 30, y + 25); g.stroke();
        continue;
      }

      if (on) {
        g.fillStyle = 'rgba(200,164,92,.14)';
        roundRect(g, X + 20, y, W - 40, rowH - 6, 5); g.fill();
        g.strokeStyle = 'rgba(232,199,106,.65)'; g.lineWidth = 3;
        roundRect(g, X + 20, y, W - 40, rowH - 6, 5); g.stroke();
        Text.draw(g, '▸', X + 12, y + 36, { size: 18, color: '#e8c76a' });
      }
      if (this.flashT > 0 && i === this.flashRow) {
        g.globalAlpha = this.flashT * 1.6;
        g.fillStyle = this.flashGood ? 'rgba(140,224,164,.35)' : 'rgba(226,70,76,.3)';
        roundRect(g, X + 20, y, W - 40, rowH - 6, 5); g.fill();
        g.globalAlpha = 1;
      }

      const dim = (r.locked && !r.owned);
      const nameCol = r.owned ? '#8ca0c0' : (dim ? '#5f6883' : (on ? '#f6e9c6' : '#ddd6c4'));
      let nx = X + 40;

      if (r.kind === 'fish') { Art.fishIcon(g, X + 48, y + 24, 1.15, r.body, r.belly); nx = X + 74; }

      Text.draw(g, r.name, nx, y + 24, { size: 19, color: nameCol, weight: on ? 'bold' : 'normal' });
      const statO = { size: 12, color: '#75809c', align: 'right', font: 'Verdana, sans-serif' };
      if (r.sub) {
        // the description stops short of the stats beside it, trimmed with an ellipsis
        const subO = { size: 13, color: dim ? '#4e566d' : '#8d97b4', italic: true, font: 'Georgia, serif' };
        const room = (r.stat ? X + W - 150 - Text.width(g, r.stat, statO) - 18 : X + W - 130) - nx;
        let sub = r.sub;
        if (Text.width(g, sub, subO) > room) {
          while (sub.length > 1 && Text.width(g, sub + '…', subO) > room) sub = sub.slice(0, -1);
          sub = sub.trimEnd() + '…';
        }
        Text.draw(g, sub, nx, y + 48, subO);
      }
      if (r.stat) Text.draw(g, r.stat, X + W - 150, y + 48, statO);

      // right column
      const rx = X + W - 44;
      if (r.kind === 'all' || r.kind === 'fish') {
        Text.draw(g, r.value + '§', rx, y + 34, {
          size: 21, color: '#f0cf8a', weight: 'bold', align: 'right', font: 'Verdana, sans-serif'
        });
      } else if (r.owned) {
        const inUse = (r.kind === 'rod' && r.idx === Player.rod) || (r.kind === 'weapon' && r.idx === Player.weapon) ||
          (r.kind === 'suit' && r.idx === Player.suit) || (r.kind === 'diveweapon' && r.idx === Player.diveWeapon);
        Text.draw(g, inUse ? 'IN USE' : 'OWNED',
          rx, y + 34, { size: 13, color: '#6f9e84', weight: 'bold', align: 'right', font: 'Verdana, sans-serif' });
      } else if (r.locked) {
        Text.draw(g, '—', rx, y + 34, { size: 18, color: '#4e566d', align: 'right' });
      } else if (r.kind !== 'none') {
        const afford = Player.coins >= r.price;
        Text.draw(g, r.price + '§', rx, y + 34, {
          size: 21, color: afford ? '#f0cf8a' : '#a05a5a', weight: 'bold', align: 'right', font: 'Verdana, sans-serif'
        });
      }
    }

    if (rows.length > maxRows) {
      Text.draw(g, '▾ more ▾', X + W / 2, Y + H - 30, {
        size: 12, align: 'center', color: 'rgba(150,162,190,.5)', font: 'Verdana, sans-serif'
      });
    }

    // footer
    Text.draw(g, '← → tabs    ↑ ↓ choose    [E] confirm    [ESC] leave',
      X + W / 2, Y + H - 12, {
        size: 13, align: 'center', color: 'rgba(160,172,200,.65)', font: 'Verdana, sans-serif'
      });
  }
};

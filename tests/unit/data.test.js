'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

const h = loadGame({ draw: false, seed: 42 });
const g = h.g;
const { RODS, WEAPONS, GOODS, MONSTERS, JUNK } = { RODS: g.RODS, WEAPONS: g.WEAPONS, GOODS: g.GOODS, MONSTERS: g.MONSTERS, JUNK: g.JUNK };
const unique = arr => new Set(arr).size === arr.length;
const isRgb = c => Array.isArray(c) && c.length === 3 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255);

describe('rods', () => {
  test('four rods, one per depth, starting free', () => {
    assert.equal(RODS.length, 4);
    assert.deepEqual(plain(RODS.map(r => r.depth)), [1, 2, 3, 4]);
    assert.equal(RODS[0].price, 0);
    assert.ok(unique(RODS.map(r => r.id)));
  });

  test('every upgrade costs more and reels better', () => {
    for (let i = 1; i < RODS.length; i++) {
      assert.ok(RODS[i].price > RODS[i - 1].price);
      assert.ok(RODS[i].bar > RODS[i - 1].bar);
      assert.ok(RODS[i].reel > RODS[i - 1].reel);
    }
  });

  test('the reel bar always fits inside the 300px gauge', () => {
    for (const r of RODS) assert.ok(r.bar > 0 && r.bar < 300, r.id);
  });
});

describe('weapons', () => {
  test('the first weapon is a free dip net', () => {
    assert.equal(WEAPONS[0].id, 'dipnet');
    assert.equal(WEAPONS[0].kind, 'net');
    assert.equal(WEAPONS[0].price, 0);
  });

  test('ids are unique and nothing is just another sword', () => {
    assert.ok(unique(WEAPONS.map(w => w.id)));
    assert.ok(unique(WEAPONS.map(w => w.kind)), 'each weapon draws differently');
    assert.ok(!WEAPONS.some(w => /sword/i.test(w.name)));
  });

  test('styles are ones the battle code knows', () => {
    for (const w of WEAPONS) assert.ok(['swing', 'chop', 'thrust'].includes(w.style), w.id);
    assert.ok(WEAPONS.some(w => w.style === 'chop'));
    assert.ok(WEAPONS.some(w => w.style === 'thrust'));
  });

  test('each upgrade costs more and hits harder', () => {
    for (let i = 1; i < WEAPONS.length; i++) {
      assert.ok(WEAPONS[i].price > WEAPONS[i - 1].price, WEAPONS[i].id);
      assert.ok(WEAPONS[i].dmg > WEAPONS[i - 1].dmg, WEAPONS[i].id);
    }
  });

  test('weapon stats and colours are usable', () => {
    for (const w of WEAPONS) {
      assert.ok(w.reach > .5 && w.reach < 2 && w.speed > .5 && w.speed < 2 && w.knock > 0, w.id);
      for (const c of [w.metal, w.grip, w.accent]) assert.match(c, /^#[0-9a-f]{6}$/i);
      assert.ok(w.desc.length > 10);
    }
  });
});

describe('diving suits', () => {
  const SUITS = g.SUITS;

  test('four suits, the first free, each going deeper with more air', () => {
    assert.equal(SUITS.length, 4);
    assert.equal(SUITS[0].price, 0);
    assert.ok(unique(SUITS.map(s => s.id)));
    for (let i = 1; i < SUITS.length; i++) {
      for (const k of ['price', 'depth', 'air', 'speed', 'lamp']) assert.ok(SUITS[i][k] > SUITS[i - 1][k], SUITS[i].id + ' ' + k);
    }
  });

  test('suit colours are usable', () => {
    for (const s of SUITS) {
      assert.match(s.brass, /^#[0-9a-f]{6}$/i);
      assert.match(s.rubber, /^#[0-9a-f]{6}$/i);
      assert.ok(s.desc.length > 10);
    }
  });
});

describe('diving weapons', () => {
  const W = g.DIVE_WEAPONS;

  test('the starter is the harpoon the Old One dropped', () => {
    assert.equal(W[0].id, 'harpoon');
    assert.equal(W[0].price, 0);
    assert.match(W[0].desc, /Old One/);
  });

  test('nothing that goes bang: no guns underwater', () => {
    for (const w of W) assert.doesNotMatch(w.name + ' ' + w.desc, /gun|pistol|rifle|musket|cannon|bullet|powder/i, w.id);
  });

  test('every weapon is a launcher, each firing its own way', () => {
    assert.ok(unique(W.map(w => w.kind)));
    assert.deepEqual([...new Set(W.map(w => w.style))].sort(), ['chain', 'harpoon', 'pierce', 'spread', 'wave']);
    for (const w of W) assert.ok(g.FIRE_STYLES[w.style], 'the shop can describe ' + w.style);
  });

  test('each upgrade costs more, and every one out-damages the harpoon in a single shot', () => {
    const volley = w => w.dmg * (w.count || 1);
    for (let i = 1; i < W.length; i++) {
      assert.ok(W[i].price > W[i - 1].price, W[i].id);
      assert.ok(volley(W[i]) > volley(W[0]), W[i].id);
    }
  });

  test('weapon stats are usable: every shot flies, reaches and cools down', () => {
    for (const w of W) {
      assert.ok(w.speed > 300 && w.range > 300 && w.cd > 0 && w.knock > 0 && w.size > 0, w.id);
      assert.equal('ammo' in w, false, 'no ammunition, ever');
      if (w.style === 'spread') assert.ok(w.count >= 2 && w.spread > 0);
      if (w.style === 'chain') assert.ok(w.chain >= 1 && w.jump > 0);
      if (w.style === 'wave') assert.ok(w.grow > 0);
      for (const c of [w.metal, w.grip, w.accent]) assert.match(c, /^#[0-9a-f]{6}$/i);
    }
  });
});

describe('goods', () => {
  test('each good has a known type, a price and a stock limit', () => {
    assert.deepEqual(plain(GOODS.map(x => x.type)).sort(),['consume', 'lantern', 'luck', 'maxhp']);
    for (const gd of GOODS) assert.ok(gd.price > 0 && gd.max >= 1, gd.id);
    assert.ok(GOODS.find(x => x.type === 'maxhp').scale > 1);
  });
});

describe('monsters', () => {
  const PLANS = ['eel', 'angler', 'tentacle', 'ray', 'crustacean', 'bloom', 'husk', 'maw', 'leviathan'];

  test('there is real variety: many monsters over every body plan', () => {
    assert.ok(MONSTERS.length >= 16);
    assert.ok(unique(MONSTERS.map(m => m.id)));
    assert.ok(unique(MONSTERS.map(m => m.name)));
    const plans = new Set(MONSTERS.map(m => m.plan));
    for (const p of PLANS) assert.ok(plans.has(p), 'no monster uses ' + p);
  });

  test('every monster is fully specified', () => {
    for (const m of MONSTERS) {
      assert.ok(PLANS.includes(m.plan), m.id + ' plan');
      assert.ok(m.depth >= 1 && m.depth <= 4, m.id + ' depth');
      assert.ok(m.hp > 0 && m.len > 0 && m.value > 0 && m.dmg >= 1 && m.speed > 0, m.id + ' stats');
      assert.ok(m.girth > 0 && m.girth < 1, m.id + ' girth');
      assert.ok(Number.isInteger(m.eyes) && m.eyes >= 0, m.id + ' eyes');
      assert.ok(isRgb(m.body) && isRgb(m.belly) && isRgb(m.fin), m.id + ' colours');
      assert.match(m.eye, /^#[0-9a-f]{6}$/i);
      assert.ok(m.glow === null || /^#[0-9a-f]{6}$/i.test(m.glow), m.id + ' glow');
      assert.ok(m.flavour.length > 10);
    }
  });

  test('every depth has at least four monsters', () => {
    for (let d = 1; d <= 4; d++) assert.ok(MONSTERS.filter(m => m.depth === d && !m.boss).length >= 4, 'depth ' + d);
  });

  test('deeper water means tougher and more valuable monsters', () => {
    const avg = (d, k) => { const ms = MONSTERS.filter(m => m.depth === d && !m.boss); return ms.reduce((a, m) => a + m[k], 0) / ms.length; };
    for (let d = 2; d <= 4; d++) {
      assert.ok(avg(d, 'hp') > avg(d - 1, 'hp') * 1.5, 'hp at depth ' + d);
      assert.ok(avg(d, 'value') > avg(d - 1, 'value'), 'value at depth ' + d);
    }
  });

  test('every monster has the same two attacks, and a third that belongs to its body', () => {
    const own = new Set();
    for (const m of MONSTERS.filter(m => !m.boss)) {
      const a = plain(g.attacksOf(m));
      assert.equal(a.length, 3, m.id);
      assert.deepEqual(a.slice(0, 2), ['lunge', 'slam'], m.id);
      assert.equal(a[2], g.DECK_UNIQUE[m.plan], m.id);
      own.add(a[2]);
    }
    assert.equal(own.size, 8, 'eight body plans, eight attacks of their own');
    const old = plain(g.attacksOf(MONSTERS.find(m => m.boss)));
    for (const s of ['jaw', 'breach', 'drag']) assert.ok(old.includes(s), 'the Old One: ' + s);
  });

  test('exactly one boss: the Old One, the biggest and hardest thing in the sea', () => {
    const bosses = MONSTERS.filter(m => m.boss);
    assert.equal(bosses.length, 1);
    const b = bosses[0];
    assert.equal(b.id, 'leviathan');
    assert.equal(b.plan, 'leviathan');
    for (const m of MONSTERS.filter(x => !x.boss)) {
      assert.ok(b.hp > m.hp * 2.5, 'boss hp vs ' + m.id);
      assert.ok(b.len > m.len, 'boss length vs ' + m.id);
    }
  });

  test('the first monster is the Gnashfin that ambushes the intro fish', () => {
    assert.equal(MONSTERS[0].id, 'gnashfin');
    assert.equal(MONSTERS[0].depth, 1);
  });

  test('junk is cheap', () => {
    assert.ok(JUNK.length >= 3);
    for (const j of JUNK) assert.ok(j.value > 0 && j.value < MONSTERS[0].value);
  });
});

describe('the Brood below', () => {
  const D = g.DIVE_MONSTERS;
  const PLANS = ['eel', 'angler', 'tentacle', 'ray', 'crustacean', 'bloom', 'husk', 'maw', 'leviathan'];

  test('four creatures in each of the four zones, none of them from above', () => {
    for (let z = 1; z <= 4; z++) assert.equal(D.filter(m => m.zone === z && !m.boss && !m.spawnOnly).length, 4, 'zone ' + z);
    const ids = D.map(m => m.id).concat(MONSTERS.map(m => m.id));
    assert.ok(unique(ids), 'no id is shared with the fishing monsters');
  });

  test('one boss below: the Mother, bigger and far tougher than the Old One', () => {
    const bosses = D.filter(m => m.boss);
    assert.equal(bosses.length, 1);
    const M = bosses[0], old = MONSTERS.find(m => m.boss);
    assert.equal(M.id, 'mother');
    assert.equal(M.plan, 'mother');
    assert.ok(M.hp > old.hp * 2, 'hp');
    assert.ok(M.len > old.len, 'size');
    assert.deepEqual(plain(g.attacksOf(M)).sort(), ['brood', 'coil', 'maw', 'pulse', 'stare', 'sweep', 'whirlpool']);
    assert.match(M.flavour, /Old One/);
  });

  test('her broodlings only ever come out of her', () => {
    const b = D.find(m => m.id === 'broodling');
    assert.equal(b.spawnOnly, true);
    assert.equal(b.zone, 4);
  });

  test('every creature is fully specified, with underwater attacks only', () => {
    for (const m of D.filter(x => !x.boss)) {
      assert.ok(PLANS.includes(m.plan), m.id + ' plan');
      assert.ok(m.hp > 0 && m.len > 0 && m.value > 0 && m.dmg >= 1 && m.speed > 0 && m.aggro > 100, m.id + ' stats');
      assert.ok(m.girth > 0 && m.girth < 1);
      assert.ok(isRgb(m.body) && isRgb(m.belly) && isRgb(m.fin), m.id + ' colours');
      const a = plain(g.attacksOf(m));
      assert.deepEqual(a.slice(0, 2), ['bite', 'charge'], m.id);
      assert.equal(a[2], g.DIVE_UNIQUE[m.plan], m.id + ' attacks');
      assert.ok(m.flavour.length > 10);
    }
  });

  test('deeper zones hold tougher, more valuable things than anything you could fish up', () => {
    const avg = (z, k) => { const ms = D.filter(m => m.zone === z && !m.boss && !m.spawnOnly); return ms.reduce((a, m) => a + m[k], 0) / ms.length; };
    for (let z = 2; z <= 4; z++) {
      assert.ok(avg(z, 'hp') > avg(z - 1, 'hp') * 1.5, 'hp in zone ' + z);
      assert.ok(avg(z, 'value') > avg(z - 1, 'value'), 'value in zone ' + z);
    }
    const fishedDeep = MONSTERS.filter(m => m.depth === 4 && !m.boss);
    assert.ok(avg(4, 'hp') > fishedDeep.reduce((a, m) => a + m.hp, 0) / fishedDeep.length);
  });

  test('allMonsters and monsterDef find creatures above and below', () => {
    assert.equal(g.allMonsters().length, MONSTERS.length + D.length);
    assert.equal(g.monsterDef('gnashfin').name, 'Gnashfin');
    assert.equal(g.monsterDef('trenchmaw').zone, 4);
    assert.equal(g.monsterDef('nothing'), null);
  });

  test('selling down there pays for the suits: a zone pays for the next suit in a handful of kills', () => {
    for (let z = 1; z <= 3; z++) {
      const avg = D.filter(m => m.zone === z && !m.boss && !m.spawnOnly).reduce((a, m) => a + m.value, 0) / 4;
      const kills = g.SUITS[z].price / avg;
      assert.ok(kills > 2 && kills < 12, 'zone ' + z + ' needs ' + kills.toFixed(1) + ' kills');
    }
  });
});

describe('rollCatch and makeTrophy', () => {
  test('never rolls anything deeper than the rod reaches', () => {
    for (let d = 1; d <= 3; d++) {
      for (let i = 0; i < 400; i++) {
        const c = g.rollCatch(d, false);
        if (!c.junk) assert.ok(c.depth <= d && !c.boss, 'depth ' + d + ' rolled ' + c.id);
      }
    }
  });

  test('the boss only bites on the deepest rod', () => {
    let boss = 0;
    for (let i = 0; i < 600; i++) if (g.rollCatch(4, false).boss) boss++;
    assert.ok(boss > 100 && boss < 280, 'boss rolled ' + boss + '/600');
  });

  test('junk comes up sometimes, shaped as junk', () => {
    const junk = [];
    for (let i = 0; i < 400; i++) { const c = g.rollCatch(1, false); if (c.junk) junk.push(c); }
    assert.ok(junk.length > 20 && junk.length < 100, 'junk ' + junk.length + '/400');
    for (const j of junk) assert.ok(typeof j.name === 'string' && j.value > 0 && j.icon);
  });

  test('rolls favour the deepest monsters a rod can reach', () => {
    let deep = 0, n = 0;
    for (let i = 0; i < 800; i++) { const c = g.rollCatch(3, false); if (!c.junk) { n++; if (c.depth === 3) deep++; } }
    assert.ok(deep / n > .4, 'depth-3 share ' + (deep / n).toFixed(2));
  });

  test('the charm means less junk and bigger things', () => {
    const count = (luck, pred) => { let k = 0; for (let i = 0; i < 1500; i++) if (pred(g.rollCatch(4, luck))) k++; return k; };
    assert.ok(count(true, c => c.junk) < count(false, c => c.junk));
    assert.ok(count(true, c => c.boss) > count(false, c => c.boss));
  });

  test('trophies stay within their weight and value ranges', () => {
    for (const m of MONSTERS) {
      for (let i = 0; i < 30; i++) {
        const t = g.makeTrophy(m);
        assert.equal(t.id, m.id);
        assert.ok(t.weight >= Math.round(m.len * .45) && t.weight <= Math.round(m.len * .8 + 24), m.id + ' weight ' + t.weight);
        assert.ok(t.value >= Math.round(m.value * .85) && t.value <= Math.round(m.value * 1.3), m.id + ' value ' + t.value);
      }
    }
  });
});

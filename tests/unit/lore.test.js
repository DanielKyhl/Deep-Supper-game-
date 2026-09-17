'use strict';
/* What the sea gives back: letters, relics, a sword, and a bill. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, plain } = require('../helpers/harness');

function onDeck(opts, gear) {
  const h = loadGame(Object.assign({ draw: false, seed: 8 }, opts));
  h.startVoyage();
  const g = h.g;
  g.Dialogue.hide(); g.Game.msgs = [];
  Object.assign(g.Player, { weapon: 0, introDone: true, totalKills: 1 }, gear);
  return { h, g, P: g.Player, L: g.Lore };
}
// make the sea's dice come up for one kind of find and nothing else
const rig = (g, what) => { g.SeaDice.chance = p => (what === 'excalibur' && p === g.EXCALIBUR_CHANCE) || (what === 'bottle' && p === g.BOTTLE_CHANCE); };

// cast, wait for the bite, set the hook, and let it come up
function landSpecial(h) {
  const g = h.g;
  g.Player.x = g.FISH_X;
  g.Game.useSpot({ id: 'fish' });
  assert.equal(g.Game.state, 'fish');
  assert.ok(h.until(() => g.Fishing.phase === 'bite', 30), 'no bite');
  h.tap('KeyE');
  assert.equal(g.Fishing.phase, 'junk');
  assert.ok(h.until(() => g.Game.state === 'play', 5), 'never came up');
}

describe('the letters and relics', () => {
  test('twenty of them, each with its own id: eight in bottles, four letters and eight relics on the bottom', () => {
    const { g } = onDeck();
    const L = g.LORE;
    assert.equal(L.length, 20);
    assert.equal(new Set(L.map(l => l.id)).size, 20);
    assert.equal(L.filter(l => l.where === 'bottle').length, 8);
    assert.equal(L.filter(l => l.where === 'dive' && l.kind === 'letter').length, 4);
    assert.equal(L.filter(l => l.where === 'dive' && l.kind === 'relic').length, 8);
    for (const l of L) assert.ok(l.title && l.from && l.text.length > 80, l.id);
    for (const l of L.filter(l => l.kind === 'relic')) assert.equal(typeof g.RELIC_ART[l.id], 'function', l.id);
  });

  test('everything on the bottom lies in open water you can reach, spread across all four bands, clear of her arena', () => {
    const { g } = onDeck();
    const zones = new Set();
    for (const l of g.LORE.filter(l => l.where === 'dive')) {
      assert.equal(g.Dive._solid(l.x, l.y), false, l.id + ' is inside rock');
      const o = { x: l.x, y: l.y, vx: 0, vy: 0 };
      g.diveCollide(o, 20);
      assert.ok(Math.hypot(o.x - l.x, o.y - l.y) < 40, l.id + ' cannot be swum to');
      zones.add(g.diveZoneAt(l.y));
      const A = g.MOTHER_ARENA;
      assert.ok(l.y < A.top + 100 || Math.abs(l.x - g.CITY_X) > A.w / 2 + 400, l.id + ' would start her fight');
    }
    assert.deepEqual([...zones].sort(), [1, 2, 3, 4]);
  });

  test('every page fits on the page', () => {
    const { g } = onDeck();
    for (const l of g.LORE) {
      const lines = g.Text.wrap(null, l.text, 640 - 80, { size: 17 });
      const room = l.kind === 'relic' ? 9 : 13;
      assert.ok(lines.length <= room, l.id + ': ' + lines.length + ' lines');
      assert.ok(g.Text.width(null, l.title, { size: 26 }) < 600, l.id);
    }
  });

  test('bottles bring the letters up in order, and none once they are all found', () => {
    const { g, L } = onDeck();
    g.Player.girlMet = true;
    const bottles = plain(g.LORE.filter(l => l.where === 'bottle').map(l => l.id));
    const got = [];
    while (L.nextBottle()) { const id = L.nextBottle().id; got.push(id); L.find(id); L.close(); }
    assert.deepEqual(got, bottles);
    assert.equal(L.nextBottle(), null);
  });

  test("Nerys's bottle waits until he has fished her up", () => {
    const { g, L } = onDeck();
    g.Player.girlMet = false;
    for (const l of g.LORE.filter(l => l.where === 'bottle' && l.id !== 'nerys')) L.find(l.id);
    L.close();
    assert.equal(L.nextBottle(), null, 'nothing yet');
    g.Player.girlMet = true;
    assert.equal(L.nextBottle().id, 'nerys');
  });

  test('finding one keeps it, opens it, and saves; finding it again does nothing', () => {
    const { h, g, L, P } = onDeck();
    h.storage.clear();
    assert.equal(L.find('watch'), true);
    assert.equal(L.open, 'watch');
    assert.deepEqual(plain(P.lore), ['watch']);
    assert.deepEqual(plain(JSON.parse(h.storage.get('deepsupper.save.v1')).lore), ['watch']);
    L.close();
    assert.equal(L.find('watch'), false);
    assert.equal(L.open, null);
    assert.equal(L.find('nonsense'), false);
    assert.equal(L.count('relic'), 1);
    assert.equal(L.count('letter'), 0);
  });

  test('while a page is open the world holds still, and it only closes on a deliberate press', () => {
    const { h, g, L } = onDeck();
    L.find('ledger');
    const t = g.Game.t, x = g.Player.x;
    h.keyDown('KeyD');
    h.frames(.2);
    h.keyUp('KeyD');
    assert.equal(g.Player.x, x, 'he did not walk');
    assert.equal(L.open, 'ledger');
    h.frames(.3);
    h.tap('Enter');
    assert.equal(L.open, null);
    assert.ok(g.Game.t > t);
    L.read('ledger');
    h.tap('KeyE');
    assert.equal(L.open, 'ledger', 'a press the moment it opens is not read as putting it away');
  });

  test('swimming over something on the bottom picks it up; swimming past it does not', () => {
    const h = loadGame({ draw: false, seed: 3 });
    h.startVoyage();
    const g = h.g, D = g.Dive;
    Object.assign(g.Player, { beatBoss: true, suit: 3, diveWeapon: 0 });
    g.Game.state = 'dive'; D.start(); D.enterWater(); D.mobs.length = 0;
    const crown = g.loreDef('crown');
    Object.assign(D.p, { x: crown.x - 200, y: crown.y, air: 1e9 });
    h.frames(.2);
    assert.equal(g.Lore.open, null);
    Object.assign(D.p, { x: crown.x + 20, y: crown.y });
    h.frame();
    assert.equal(g.Lore.open, 'crown');
    assert.ok(g.Lore.unfound().every(l => l.id !== 'crown'));
  });

  test('a save keeps what was found, and a damaged one keeps only real finds, once each', () => {
    const { h, g, P } = onDeck();
    P.lore.push('meg', 'crown');
    P.excalibur = true;
    const d = g.SaveGame.sanitize(JSON.parse(JSON.stringify(g.SaveGame.snapshot())));
    assert.deepEqual(plain(d.lore), ['meg', 'crown']);
    assert.equal(d.excalibur, true);
    const bad = g.SaveGame.sanitize(Object.assign(g.SaveGame.snapshot(), { lore: ['meg', 'meg', 'kraken', 7, null], excalibur: 'yes' }));
    assert.deepEqual(plain(bad.lore), ['meg']);
    assert.equal(bad.excalibur, false);
    P.lore.length = 0; P.excalibur = false;
    g.SaveGame.restore(d);
    assert.deepEqual(plain(g.Player.lore), ['meg', 'crown']);
    assert.equal(g.Player.excalibur, true);
  });

  test('the journal lists what has been found, and opens it', () => {
    const { h, g, P } = onDeck();
    const M = g.Menu;
    assert.match(M.items('pause').find(i => i.id === 'journal').label, /0\/20/);
    assert.match(M.items('journal').map(i => i.label).join(' '), /Nothing yet/);
    P.lore.push('iou', 'eggcase');
    const rows = M.items('journal').filter(i => i.kind === 'action' && i.id !== 'back');
    assert.deepEqual(plain(rows.map(r => r.label)), ['Letter: An IOU in a familiar hand', 'Relic: An empty Brood egg-case']);
    assert.match(M.items('journal')[0].label, /1 of 12 letters.*1 of 8 relics/);
    rows[1].run();
    assert.equal(g.Lore.open, 'eggcase');
  });

  test('pages and finds draw soundly', () => {
    const { h, g } = onDeck({ draw: true });
    const rec = h.hires(), bctx = h.eval('bctx');
    for (const l of g.LORE) {
      g.Lore.read(l.id); g.Lore.t = 1;
      rec.reset();
      g.Lore.draw(bctx);
      assert.equal(rec.depth(), 0, l.id);
      rec.reset();
      g.Lore.drawFind(bctx, l, 300, 200, 1.3, 1);
      assert.equal(rec.depth(), 0, l.id);
    }
  });
});

describe('what turns up on a line', () => {
  test('a bottle: it comes straight up, and its letter opens on deck', () => {
    const { h, g, P } = onDeck();
    rig(g, 'bottle');
    landSpecial(h);
    assert.equal(g.Lore.open, 'meg');
    assert.deepEqual(plain(P.lore), ['meg']);
    assert.match(g.Game.toastText, /bottle/);
  });

  test('Excalibur: once in a thousand casts, and then it is yours', () => {
    const { h, g, P } = onDeck();
    assert.equal(g.EXCALIBUR_CHANCE, .001);
    rig(g, 'excalibur');
    landSpecial(h);
    assert.equal(P.excalibur, true);
    assert.equal(g.deckWeapon(), g.EXCALIBUR);
    assert.match(g.Dialogue.full, /The line comes up heavy/);
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).excalibur, true);
  });

  test('never on the first cast, never twice, and never before the girl who is due', () => {
    const first = loadGame({ draw: false, seed: 1 });
    first.startVoyage();
    first.g.Player.weapon = 0;
    rig(first.g, 'excalibur');
    first.g.Fishing.start();
    assert.equal(first.g.Fishing.intro, true);
    assert.equal(first.g.Fishing.special, null);

    const { g } = onDeck({}, { excalibur: true });
    rig(g, 'excalibur');
    g.Fishing.start();
    assert.notEqual(g.Fishing.special, 'excalibur');

    const due = onDeck({}, { rod: 2 });
    rig(due.g, 'bottle');
    due.g.Fishing.start();
    due.g.Fishing.t = 99; due.g.Fishing.phase = 'deep';
    due.g.Fishing.update(1 / 60);
    assert.equal(due.g.Fishing.target, due.g.GIRL);
  });

  test('in tests the sea never comes up special by chance, unless a test asks for it', () => {
    const ordinary = loadGame({ draw: false, seed: 3 });
    for (let i = 0; i < 500; i++) assert.equal(ordinary.g.SeaDice.chance(.99), false);
    const rare = loadGame({ draw: false, seed: 3, rareCatches: true });
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (rare.g.SeaDice.chance(.06)) hits++;
    assert.ok(hits > 60 && hits < 190, 'about 6 in 100: ' + hits);
    const again = loadGame({ draw: false, seed: 3, rareCatches: true });
    assert.equal(again.g.SeaDice.next(), loadGame({ draw: false, seed: 3, rareCatches: true }).g.SeaDice.next(), 'and the same seed rolls the same');
  });

  test("the sea's dice are its own: a cast rolls no more of the game's dice than it did", () => {
    const { h, g } = onDeck();
    h.sandbox.__rolls = 0;
    h.eval('(() => { const r = Math.random; Math.random = function () { __rolls++; return r(); }; })()');
    const before = h.sandbox.__rolls;
    g.SeaDice.next(); g.SeaDice.chance(.5);
    assert.equal(h.sandbox.__rolls, before);
  });
});

describe('Excalibur on deck', () => {
  test('one blow kills anything on the boat, the Old One included', () => {
    for (const id of ['gnashfin', 'choir', 'leviathan']) {
      const { h, g, P } = onDeck({}, { excalibur: true, weapon: 5 });
      g.Game.startBattle(g.monsterDef(id));
      const B = g.Battle;
      h.until(() => B.phase === 'fight', 5);
      const m = B.m;
      m.state = 'recover'; m.recDur = 99;
      P.x = m.x - m.def.len * .45 - 30; P.face = 1;
      h.tap('KeyJ');
      h.until(() => B.phase === 'win' || P.bState !== 'attack', 1);
      assert.equal(B.phase, 'win', id + ' survived with ' + m.hp);
      assert.equal(m.hits, 1, id);
    }
  });

  test('it is drawn, named on the HUD, and never for sale: the stall only lists it to take back in hand', () => {
    const { h, g, P } = onDeck({ draw: true }, { excalibur: true });
    const said = [];
    const draw = g.Text.draw;
    g.Text.draw = function (ctx, s) { said.push(String(s)); return draw.apply(this, arguments); };
    h.frame();
    g.Text.draw = draw;
    assert.ok(said.includes('Excalibur'));
    g.Shop.open(); g.Shop.tab = 1;
    const row = g.Shop.rows().find(r => /Excalibur/.test(r.name));
    assert.ok(row && row.owned && row.price === 0, 'owned, at no price');
    g.Shop.tab = 0;
    assert.ok(!g.Shop.rows().some(r => /Excalibur/.test(r.name)), 'and not on the SELL tab');
    P.excalibur = false;
    g.Shop.tab = 1;
    assert.ok(!g.Shop.rows().some(r => /Excalibur/.test(r.name)), 'no row before it comes up');
  });
});

describe('the salvage fee', () => {
  test('blacking out underwater costs a quarter of your coins, rounded down, and says so', () => {
    const h = loadGame({ draw: false, seed: 6 });
    h.startVoyage();
    const g = h.g, D = g.Dive;
    Object.assign(g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, coins: 1001 });
    g.Game.state = 'dive'; D.start(); D.enterWater(); D.mobs.length = 0;
    Object.assign(D.p, { x: 1500, y: 600, air: 0 });
    assert.ok(h.until(() => g.Game.state === 'play', 30));
    assert.equal(g.Player.coins, 1001 - 250);
    assert.match(g.Game.toastText, /Salvage fee: 250/);
  });

  test('with nothing in your pocket there is nothing to take, and no mention of it', () => {
    const { g } = onDeck({}, { coins: 3 });
    g.Battle.def = g.MONSTERS[0];
    g.Game.endBattle(false);
    assert.equal(g.Player.coins, 3);
    assert.doesNotMatch(g.Game.msgs.map(m => m.text).join(' ') + g.Dialogue.full, /salvage/);
    assert.equal(g.salvageFee(), 0);
  });
});

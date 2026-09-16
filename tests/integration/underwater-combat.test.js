'use strict';
/* Fighting and listening underwater, as a player does it: over the side with
   real keys, aiming with the mouse or the keys, holding fire, buying a new
   launcher from Dorran, and hearing the sea close over your head and open
   again however you leave it. And the creatures, drawn as pixel art, frame
   after frame. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

function diver(opts, gear) {
  const h = loadGame(Object.assign({ draw: false, seed: 11 }, opts));
  h.startVoyage();
  Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 5, maxHp: 9, hp: 9 }, gear);
  return h;
}

function goUnder(h) {
  F.walkTo(h, h.g.FISH_X, 40);
  h.tap('KeyE');
  assert.equal(h.g.Game.state, 'dive');
  assert.ok(h.until(() => h.g.Dive.underwater && h.g.Game.fade.dir === 0, 6), 'never got into the water');
}

// a quiet patch of open water with just the creatures given, placed around the diver
function arena(h, x, y, list) {
  const D = h.g.Dive;
  D.mobs.length = 0;
  Object.assign(D.p, { x, y, vx: 0, vy: 0, air: 1e9 });
  D._camera(0, true);
  // (makeMob adds it to the sea itself; each keeps to the band of water it was made in)
  return list.map(([id, dx, dy]) => D.makeMob(h.g.monsterDef(id), x + dx, y + dy, h.g.DIVE_ZONES.findIndex(Z => y + dy < Z.bottom) + 1));
}

// where a world point is on screen, for the mouse
const onScreen = (h, x, y) => [x - h.g.Dive.cam.x, y - h.g.Dive.cam.y];
const mouseUp = h => h.emit('mouseup', { button: 0 });

describe('fighting underwater, at range', () => {
  test('aim with the mouse and hold the button: the creature dies without ever getting close', () => {
    const h = diver({}, { diveWeapon: 3 });
    goUnder(h);
    const D = h.g.Dive;
    const [m] = arena(h, 1500, 560, [['bladderjelly', 380, 0]]);
    Object.assign(m, { state: 'stun', stun: 999 });
    let closest = Infinity;
    for (let i = 0; i < 20 * 60 && !m.dead; i++) {
      h.click(...onScreen(h, m.x, m.y));
      h.frame();
      closest = Math.min(closest, Math.hypot(m.x - D.p.x, m.y - D.p.y));
    }
    mouseUp(h);
    assert.equal(m.dead, true, 'still alive with ' + m.hp + ' hp');
    assert.ok(closest > 250, 'got within ' + closest);
    assert.equal(h.g.Player.catches[h.g.Player.catches.length - 1].id, 'bladderjelly');
  });

  test('holding J keeps firing for as long as you hold it: no ammunition, no reloading', () => {
    const h = diver({}, { diveWeapon: 2 });
    goUnder(h);
    const D = h.g.Dive;
    arena(h, 1500, 560, []);
    let fired = 0;
    const count = D.fire;
    D.fire = function () { fired++; return count.apply(this, arguments); };
    h.keyDown('KeyJ');
    h.frames(8);
    const early = fired;
    h.frames(8);
    h.keyUp('KeyJ');
    const cd = h.g.DIVE_WEAPONS[2].cd;
    assert.ok(early >= Math.floor(8 / cd) - 1, 'fired ' + early + ' in 8s');
    assert.ok(fired - early >= Math.floor(8 / cd) - 1, 'still firing after 8s: ' + (fired - early));
    h.frames(2);
    const after = fired;
    h.frames(2);
    assert.equal(fired, after, 'and stops when you let go');
  });

  test('the harpoon flies out on its line, and only fires again once it is reeled back in', () => {
    const h = diver();
    goUnder(h);
    const D = h.g.Dive;
    arena(h, 1500, 560, []);
    h.keyDown('KeyD'); h.frame(); h.keyUp('KeyD');
    h.press('KeyJ'); h.frame();
    assert.equal(D.shots.length, 1);
    const shot = D.shots[0];
    h.frames(.25);
    assert.ok(shot.x - D.p.x > 150, 'out on the line');
    h.keyDown('KeyJ');
    assert.ok(h.until(() => D.shots.length === 0, 3), 'never came back');
    assert.ok(h.until(() => D.shots.length === 1, 1), 'and away again');
    h.keyUp('KeyJ');
  });

  test('the arrow keys aim when the mouse is still: fire straight down at something below', () => {
    const h = diver({}, { diveWeapon: 3 });
    goUnder(h);
    const D = h.g.Dive;
    const [m] = arena(h, 1500, 400, [['shelfcrab', 0, 300]]);
    Object.assign(m, { state: 'stun', stun: 999 });
    const hp = m.hp;
    h.keyDown('ArrowDown'); h.frame();
    h.press('KeyJ'); h.frames(.6);
    h.keyUp('ArrowDown');
    assert.ok(m.hp < hp, 'the tusk went down into it');
    assert.equal(D.mouseAim, false);
  });

  test('buy the Stormglass Eel from Dorran, dive, and its lightning jumps through a shoal', () => {
    const h = diver({}, { coins: 5000, diveWeapon: 1 });
    const g = h.g;
    F.openStall(h);
    g.Shop.tab = 1;
    g.Shop.sel = g.Shop.rows().findIndex(r => r.kind === 'diveweapon' && r.idx === 2);
    assert.ok(g.Shop.sel > 0, 'the eel is for sale');
    h.tap('Enter');
    h.tap('Escape');
    assert.equal(g.Player.diveWeapon, 2);
    assert.equal(g.Player.coins, 5000 - g.DIVE_WEAPONS[2].price);

    goUnder(h);
    const shoal = arena(h, 1500, 560, [['bladderjelly', 250, 0], ['bladderjelly', 400, 70], ['bladderjelly', 380, -90]]);
    for (const m of shoal) Object.assign(m, { state: 'stun', stun: 999, hp: 5000, maxHp: 5000 });
    h.click(...onScreen(h, shoal[0].x, shoal[0].y));
    h.frame(); mouseUp(h);
    h.frames(1.2);
    assert.equal(shoal.filter(m => m.hp < 5000).length, 3, 'hit ' + shoal.map(m => m.hp));
  });

  test('the Tusk goes through everything in a line, the Bell pushes a whole crowd back', () => {
    const h = diver({}, { diveWeapon: 3, suit: 3 });
    goUnder(h);
    const D = h.g.Dive;
    const line = arena(h, 1500, 560, [['kelpstrangler', 200, 0], ['kelpstrangler', 340, 0], ['kelpstrangler', 480, 0]]);
    for (const m of line) Object.assign(m, { state: 'stun', stun: 999, hp: 5000, maxHp: 5000 });
    h.click(...onScreen(h, 1800, 560)); h.frame(); mouseUp(h);
    h.frames(1);
    assert.equal(line.filter(m => m.hp < 5000).length, 3, 'pierced ' + line.map(m => m.hp));

    h.g.Player.diveWeapon = 4;
    const crowd = arena(h, 1500, 560, [['shelfcrab', 180, -50], ['shelfcrab', 200, 50]]);
    for (const m of crowd) Object.assign(m, { state: 'stun', stun: 999, hp: 5000, maxHp: 5000 });
    const before = crowd.map(m => m.x);
    h.click(...onScreen(h, 1800, 560));
    assert.ok(h.until(() => D.shots.some(s => s.style === 'wave'), 2), 'the bell rang');
    mouseUp(h);
    h.frames(.8);
    crowd.forEach((m, i) => assert.ok(m.x > before[i] + 20, 'pushed back: ' + before[i] + ' -> ' + m.x));
    assert.ok(D.shots.every(s => s.style === 'wave'));
  });

  test('pausing mid-shot freezes it in the water; resuming lets it fly on', () => {
    const h = diver({}, { diveWeapon: 3 });
    goUnder(h);
    const D = h.g.Dive;
    arena(h, 1500, 560, []);
    h.click(...onScreen(h, 1900, 560)); h.frame(); mouseUp(h);
    h.frames(.1);
    const shot = D.shots[0], x = shot.x;
    h.tap('Escape');
    h.frames(1);
    assert.equal(h.g.Game.state, 'pause');
    assert.equal(shot.x, x);
    h.tap('Escape');
    h.frames(.1);
    assert.ok(shot.x > x + 50 || !D.shots.includes(shot));
  });
});

describe('what the sea sounds like, however you leave it', () => {
  const audible = opts => {
    const h = diver(Object.assign({ audio: true }, opts));
    h.press('KeyZ');
    h.frame();
    return h;
  };

  test('over the side the sound closes in; muting in the middle silences the rumble; unmuting brings it back', () => {
    const h = audible();
    const S = h.g.Sfx;
    goUnder(h);
    assert.equal(S.muffle.frequency.value, h.g.MUFFLED_HZ);
    assert.ok(S.bed, 'the rumble of deep water');
    h.tap('KeyM');
    assert.equal(S.master.gain.value, 0);
    h.tap('KeyM');
    assert.ok(S.master.gain.value > 0);
    assert.ok(S.bed, 'still rumbling');
  });

  test('saving and returning to the title mid-dive opens the sound back up', () => {
    const h = audible();
    goUnder(h);
    h.tap('Escape');
    F.chooseMenu(h, 'title');
    assert.ok(h.until(() => h.g.Game.state === 'menu', 3));
    assert.equal(h.g.Sfx.muffle.frequency.value, h.g.OPEN_HZ);
    assert.equal(h.g.Sfx.bed, null);
  });

  test('drowning and waking on deck, the air sounds like air again', () => {
    const h = audible();
    goUnder(h);
    h.g.Dive.mobs.length = 0;
    Object.assign(h.g.Dive.p, { x: 1500, y: 700, air: 0 });
    assert.ok(h.until(() => h.g.Game.state === 'play', 30));
    assert.equal(h.g.Sfx.under, false);
    assert.equal(h.g.Sfx.muffle.frequency.value, h.g.OPEN_HZ);
  });

  test('loading a slot saved on deck, from underwater, comes up out of the water', () => {
    const h = audible();
    h.tap('Escape');
    F.chooseMenu(h, 'save');
    F.chooseMenu(h, 'slot2');
    h.tap('Escape'); h.tap('Escape');
    goUnder(h);
    h.tap('Escape');
    F.chooseMenu(h, 'load');
    F.chooseMenu(h, 'slot2');
    F.chooseMenu(h, 'yes');
    assert.ok(h.until(() => h.g.Game.state === 'play', 3));
    assert.equal(h.g.Sfx.under, false);
    assert.equal(h.g.Sfx.bed, null);
  });
});

describe('the creatures, as pixel art, in play', () => {
  test('a crowd on screen: each creature is put down every frame, but only rasterised on its animation steps', () => {
    const h = diver({ draw: true }, { suit: 3 });
    goUnder(h);
    const B = h.g.Beast;
    const crowd = arena(h, 1500, 2300, [['trenchmaw', 250, 60], ['broodsister', -250, -80], ['gatecrawler', 300, -150], ['hallwarden', -330, 110]]);
    for (const m of crowd) Object.assign(m, { state: 'stun', stun: 999 });
    Object.assign(h.g.Dive.p, { invuln: 1e9 });
    h.frames(.1);
    let begun = 0, drawn = 0;
    const begin = h.g.Spr.begin, draw = B.draw;
    h.g.Spr.begin = function () { begun++; return begin.apply(this, arguments); };
    B.draw = function () { drawn++; return draw.apply(this, arguments); };
    h.frames(.5);
    h.g.Spr.begin = begin; B.draw = draw;
    const onScreenCount = h.g.Dive.mobs.filter(m => Math.abs(m.x - h.g.Dive.p.x) < 600 && Math.abs(m.y - h.g.Dive.p.y) < 400).length;
    assert.ok(drawn >= 30 * crowd.length, 'drawn ' + drawn + ' times');
    assert.ok(begun <= drawn * .5, 'rasterised ' + begun + ' of ' + drawn);
    assert.ok(begun >= B.STEPS * .5 * crowd.length * .8, 'but still animating: ' + begun);
    assert.ok(B._held.size >= crowd.length && B._held.size <= onScreenCount + 6);
  });

  test('a hit flashes the creature white', () => {
    const h = diver({ draw: true }, { diveWeapon: 3 });
    goUnder(h);
    const D = h.g.Dive;
    const [m] = arena(h, 1500, 560, [['reefgnasher', 220, 0]]);
    Object.assign(m, { state: 'stun', stun: 999, hp: 5000, maxHp: 5000 });
    const pal = h.g.beastPalette(m.def, false);
    let used = 0;
    const bake = h.g.Spr.bake;
    h.g.Spr.bake = function (face, p, flash) { if (p === pal) used = Math.max(used, flash); return bake.apply(this, arguments); };
    h.click(...onScreen(h, m.x, m.y)); h.frame(); mouseUp(h);
    assert.ok(h.until(() => m.flash > .5, 1), 'hit');
    h.frame();
    h.g.Spr.bake = bake;
    assert.ok(used > .4, 'baked with flash ' + used);
    assert.equal(D.phase, 'swim');
  });

  test('the Old One on deck is drawn every frame of the fight, and never leaves save/restore unbalanced', () => {
    const h = loadGame({ draw: true, seed: 4 });
    h.startVoyage();
    h.g.Game.giveFishingGear();
    h.g.Game.startBattle(h.g.MONSTERS.find(m => m.boss));
    const rec = h.hires();
    let drawn = 0;
    const draw = h.g.Beast.draw;
    h.g.Beast.draw = function () { drawn++; return draw.apply(this, arguments); };
    for (let i = 0; i < 60; i++) {
      rec.reset();
      if (i % 20 === 0) h.press('KeyJ');
      h.frame();
      assert.equal(rec.depth(), 0);
    }
    h.g.Beast.draw = draw;
    assert.ok(drawn >= 60, 'drawn ' + drawn);
  });
});

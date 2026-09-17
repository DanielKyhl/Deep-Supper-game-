'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near, plain } = require('../helpers/harness');
const F = require('../helpers/flows');

// in the water off the ladder, with the given gear
function inWater(gear, opts) {
  const h = loadGame(Object.assign({ draw: false, seed: 7 }, opts));
  h.startVoyage();
  Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 0 }, gear);
  h.g.Game.state = 'dive';
  h.g.Dive.start();
  h.g.Dive.enterWater();
  if (opts && opts.empty) h.g.Dive.mobs.length = 0;
  return { h, g: h.g, D: h.g.Dive, p: h.g.Dive.p, P: h.g.Player };
}

// an empty stretch of sea with one creature of a given kind, holding still
function alone(s, id, x, y, state) {
  const { D, g } = s;
  D.mobs.length = 0;
  const def = g.monsterDef(id);
  const m = D.spawn(def.zone, null);
  Object.assign(m, { def, hp: def.hp, maxHp: def.hp, x, y, vx: 0, vy: 0, state: state || 'stun', stun: 1e9, t: 0 });
  return m;
}
const still = h => h.eval('Math.random = () => 0.5');

describe('the sea below', () => {
  const { g } = loadGame({ draw: false });

  test('four bands of water from the surface to the seabed, with no gaps between them', () => {
    assert.equal(g.DIVE_ZONES.length, 4);
    assert.equal(g.DIVE_ZONES[0].top, 0);
    assert.equal(g.DIVE_ZONES[3].bottom, g.DIVE_FLOOR);
    for (let i = 1; i < 4; i++) assert.equal(g.DIVE_ZONES[i].top, g.DIVE_ZONES[i - 1].bottom);
    assert.equal(g.DIVE_ZONES[3].name, 'Lanthorne');
  });

  test('a rock shelf sits on every boundary, each with a way through inside the cliffs', () => {
    for (let i = 0; i < 3; i++) {
      const L = g.DIVE_LEDGES[i];
      assert.equal(L.y, g.DIVE_ZONES[i].bottom);
      assert.ok(L.gapX - L.gapW / 2 > 300 && L.gapX + L.gapW / 2 < g.DIVE_W - 300);
      assert.ok(L.gapW > 400, 'wide enough to swim through');
    }
    assert.equal(g.DIVE_ROCKS.length, 6);
  });

  test('diveZoneAt names the band for a depth', () => {
    assert.equal(g.diveZoneAt(0), 1);
    assert.equal(g.diveZoneAt(949), 1);
    assert.equal(g.diveZoneAt(950), 2);
    assert.equal(g.diveZoneAt(3999), 4);
    assert.equal(g.diveZoneAt(9999), 4);
  });

  test('the cliffs never close the sea off', () => {
    for (let y = 0; y <= g.DIVE_FLOOR; y += 13) {
      assert.ok(g.diveWallL(y) > 20 && g.diveWallL(y) < 220);
      assert.ok(g.diveWallR(y) > 20 && g.diveWallR(y) < 220);
    }
  });

  test('the ladder hangs off the bow of the boat', () => {
    assert.ok(Math.abs(g.DIVE_LADDER_X - g.DIVE_BOAT_X) < 950);
    assert.ok(g.DIVE_LADDER_X > g.DIVE_BOAT_X);
  });
});

describe('diveCollide', () => {
  const { g } = loadGame({ draw: false });
  const o = (x, y, vx, vy) => ({ x, y, vx: vx || 0, vy: vy || 0 });

  test('keeps a swimmer off the cliffs and the seabed', () => {
    const a = o(0, 500, -100, 0);
    g.diveCollide(a, 20);
    assert.ok(a.x >= g.diveWallL(500) + 20 - 1e-9);
    assert.equal(a.vx, 0);
    const b = o(2000, 5000, 0, 100);
    g.diveCollide(b, 20);
    assert.equal(b.y, g.DIVE_FLOOR - 20);
    assert.equal(b.vy, 0);
  });

  test('a shelf stops you from above and from below', () => {
    const above = o(600, 940, 0, 200);
    g.diveCollide(above, 20);
    assert.ok(above.y <= 930 + 1e-6);
    assert.ok(above.vy <= 0);
    const below = o(600, 1030, 0, -200);
    g.diveCollide(below, 20);
    assert.ok(below.y >= 1040 - 1e-6);
  });

  test('the gap in a shelf lets you through', () => {
    const L = g.DIVE_LEDGES[0];
    const a = o(L.gapX, L.y + 20, 0, 200);
    g.diveCollide(a, 20);
    assert.equal(a.y, L.y + 20);
    assert.equal(a.vy, 200);
  });

  test('something wholly inside the rock is put back out the nearer side', () => {
    const a = o(600, 960, 0, 50);
    g.diveCollide(a, 20);
    assert.equal(a.y, 930);
  });
});

describe('going over the side', () => {
  function atLadder() {
    const h = loadGame({ draw: false, seed: 7 });
    h.startVoyage();
    Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 0, x: h.g.DIVE_X });
    return { h, g: h.g, D: h.g.Dive };
  }

  test('the ladder amidships is the way into the water, and the bow is still for fishing', () => {
    const { h, g } = atLadder();
    assert.equal(g.Game.spotLabel({ id: 'dive' }), 'Dive');
    assert.equal(g.Game.spotLabel({ id: 'fish' }), 'Cast your line');
    h.tap('KeyE');
    assert.equal(g.Game.state, 'dive');
    assert.equal(g.Dive.phase, 'gear');
  });

  test('suiting up frames the ladder and the rail, puts the suit on, then runs at the side', () => {
    const { h, g, D } = atLadder();
    h.tap('KeyE');
    assert.equal(g.Cam.locked, true);
    assert.ok(g.Cam.x <= g.DIVE_X - 60 && g.Cam.x + g.VIEW_W >= 1890, 'the ladder and the rail are both in frame: ' + g.Cam.x);
    assert.equal(D.suited, false);
    h.frames(.7);
    assert.equal(D.suited, true);
    h.frames(.9);
    assert.equal(D.phase, 'leap');
  });

  test('the run and leap carry him over the rail and into the water, then down', () => {
    const { h, g, D } = atLadder();
    h.tap('KeyE');
    h.until(() => D.phase === 'leap', 3);
    h.frames(.9);
    assert.ok(D.deck.x > 1800 && D.deck.y < g.DECK_Y, 'in the air');
    h.frames(.6);
    assert.equal(D.deck.visible, false, 'in the water');
    assert.ok(h.until(() => D.underwater, 3));
    assert.equal(D.phase, 'swim');
  });

  test('entering the water: at the ladder, a full tank, and a sea full of things', () => {
    const { D, p, g } = inWater();
    assert.ok(Math.abs(p.x - g.DIVE_LADDER_X) < 100 && p.y < 100);
    assert.equal(p.air, g.SUITS[0].air);
    assert.equal(D.mobs.length, 28);
    for (let z = 1; z <= 4; z++) assert.equal(D.mobs.filter(m => m.zone === z).length, 7);
  });

  test('nothing spawns in the rock, and nothing waits at the foot of the ladder', () => {
    for (const seed of [1, 2, 3]) {
      const { D, g } = inWater({}, { seed });
      for (const m of D.mobs) {
        assert.ok(!g.DIVE_ROCKS.some(R => m.x > R.x0 && m.x < R.x1 && m.y > R.y0 && m.y < R.y1), 'in rock');
        const Z = g.DIVE_ZONES[m.zone - 1];
        assert.ok(m.y > Z.top && m.y < Z.bottom, 'out of its zone');
        if (m.zone === 1) assert.ok(!(Math.abs(m.x - g.DIVE_LADDER_X) < 700 && m.y < 600), 'at the ladder');
        assert.equal(m.def.zone, m.zone);
      }
    }
  });

  test('the music changes once he is under', () => {
    const { h, g, D } = atLadder();
    h.tap('KeyE');
    h.frame();
    assert.equal(g.Music.themeName, 'sea');
    h.until(() => D.underwater, 5);
    h.frame();
    assert.equal(g.Music.themeName, 'dive');
  });

  test('ESC only pauses once he is swimming', () => {
    const { h, g, D } = atLadder();
    h.tap('KeyE');
    h.tap('Escape');
    assert.equal(g.Game.state, 'dive');
    h.until(() => D.phase === 'swim', 5);
    h.tap('Escape');
    assert.equal(g.Game.state, 'pause');
    assert.equal(g.Game.pausedFrom, 'dive');
  });
});

describe('swimming', () => {
  test('D swims right facing right, A swims left facing left', () => {
    const s = inWater();
    const { h, p } = s;
    p.x = 1500; p.y = 500;
    h.keyDown('KeyD'); h.frames(.4); h.keyUp('KeyD');
    assert.equal(p.face, 1);
    assert.ok(p.x > 1500);
    const x = p.x;
    h.keyDown('KeyA'); h.frames(.6); h.keyUp('KeyA');
    assert.equal(p.face, -1);
    assert.ok(p.x < x);
  });

  test('S and the down arrow swim down; W, space and the up arrow swim up', () => {
    for (const [code, dir] of [['KeyS', 1], ['ArrowDown', 1], ['KeyW', -1], ['Space', -1], ['ArrowUp', -1]]) {
      const { h, p } = inWater();
      p.x = 1500; p.y = 500; p.vy = 0;
      h.keyDown(code); h.frames(.4);
      assert.ok((p.y - 500) * dir > 20, code + ' moved ' + (p.y - 500));
    }
  });

  test('holding a direction aims the weapon that way', () => {
    const { h, p } = inWater();
    p.x = 1500; p.y = 500;
    h.keyDown('KeyS'); h.frame();
    near(p.aim, Math.PI / 2, 1e-9);
    h.keyDown('KeyD'); h.frame();
    near(p.aim, Math.PI / 4, 1e-9);
    h.keyUp('KeyS'); h.keyUp('KeyD'); h.frame();
    assert.equal(p.aim, 0, 'idle: aims the way he faces');
  });

  test('better suits swim faster', () => {
    const dist = suit => {
      const { h, p } = inWater({ suit });
      p.x = 800; p.y = 500;
      h.keyDown('KeyD'); h.frames(1);
      return p.x - 800;
    };
    assert.ok(dist(3) > dist(0) * 1.15);
  });

  test('he cannot swim up out of the water', () => {
    const { h, p } = inWater();
    p.y = 60;
    h.keyDown('KeyW'); h.frames(1.5);
    assert.ok(p.y >= 8);
  });

  test('dash bursts forward with a moment of invulnerability, then cools down', () => {
    const { h, p } = inWater();
    p.x = 1500; p.y = 500; p.vx = 0; p.invuln = 0;
    h.tap('KeyK');
    assert.ok(p.vx > 300, 'burst ' + p.vx);
    assert.ok(p.invuln > 0);
    assert.ok(p.dashCd > 0);
    const v = p.vx;
    h.tap('KeyK');
    assert.ok(p.vx < v, 'no second dash while cooling down');
  });

  test('a rebound swim-down key works underwater', () => {
    const { h, g, p } = inWater();
    g.Settings.bind('down', 'KeyG');
    p.x = 1500; p.y = 500;
    h.keyDown('KeyG'); h.frames(.4);
    assert.ok(p.y > 520);
  });
});

describe('air and pressure', () => {
  test('air runs down underwater and fills back up at the surface', () => {
    const { h, p, g } = inWater();
    p.x = 1500; p.y = 600;
    h.frames(3);
    assert.ok(p.air < g.SUITS[0].air - 2.5);
    p.y = 20;
    h.frames(1);
    assert.equal(p.air, g.SUITS[0].air);
  });

  test('with the tank empty, he loses a heart every second or so', () => {
    const { h, p, P } = inWater({}, { empty: true });
    p.x = 1500; p.y = 600; p.air = 0;
    const hp = P.hp;
    h.frames(2.5);
    assert.equal(P.hp, hp - 2);
  });

  test('below the suit\'s depth it buckles: hearts lost, and no diving any faster', () => {
    const { h, p, P, g } = inWater({}, { empty: true });
    p.x = 600; p.y = 1200;
    const hp = P.hp;
    h.keyDown('KeyS');
    h.frames(1.6);
    assert.equal(P.hp, hp - 1);
    assert.ok(p.vy <= 50);
    assert.ok(p.y > g.SUITS[0].depth);
  });

  test('a deeper suit holds at the same depth', () => {
    const { h, p, P } = inWater({ suit: 1 }, { empty: true });
    p.x = 600; p.y = 1200;
    const hp = P.hp;
    h.frames(3);
    assert.equal(P.hp, hp);
  });
});

describe('fighting underwater: everything fires', () => {
  // count every time the launcher goes off
  const countShots = s => { s.h.sandbox.__fired = 0; s.h.eval('(() => { const f = Dive.fire; Dive.fire = function () { __fired++; return f.call(this); }; })()'); };

  test('the harpoon flies to what it is aimed at, bites, and reels back in', () => {
    const s = inWater();
    still(s.h);
    const m = alone(s, 'shelfcrab', 1800, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.h.tap('KeyJ');
    assert.equal(s.D.shots.length, 1);
    assert.equal(s.p.harpoonOut, true);
    s.h.frames(.4);
    assert.equal(m.hp, m.maxHp - s.g.DIVE_WEAPONS[0].dmg);
    s.h.frames(1);
    assert.equal(s.D.shots.length, 0, 'reeled back in');
    assert.equal(s.p.harpoonOut, false);
  });

  test('while the harpoon is out, it cannot be fired again', () => {
    const s = inWater({}, { empty: true });
    Object.assign(s.p, { x: 1500, y: 500 });
    s.h.tap('KeyJ');
    s.h.tap('KeyJ');
    s.h.tap('KeyJ');
    assert.equal(s.D.shots.length, 1);
  });

  test('a shot that hits rock stops there; a harpoon comes back empty', () => {
    const s = inWater({}, { empty: true });
    Object.assign(s.p, { x: 600, y: 880 });
    s.h.keyDown('KeyS'); s.h.frame();
    s.h.press('KeyJ'); s.h.frame();
    s.h.keyUp('KeyS');
    const shot = s.D.shots[0];
    assert.ok(s.h.until(() => shot.back, 1), 'turned back');
    assert.ok(shot.y > 940 && shot.y < 980, 'stopped at the shelf, at ' + shot.y);
    assert.ok(s.h.until(() => !s.p.harpoonOut, 2));
  });

  test('holding fire keeps firing, and there is no ammunition to run out', () => {
    const s = inWater({ diveWeapon: 1 }, { empty: true });
    countShots(s);
    Object.assign(s.p, { x: 1500, y: 500, air: 999 });
    s.h.keyDown('KeyJ');
    s.h.frames(20);
    const w = s.g.DIVE_WEAPONS[1];
    assert.ok(s.h.sandbox.__fired >= Math.floor(20 / w.cd) - 2, 'fired ' + s.h.sandbox.__fired);
  });

  test('every launcher waits out its cooldown between shots', () => {
    const s = inWater({ diveWeapon: 3 }, { empty: true });
    countShots(s);
    const w = s.g.DIVE_WEAPONS[3];
    s.h.tap('KeyJ');
    s.h.tap('KeyJ');
    assert.equal(s.h.sandbox.__fired, 1);
    s.h.frames(w.cd + .1);
    s.h.tap('KeyJ');
    assert.equal(s.h.sandbox.__fired, 2);
  });

  test('aiming downward sends the shot down', () => {
    const s = inWater();
    const m = alone(s, 'reefgnasher', 1500, 760);
    Object.assign(s.p, { x: 1500, y: 500 });
    s.h.keyDown('KeyS'); s.h.frame();
    s.h.press('KeyJ');
    s.h.frames(.5);
    assert.ok(m.hp < m.maxHp);
  });

  test('the trident fans out three prongs at once', () => {
    const s = inWater({ diveWeapon: 1 }, { empty: true });
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.h.tap('KeyJ');
    const angles = s.D.shots.map(x => Math.atan2(x.vy, x.vx)).sort((a, b) => a - b);
    assert.equal(angles.length, 3);
    near(angles[1] - angles[0], s.g.DIVE_WEAPONS[1].spread, 1e-9);
  });

  test('the eel\'s lightning jumps from what it hits to the nearest few around it, and stuns them', () => {
    const s = inWater({ diveWeapon: 2 });
    still(s.h);
    const w = s.g.DIVE_WEAPONS[2];
    const a = alone(s, 'kelpstrangler', 1800, 500);
    const mk = (x, y) => { const m = s.D.makeMob(a.def, x, y, 1); Object.assign(m, { state: 'stun', stun: 1e9 }); return m; };
    const around = [mk(1950, 520), mk(1800, 680), mk(1680, 380), mk(1990, 360)];
    const far = mk(2600, 500);
    Object.assign(s.p, { x: 1400, y: 500, face: 1 });
    s.h.tap('KeyJ'); s.h.frames(.9);
    assert.ok(a.hp < a.maxHp, 'the one it was aimed at');
    assert.equal(around.filter(m => m.hp < m.maxHp).length, w.chain, 'jumped to ' + w.chain + ' more');
    assert.equal(far.hp, far.maxHp);
  });

  test('the narwhal tusk goes straight through a line of things', () => {
    const s = inWater({ diveWeapon: 3 });
    still(s.h);
    const first = alone(s, 'shelfcrab', 1700, 500);
    const line = [first, s.D.makeMob(first.def, 1950, 500, 1), s.D.makeMob(first.def, 2200, 500, 1)];
    for (const m of line) Object.assign(m, { state: 'stun', stun: 1e9, hp: 5000, maxHp: 5000 });
    Object.assign(s.p, { x: 1400, y: 500, face: 1 });
    s.h.tap('KeyJ'); s.h.frames(1);
    for (const m of line) assert.equal(m.hp, 5000 - s.g.DIVE_WEAPONS[3].dmg, 'each hit exactly once');
  });

  test('the bell\'s wave rolls forward, widening, through everything it passes', () => {
    const s = inWater({ diveWeapon: 4 });
    still(s.h);
    const w = s.g.DIVE_WEAPONS[4];
    const a = alone(s, 'shelfcrab', 1750, 500);
    const b = s.D.makeMob(a.def, 1950, 590, 1);
    const off = s.D.makeMob(a.def, 1500, 900, 1);
    for (const m of [a, b, off]) Object.assign(m, { state: 'stun', stun: 1e9, hp: 5000, maxHp: 5000 });
    Object.assign(s.p, { x: 1450, y: 500, face: 1 });
    s.h.tap('KeyJ');
    const r0 = s.D.shots[0].r;
    s.h.frames(.6);
    assert.ok(!s.D.shots.length || s.D.shots[0].r > r0, 'it widens');
    s.h.frames(1);
    assert.equal(a.hp, 5000 - w.dmg);
    assert.equal(b.hp, 5000 - w.dmg);
    assert.equal(off.hp, 5000);
  });

  test('aim follows the mouse while it is being used, and he turns to face it', () => {
    const s = inWater({}, { empty: true });
    Object.assign(s.p, { x: 1500, y: 500 });
    s.D._camera(0, true);
    const sx = s.p.x - s.D.cam.x, sy = s.p.y - s.D.cam.y;
    s.h.mouseMove(sx - 200, sy + 200);
    s.h.frame();
    near(s.p.aim, Math.atan2(200, -200), .05);
    assert.equal(s.p.face, -1);
    assert.equal(s.D.mouseAim, true);
    s.h.frames(5);
    assert.equal(s.D.mouseAim, false, 'after a while untouched, the keys aim again');
  });

  test('clicking fires where the mouse points', () => {
    const s = inWater({}, { empty: true });
    Object.assign(s.p, { x: 1500, y: 500 });
    s.D._camera(0, true);
    const sx = s.p.x - s.D.cam.x, sy = s.p.y - s.D.cam.y;
    s.h.click(sx, sy - 200);
    s.h.frame();
    const shot = s.D.shots[0];
    assert.ok(shot && shot.vy < -800 && Math.abs(shot.vx) < 50, 'fired upward');
  });

  test('a kill goes in the net and on the record, and the sea refills later', () => {
    const s = inWater();
    const m = alone(s, 'bladderjelly', 1650, 500);
    m.hp = 1;
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    const kills = s.P.totalKills;
    s.h.tap('KeyJ'); s.h.frames(.4);
    assert.equal(m.dead, true);
    assert.equal(s.P.catches[s.P.catches.length - 1].id, 'bladderjelly');
    assert.equal(s.P.kills.bladderjelly, 1);
    assert.equal(s.P.totalKills, kills + 1);
    assert.equal(s.D.respawns.length, 1);
    s.h.frames(2);
    assert.ok(!s.D.mobs.includes(m), 'the body sinks away');
  });

  test('the drowned charm makes what you kill worth more', () => {
    const value = luck => {
      const s = inWater({ luck });
      still(s.h);
      const m = alone(s, 'shelfcrab', 1650, 500);
      m.hp = 1;
      Object.assign(s.p, { x: 1500, y: 500, face: 1 });
      s.h.tap('KeyJ'); s.h.frames(.4);
      return s.P.catches[s.P.catches.length - 1].value;
    };
    assert.equal(value(true), Math.round(value(false) * 1.25));
  });

  test('damage numbers follow the setting underwater too', () => {
    const s = inWater();
    s.g.Settings.set('damageNumbers', false);
    const m = alone(s, 'shelfcrab', 1650, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.g.Floaters.clear();
    s.h.tap('KeyJ'); s.h.frames(.4);
    assert.ok(m.hp < m.maxHp);
    assert.equal(s.g.Floaters.list.length, 0);
  });
});
describe('what lives down there', () => {
  test('a creature drifts until he comes close, then hunts him', () => {
    const s = inWater();
    const m = alone(s, 'kelpstrangler', 1900, 500, 'drift');
    Object.assign(s.p, { x: 1000, y: 500 });
    s.D._mob(m, 1 / 60);
    assert.equal(m.state, 'drift');
    s.p.x = 1900 - m.def.aggro + 40;
    s.D._mob(m, 1 / 60);
    assert.equal(m.state, 'hunt');
  });

  test('a hunter winds up an attack from its own list, and gives up if he gets far away', () => {
    const s = inWater();
    const m = alone(s, 'gulperwidow', 1700, 1300, 'hunt');
    Object.assign(s.p, { x: 1500, y: 1300 });
    m.cool = .01;
    s.D._mob(m, .05);
    assert.equal(m.state, 'tele');
    assert.ok(s.g.attacksOf(m.def).includes(m.atk));
    const n = alone(s, 'gulperwidow', 1700, 1300, 'hunt');
    s.p.x = 1700 - n.def.aggro * 2.5;
    s.D._mob(n, .05);
    assert.equal(n.state, 'drift');
  });

  test('a bite in his path costs a heart, and invulnerability stops a second one', () => {
    const s = inWater();
    const m = alone(s, 'kelpstrangler', 1420, 500, 'bite');
    Object.assign(m, { dirX: 1, dirY: 0 });
    Object.assign(s.p, { x: 1500, y: 500, invuln: 0 });
    const hp = s.P.hp;
    s.D._mob(m, 1 / 60);
    assert.equal(s.P.hp, hp - m.def.dmg);
    s.D._mob(m, 1 / 60);
    assert.equal(s.P.hp, hp - m.def.dmg);
  });

  test('a charging body hurts on contact', () => {
    const s = inWater();
    const m = alone(s, 'shelfcrab', 1480, 500, 'charge');
    Object.assign(m, { dirX: 1, dirY: 0 });
    Object.assign(s.p, { x: 1500, y: 500, invuln: 0 });
    const hp = s.P.hp;
    s.D._mob(m, 1 / 60);
    assert.equal(s.P.hp, hp - m.def.dmg);
  });

  test('ink comes out in three globs that hurt on contact and fade away', () => {
    const s = inWater();
    const m = alone(s, 'reefgnasher', 1300, 500, 'ink');
    Object.assign(s.p, { x: 1500, y: 500, invuln: 0 });
    for (let i = 0; i < 30; i++) s.D._mob(m, 1 / 60);
    assert.equal(s.D.globs.length, 3);
    const hp = s.P.hp;
    s.D.globs[0].x = s.p.x; s.D.globs[0].y = s.p.y;
    s.D._projectiles(1 / 60);
    assert.equal(s.P.hp, hp - 1);
    for (let i = 0; i < 160; i++) s.D._projectiles(1 / 60);
    assert.equal(s.D.globs.length, 0);
  });

  test('a pulse spreads out as a ring that hurts once as it passes', () => {
    const s = inWater();
    const m = alone(s, 'bladderjelly', 1300, 500, 'tele');
    Object.assign(m, { atk: 'pulse', t: 0 });
    Object.assign(s.p, { x: 1460, y: 500, invuln: 0 });
    for (let i = 0; i < 50; i++) s.D._mob(m, 1 / 60);
    assert.equal(s.D.rings.length, 1);
    const hp = s.P.hp;
    for (let i = 0; i < 60; i++) { s.D._projectiles(1 / 60); s.p.invuln = 0; }
    assert.equal(s.P.hp, hp - 1);
  });

  test('creatures keep to their own band of water', () => {
    const s = inWater();
    const m = alone(s, 'kelpstrangler', 1500, 700, 'hunt');
    Object.assign(s.p, { x: 1500, y: 2500 });
    for (let i = 0; i < 240; i++) s.D._mob(m, 1 / 60);
    assert.ok(m.y < s.g.DIVE_ZONES[0].bottom);
  });
});

describe('coming back up', () => {
  test('the ladder prompt only shows at the surface by the bow', () => {
    const { D, p, g } = inWater();
    Object.assign(p, { x: g.DIVE_LADDER_X + 30, y: 40 });
    assert.equal(D.atLadder(), true);
    p.y = 300;
    assert.equal(D.atLadder(), false);
    Object.assign(p, { x: g.DIVE_LADDER_X - 500, y: 40 });
    assert.equal(D.atLadder(), false);
  });

  test('E at the ladder climbs back aboard with the haul, and saves', () => {
    const { h, g, D, p, P } = inWater();
    P.catches.push(g.makeTrophy(g.monsterDef('shelfcrab')));
    Object.assign(p, { x: g.DIVE_LADDER_X, y: 40 });
    h.storage.clear();
    h.tap('KeyE');
    assert.equal(D.phase, 'climb');
    assert.ok(h.until(() => g.Game.state === 'play', 3));
    assert.equal(D.underwater, false);
    assert.equal(P.x, g.DIVE_X);
    assert.match(g.Game.toastText, /1 in the net/);
    assert.equal(JSON.parse(h.storage.get('deepsupper.save.v1')).catches.length, 1);
    assert.equal(g.Cam.locked, false);
  });

  test('blacking out loses only what was caught on this dive', () => {
    const s = inWater({}, {});
    const { h, g, D, P } = s;
    D.reset();
    P.catches.push(g.makeTrophy(g.monsterDef('gnashfin')));
    g.Game.state = 'dive'; D.start(); D.enterWater();
    P.catches.push(g.makeTrophy(g.monsterDef('shelfcrab')));
    P.hp = 1; D.p.invuln = 0;
    D.hurtPlayer(1, D.p.x + 5, D.p.y);
    assert.equal(D.phase, 'blackout');
    const said = F.wakeOnDeck(h);
    assert.deepEqual(plain(P.catches.map(c => c.id)), ['gnashfin']);
    assert.equal(P.hp, P.maxHp);
    assert.ok(said.some(l => /still down there/.test(l)), 'what the sea kept: ' + said.join(' | '));
  });

  test('returning to the title or loading a save ends the dive cleanly', () => {
    const { g, D } = inWater();
    g.Game.atSea();
    assert.equal(D.underwater, false);
    assert.equal(D.phase, 'off');
    assert.equal(D.mobs.length, 0);
  });
});

describe('the Mother Below', () => {
  // at the bottom, geared, with nothing else about
  function nearGate(gear, opts) {
    const s = inWater(Object.assign({ suit: 3, diveWeapon: 0, maxHp: 9, hp: 9 }, gear), Object.assign({ empty: true }, opts));
    Object.assign(s.p, { x: s.g.CITY_X - 1300, y: 3500, air: 999 });
    return s;
  }
  // skip her speech and start the fight
  function fighting(gear, opts) {
    const s = nearGate(gear, opts);
    s.D.startMother();
    s.g.CUT.skip();
    s.B = s.D.boss;
    return s;
  }

  test('swimming up to the gate at the bottom starts her scene', () => {
    const s = nearGate();
    s.h.frame();
    assert.equal(s.D.boss, null, 'not from out here');
    s.p.x = s.g.CITY_X - 900;
    s.h.frame();
    assert.ok(s.D.boss);
    assert.equal(s.D.phase, 'scene');
    assert.equal(s.D.girl.visible, true);
  });

  test('she does not come for you higher up, or once she is beaten', () => {
    const s = nearGate();
    Object.assign(s.p, { x: s.g.CITY_X, y: 2800 });
    s.h.frame();
    assert.equal(s.D.boss, null);
    const t = nearGate({ beatMother: true });
    t.p.x = t.g.CITY_X;
    t.h.frames(.5);
    assert.equal(t.D.boss, null);
  });

  test('the first time, Nerys explains; after that, it goes straight to the fight', () => {
    const s = nearGate();
    s.D.startMother();
    const lines = [];
    for (let i = 0; i < 60 * 40 && s.D.phase === 'scene'; i++) {
      if (s.g.Dialogue.active && s.g.Dialogue.done && s.g.Dialogue.hold > .05 && lines[lines.length - 1] !== s.g.Dialogue.full) { lines.push(s.g.Dialogue.full); s.h.press('Enter'); }
      s.h.frame();
    }
    assert.match(lines.join(' '), /her child/);
    assert.equal(s.D.phase, 'swim');
    assert.equal(s.D.boss.state, 'idle');
    s.D.boss = null;
    s.D.startMother();
    let said = false;
    for (let i = 0; i < 60 * 5 && s.D.phase === 'scene'; i++) { said = said || s.g.Dialogue.active; s.h.frame(); }
    assert.equal(said, false);
    assert.equal(s.D.phase, 'swim');
  });

  test('once it starts, the current holds you in front of the gate', () => {
    const s = fighting();
    s.p.x = s.g.CITY_X - 700;
    s.h.keyDown('KeyA'); s.h.frames(2);
    assert.ok(s.p.x >= s.g.CITY_X - s.g.MOTHER_ARENA.w / 2);
  });

  test('she gets worse below two thirds and a third, with a banner each time, and never better', () => {
    const s = fighting();
    const B = s.B;
    assert.deepEqual(plain(s.D.motherPool()).includes('brood'), false);
    B.hp = B.maxHp * .6; s.D._bossPhase();
    assert.equal(B.phase, 2);
    assert.equal(s.D.banner.text, 'SHE IS NOT PLAYING');
    assert.ok(s.D.motherPool().includes('whirlpool'));
    B.hp = B.maxHp * .2; s.D._bossPhase();
    assert.equal(B.phase, 3);
    assert.equal(s.D.banner.text, 'LANTHORNE GOES DARK');
    B.hp = B.maxHp; s.D._bossPhase();
    assert.equal(B.phase, 3);
  });

  test('her lunging maw bites', () => {
    const s = fighting();
    const B = s.B;
    Object.assign(B, { state: 'maw', t: 0, face: -1, x: s.p.x + B.def.len * .44, y: s.p.y, dirX: -1, dirY: 0 });
    s.p.invuln = 0;
    const hp = s.P.hp;
    s.D._boss(1 / 60);
    assert.ok(s.P.hp < hp);
  });

  test('her sweep scythes one depth: it hits there and misses above it', () => {
    const hit = offset => {
      const s = fighting();
      const B = s.B;
      Object.assign(B, { state: 'sweep', t: .3, sweepY: s.p.y + offset, sweepDir: 1, sweepX: s.p.x - 20 });
      s.p.invuln = 0;
      const hp = s.P.hp;
      s.D._boss(1 / 60);
      return hp - s.P.hp;
    };
    assert.ok(hit(0) > 0);
    assert.equal(hit(-120), 0);
  });

  test('her pulse is one ring, and two once she is desperate', () => {
    for (const [phase, rings] of [[1, 1], [3, 2]]) {
      const s = fighting();
      Object.assign(s.B, { state: 'pulse', t: 0, pulses: 0, phase });
      for (let i = 0; i < 60; i++) s.D._boss(1 / 60);
      assert.equal(s.D.rings.filter(r => r.from === 'mob').length, rings, 'phase ' + phase);
    }
  });

  test('she spits out broodlings, never more than six at once', () => {
    const s = fighting();
    for (let k = 0; k < 4; k++) s.D._brood();
    const brood = s.D.mobs.filter(m => m.def.id === 'broodling');
    assert.equal(brood.length, 6);
    assert.ok(brood.every(m => m.state === 'hunt'));
  });

  test('her whirlpool drags him toward her mouth until he swims against it', () => {
    const s = fighting();
    const B = s.B;
    Object.assign(B, { state: 'whirlpool', t: 0, face: -1, x: s.p.x + 700, y: s.p.y });
    const x = s.p.x;
    s.D._skillWhirl();
    s.h.frames(.8);
    assert.ok(s.p.x > x + 10, 'pulled toward her: ' + (s.p.x - x));
    assert.equal(s.g.Skill.active.kind, 'hold');
  });

  test('every weapon can hurt her, but nothing moves her much, and the eel cannot stun her', () => {
    for (const w of [0, 2, 3, 4]) {
      const s = fighting({ diveWeapon: w });
      still(s.h);
      const B = s.B;
      Object.assign(B, { state: 'rest', t: 0, restDur: 99, x: s.p.x + 330, y: s.p.y, vx: 0, vy: 0 });
      s.p.face = 1;
      s.h.tap('KeyJ'); s.h.frames(1.2);
      assert.ok(B.hp < B.maxHp, 'weapon ' + w);
      assert.notEqual(B.state, 'stun');
      assert.ok(Math.abs(B.vx) < 80, 'knocked back ' + B.vx);
    }
  });

  test('killing her: the young go with her, she sinks, and Nerys closes part two', () => {
    const s = fighting();
    s.D._brood();
    const B = s.B;
    B.hp = 1;
    Object.assign(B, { state: 'rest', t: 0, restDur: 99, x: s.p.x + 330, y: s.p.y });
    s.p.face = 1;
    s.h.tap('KeyJ'); s.h.frames(.3);
    assert.equal(B.dead, true);
    assert.equal(s.D.phase, 'scene');
    assert.ok(s.D.mobs.filter(m => m.def.spawnOnly).every(m => m.dead));
    assert.equal(s.P.catches[s.P.catches.length - 1].id, 'mother');
    assert.equal(s.P.kills.mother, 1);
    s.h.frame();
    assert.equal(s.g.Music.themeName, 'lanthorne');
    let title = null;
    for (let i = 0; i < 60 * 60 && s.D.phase === 'scene'; i++) {
      if (s.g.CUT.titleCard) title = s.g.CUT.titleCard.title;
      if (s.g.Dialogue.active && s.g.Dialogue.done && s.g.Dialogue.hold > .1) s.h.press('Enter');
      s.h.frame();
    }
    assert.equal(title, 'END OF PART TWO');
    assert.equal(s.P.beatMother, true);
    assert.equal(s.D.boss, null);
    assert.equal(s.D.phase, 'swim');
    assert.equal(JSON.parse(s.h.storage.get('deepsupper.save.v1')).beatMother, true);
  });

  test('blacking out against her ends the encounter, to be tried again next dive', () => {
    const s = fighting();
    s.P.hp = 1; s.p.invuln = 0;
    s.D.hurtPlayer(1, s.p.x + 10, s.p.y);
    F.wakeOnDeck(s.h);
    assert.equal(s.D.boss, null);
    assert.equal(s.P.beatMother, false);
  });

  test('music: the abyss while she fights', () => {
    const s = fighting();
    s.h.frame();
    assert.equal(s.g.Music.themeName, 'abyss');
  });

  test('the test shortcut puts you at the bottom, geared, short of the gate', () => {
    const { h, g } = loadGame({ draw: false, seed: 2 });
    g.Game.devMother();
    assert.ok(h.until(() => g.Dive.underwater && g.Game.fade.dir === 0, 3));
    assert.equal(g.Player.suit, g.SUITS.length - 1);
    assert.equal(g.Player.diveWeapon, g.DIVE_WEAPONS.length - 1);
    assert.equal(g.Dive.boss, null);
    assert.ok(g.Dive.p.y > 3300);
  });

  test('her health bar, and the banners, are on the HUD', () => {
    const s = fighting({}, { draw: true });
    s.h.sandbox.__text = [];
    s.h.eval('(() => { const f = Text.draw; Text.draw = function (g, t, ...a) { __text.push(String(t)); return f.call(this, g, t, ...a); }; })()');
    s.B.hp = s.B.maxHp * .5; s.D._bossPhase();
    s.h.frame();
    assert.ok(s.h.sandbox.__text.includes('THE MOTHER BELOW'));
    assert.ok(s.h.sandbox.__text.includes('PHASE 2'));
    assert.ok(s.h.sandbox.__text.includes('SHE IS NOT PLAYING'));
  });
});

describe('the diving HUD', () => {
  function withText(gear) {
    const s = inWater(gear, { draw: true, empty: true });
    s.h.sandbox.__text = [];
    s.h.eval('(() => { const f = Text.draw; Text.draw = function (g, t, ...a) { __text.push(String(t)); return f.call(this, g, t, ...a); }; })()');
    return s;
  }
  const saw = (s, re) => s.h.sandbox.__text.some(t => re.test(t));

  test('shows depth in fathoms, the zone, the suit limit and the weapon', () => {
    const s = withText();
    Object.assign(s.p, { x: 1500, y: 600 });
    s.D.firstDive = false;
    s.h.frame();
    assert.ok(saw(s, /^12 fm$/));
    assert.ok(saw(s, /^The Shelf$/));
    assert.ok(saw(s, /suit holds to 19 fm/));
    assert.ok(saw(s, /Drowned Harpoon/));
    assert.ok(saw(s, /^AIR$/));
  });

  test('warns when too deep, when air is low, and points to the boat', () => {
    const s = withText();
    Object.assign(s.p, { x: 600, y: 1300 });
    s.D._camera(0, true);
    s.h.frame();
    assert.ok(saw(s, /TOO DEEP/));
    assert.ok(saw(s, /^BOAT$/));
    s.h.sandbox.__text.length = 0;
    Object.assign(s.p, { x: 1500, y: 600, air: 5 });
    s.h.frame();
    assert.ok(saw(s, /Low on air/));
  });

  test('at the ladder it says how to climb aboard', () => {
    const s = withText();
    Object.assign(s.p, { x: s.g.DIVE_LADDER_X, y: 40 });
    s.h.frame();
    assert.ok(saw(s, /\[E\] Climb aboard/));
  });

  test('the first dive teaches the controls, using the current key bindings', () => {
    const s = withText();
    s.g.Settings.bind('attack', 'KeyL');
    Object.assign(s.p, { x: 1500, y: 300 });
    s.h.frame();
    assert.ok(saw(s, /WASD swim .*\[L\] or click: fire/));
  });
});

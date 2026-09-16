'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near, plain } = require('../helpers/harness');

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
  function atBow() {
    const h = loadGame({ draw: false, seed: 7 });
    h.startVoyage();
    Object.assign(h.g.Player, { beatBoss: true, suit: 0, diveWeapon: 0, weapon: 0, x: h.g.FISH_X });
    return { h, g: h.g, D: h.g.Dive };
  }

  test('once there is a suit, the bow station is for diving', () => {
    const { h, g } = atBow();
    assert.equal(g.Game.spotLabel({ id: 'fish' }), 'Dive');
    h.tap('KeyE');
    assert.equal(g.Game.state, 'dive');
    assert.equal(g.Dive.phase, 'gear');
  });

  test('suiting up frames the bow, puts the suit on, then runs at the rail', () => {
    const { h, g, D } = atBow();
    h.tap('KeyE');
    assert.equal(g.Cam.locked, true);
    assert.equal(g.Cam.x, g.BOAT_R - g.VIEW_W);
    assert.equal(D.suited, false);
    h.frames(.7);
    assert.equal(D.suited, true);
    h.frames(.9);
    assert.equal(D.phase, 'leap');
  });

  test('the leap carries him over the rail and into the water, then down', () => {
    const { h, g, D } = atBow();
    h.tap('KeyE');
    h.until(() => D.phase === 'leap', 3);
    h.frames(.6);
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
    const { h, g, D } = atBow();
    h.tap('KeyE');
    h.frame();
    assert.equal(g.Music.themeName, 'sea');
    h.until(() => D.underwater, 5);
    h.frame();
    assert.equal(g.Music.themeName, 'dive');
  });

  test('ESC only pauses once he is swimming', () => {
    const { h, g, D } = atBow();
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

describe('fighting underwater', () => {
  test('the harpoon hits what is in front of him, once per thrust', () => {
    const s = inWater();
    still(s.h);
    const m = alone(s, 'shelfcrab', 1600, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.h.tap('KeyJ');
    s.h.frames(.3);
    assert.equal(m.hp, m.maxHp - s.g.DIVE_WEAPONS[0].dmg);
  });

  test('...and not what is behind him', () => {
    const s = inWater();
    const m = alone(s, 'shelfcrab', 1380, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.h.tap('KeyJ');
    s.h.frames(.4);
    assert.equal(m.hp, m.maxHp);
  });

  test('stabbing downward hits something below', () => {
    const s = inWater();
    const m = alone(s, 'reefgnasher', 1500, 620);
    Object.assign(s.p, { x: 1500, y: 500 });
    s.h.keyDown('KeyS');
    s.h.frame();
    s.h.press('KeyJ');
    s.h.frames(.3);
    assert.ok(m.hp < m.maxHp);
  });

  test('attacks have a cooldown', () => {
    const s = inWater();
    const w = s.g.DIVE_WEAPONS[0];
    s.h.tap('KeyJ');
    s.h.frames(w.cd * .5 + .3);
    assert.equal(s.p.atk, null);
    s.h.tap('KeyJ');
    assert.equal(s.p.atk, null, 'still cooling down');
    s.h.frames(w.cd);
    s.h.tap('KeyJ');
    assert.ok(s.p.atk);
  });

  test('the eel lashes the nearest few things around him and stuns them', () => {
    const s = inWater({ diveWeapon: 2 });
    still(s.h);
    const w = s.g.DIVE_WEAPONS[2];
    const a = alone(s, 'kelpstrangler', 1600, 500);
    const others = [[1500, 640], [1380, 500], [1500, 380]].map(([x, y]) => {
      const m = s.D.spawn(1, null);
      Object.assign(m, { def: a.def, hp: a.def.hp, maxHp: a.def.hp, x, y, state: 'stun', stun: 1e9 });
      return m;
    });
    const far = s.D.spawn(1, null);
    Object.assign(far, { def: a.def, hp: a.def.hp, maxHp: a.def.hp, x: 2200, y: 500, state: 'stun', stun: 1e9 });
    Object.assign(s.p, { x: 1500, y: 500 });
    s.h.tap('KeyJ'); s.h.frames(.2);
    const hit = [a].concat(others).filter(m => m.hp < m.maxHp);
    assert.equal(hit.length, w.chain);
    assert.equal(far.hp, far.maxHp);
    assert.ok(s.D.zaps.length >= w.chain, 'lightning drawn to each');
  });

  test('the narwhal tusk carries him through the thing in front, untouchable', () => {
    const s = inWater({ diveWeapon: 3 });
    const m = alone(s, 'shelfcrab', 1680, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1, invuln: 0 });
    s.h.tap('KeyJ');
    assert.ok(s.p.invuln > .3);
    s.h.frames(.35);
    assert.ok(s.p.x > 1600, 'moved to ' + s.p.x);
    assert.ok(m.hp < m.maxHp);
  });

  test('the sunken bell rings out through everything nearby, once each', () => {
    const s = inWater({ diveWeapon: 4 });
    still(s.h);
    const w = s.g.DIVE_WEAPONS[4];
    const near1 = alone(s, 'shelfcrab', 1650, 500);
    const near2 = s.D.spawn(1, null);
    Object.assign(near2, { def: near1.def, hp: 2000, maxHp: 2000, x: 1500, y: 720, state: 'stun', stun: 1e9 });
    const far = s.D.spawn(1, null);
    Object.assign(far, { def: near1.def, hp: 2000, maxHp: 2000, x: 2300, y: 500, state: 'stun', stun: 1e9 });
    near1.hp = near1.maxHp = 2000;
    Object.assign(s.p, { x: 1500, y: 500 });
    s.h.tap('KeyJ'); s.h.frames(.8);
    assert.equal(near1.hp, 2000 - w.dmg);
    assert.equal(near2.hp, 2000 - w.dmg);
    assert.equal(far.hp, 2000);
  });

  test('a kill goes in the net and on the record, and the sea refills later', () => {
    const s = inWater();
    const m = alone(s, 'bladderjelly', 1600, 500);
    m.hp = 1;
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    const kills = s.P.totalKills;
    s.h.tap('KeyJ'); s.h.frames(.3);
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
      const m = alone(s, 'shelfcrab', 1600, 500);
      m.hp = 1;
      Object.assign(s.p, { x: 1500, y: 500, face: 1 });
      s.h.tap('KeyJ'); s.h.frames(.3);
      return s.P.catches[s.P.catches.length - 1].value;
    };
    assert.equal(value(true), Math.round(value(false) * 1.25));
  });

  test('damage numbers follow the setting underwater too', () => {
    const s = inWater();
    s.g.Settings.set('damageNumbers', false);
    const m = alone(s, 'shelfcrab', 1600, 500);
    Object.assign(s.p, { x: 1500, y: 500, face: 1 });
    s.g.Floaters.clear();
    s.h.tap('KeyJ'); s.h.frames(.3);
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
    assert.ok(m.def.atk.includes(m.atk));
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
    assert.equal(P.x, g.FISH_X);
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
    assert.ok(h.until(() => g.Game.state === 'play', 3));
    assert.deepEqual(plain(P.catches.map(c => c.id)), ['gnashfin']);
    assert.equal(P.hp, P.maxHp);
    assert.match(g.Game.toastText, /kept what you caught/);
  });

  test('returning to the title or loading a save ends the dive cleanly', () => {
    const { g, D } = inWater();
    g.Game.atSea();
    assert.equal(D.underwater, false);
    assert.equal(D.phase, 'off');
    assert.equal(D.mobs.length, 0);
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
    assert.ok(saw(s, /WASD swim .*\[L\] attack/));
  });
});

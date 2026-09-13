'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, near } = require('../helpers/harness');

// standing at the bow with the dip net, line not yet cast
function atBow(opts) {
  opts = Object.assign({ draw: false, seed: 9 }, opts);
  const h = loadGame(opts);
  h.startVoyage();
  const g = h.g;
  g.Player.weapon = 0;
  g.Player.x = g.FISH_X;
  if (opts.veteran) { g.Player.totalKills = 1; g.Player.introDone = true; }
  g.Game.state = 'fish';
  g.Fishing.start();
  return { h, g, F: g.Fishing, P: g.Player };
}
const step = (F, seconds, dt) => { dt = dt || 1 / 60; for (let i = 0; i < Math.round(seconds / dt); i++) F.update(dt); };
const runTo = (F, phase, seconds) => { const dt = 1 / 60; for (let i = 0; i < (seconds || 20) / dt && F.phase !== phase; i++) F.update(dt); return F.phase === phase; };

describe('casting', () => {
  test('the very first cast is the scripted intro', () => {
    assert.equal(atBow().F.intro, true);
  });

  test('after the first kill, casts are ordinary', () => {
    assert.equal(atBow({ veteran: true }).F.intro, false);
  });

  test('start locks the camera, faces the sea and resets the hook', () => {
    const { g, F, P } = atBow();
    assert.equal(g.Cam.locked, true);
    assert.equal(P.face, 1);
    assert.equal(F.phase, 'cast');
    assert.ok(F.hook.depth < 0);
    assert.equal(g.Game.viewY, 0);
  });

  test('the intro goes to 300; other casts go to the rod\'s depth', () => {
    assert.equal(atBow().F.targetDepth, 300);
    for (let rod = 0; rod < 4; rod++) {
      const { g, F } = atBow({ veteran: true, seed: rod + 20 });
      g.Player.rod = rod;
      F.start();
      const max = g.ROD_DEPTH[rod];
      assert.ok(F.targetDepth >= max * .86 - 1e-9 && F.targetDepth <= max, 'rod ' + rod + ' depth ' + F.targetDepth);
    }
  });

  test('better rods fill the dark with more shapes', () => {
    const { g, F } = atBow({ veteran: true });
    const counts = [0, 1, 2, 3].map(r => { g.Player.rod = r; F.start(); return F.shapes.length; });
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1]);
  });

  test('the line lands in the water after the cast arc, then sinks', () => {
    const { F } = atBow();
    step(F, .7);
    assert.equal(F.phase, 'cast');
    step(F, .2);
    assert.equal(F.phase, 'sink');
  });

  test('the line sinks all the way to the target depth and holds there', () => {
    const { F } = atBow({ veteran: true });
    assert.ok(runTo(F, 'deep', 10));
    near(F.hook.depth, F.targetDepth, 8);
  });

  test('the view follows the hook down into the water', () => {
    const { g, F } = atBow({ veteran: true });
    runTo(F, 'deep', 10);
    step(F, 1);
    assert.ok(g.Game.viewY > 100, 'viewY ' + g.Game.viewY);
    assert.ok(F._wantView() > 0);
  });
});

describe('waiting and biting', () => {
  test('on the intro, a small ordinary fish bites first', () => {
    const { F } = atBow();
    assert.ok(runTo(F, 'bite', 15));
    assert.equal(F.target.id, 'minnow');
  });

  test('ordinary casts hook something the rod can reach', () => {
    const { F } = atBow({ veteran: true });
    assert.ok(runTo(F, 'bite', 20));
    assert.ok(F.target.junk || F.target.depth <= 1);
  });

  test('the storm lantern makes bites come faster', () => {
    const wait = lantern => {
      const { g, F } = atBow({ veteran: true, seed: 31 });
      g.Player.lantern = lantern;
      F.start();
      runTo(F, 'deep', 10);
      return F.waitFor;
    };
    assert.ok(wait(true) < wait(false));
  });

  test('miss the bite and it spits the hook, then you wait again', () => {
    const { F } = atBow({ veteran: true });
    runTo(F, 'bite', 20);
    step(F, 1.2);
    assert.equal(F.phase, 'fail');
    assert.match(F.msg, /spat/);
    step(F, 1.7);
    assert.equal(F.phase, 'deep');
  });

  test('setting the hook on a monster starts the reel', () => {
    const { h, F } = atBow();
    runTo(F, 'bite', 15);
    h.press('KeyE');
    F.update(1 / 60);
    assert.equal(F.phase, 'reel');
  });

  test('junk comes straight up, pays out, and the line goes back down', () => {
    const { h, g, F, P } = atBow({ veteran: true });
    runTo(F, 'bite', 20);
    F.target = { junk: true, name: 'a boot', value: 5, icon: 'boot' };
    h.press('KeyE'); F.update(1 / 60); g.Input.endFrame();
    assert.equal(F.phase, 'junk');
    const coins = P.coins;
    step(F, 2.4);
    assert.equal(P.coins, coins + 5);
    assert.equal(F.phase, 'sink');
  });

  test('the interact key puts the rod down while waiting', () => {
    const { h, g, F } = atBow({ veteran: true });
    runTo(F, 'deep', 10);
    h.press('KeyE');
    F.update(1 / 60);
    assert.equal(g.Game.state, 'play');
    assert.equal(g.Cam.locked, false);
    assert.equal(g.Game.viewY, 0);
  });
});

describe('the reel minigame', () => {
  function reeling(target, opts) {
    const s = atBow(Object.assign({ veteran: true }, opts));
    s.F.target = target || s.g.MONSTERS[0];
    s.F.hook.depth = s.F.targetDepth;       // hooked down at the bottom of the line
    s.F._beginReel();
    return s;
  }

  test('a small fish gets a big bar and starts low', () => {
    const { g, F } = reeling(null, { veteran: false });
    F.target = g.MINNOW; F._beginReel();
    near(F.barFrac, 190 / 300);
    near(F.prog, .15);
    near(F.fSpeed, .12);
  });

  test('monsters use the rod\'s bar and get faster with depth', () => {
    const { g, F } = reeling();
    near(F.barFrac, g.RODS[0].bar / 300);
    const shallow = F.fSpeed;
    F.target = g.MONSTERS.find(m => m.depth === 4 && !m.boss); F._beginReel();
    assert.ok(F.fSpeed > shallow);
    const deep = F.fSpeed;
    F.target = g.MONSTERS.find(m => m.boss); F._beginReel();
    assert.ok(F.fSpeed > deep, 'the boss fights hardest');
  });

  test('the intro monster is a little gentler than a normal one', () => {
    const intro = atBow();
    intro.F.target = intro.g.MONSTERS[0]; intro.F._beginReel();
    const normal = reeling();
    near(intro.F.fSpeed, normal.F.fSpeed * .85, 1e-9);
  });

  test('the fish can never leave the part of the gauge the bar can reach', () => {
    const { F } = reeling(null, { seed: 77 });
    const half = F.barFrac / 2;
    for (let i = 0; i < 60 * 20 && F.phase === 'reel'; i++) {
      F.update(1 / 60);
      assert.ok(F.fy >= half - 1e-9 && F.fy <= 1 - half + 1e-9, 'fy ' + F.fy);
      assert.ok(F.by >= half - 1e-9 && F.by <= 1 - half + 1e-9, 'by ' + F.by);
    }
  });

  test('a fish pinned at the very bottom is still catchable with the bar at the bottom', () => {
    const { F } = reeling();
    F.fTarget = 1; F.fTimer = 1e9; F.fy = .99; F.by = 1; F.bvy = 0;
    const start = F.prog;
    for (let i = 0; i < 60; i++) { F.fTimer = 1e9; F.fTarget = 1; F.update(1 / 60); }
    assert.ok(F.prog > start, 'progress went from ' + start + ' to ' + F.prog);
  });

  test('holding the reel key lifts the bar, letting go drops it', () => {
    const { h, F } = reeling();
    F.by = .6; F.bvy = 0;
    h.keyDown('Space');
    step(F, .3);
    assert.ok(F.by < .6);
    h.keyUp('Space');
    const up = F.by;
    step(F, .6);
    assert.ok(F.by > up);
  });

  test('the interact binding reels too', () => {
    const { h, F } = reeling();
    F.by = .6; F.bvy = 0;
    h.keyDown('KeyE');
    step(F, .3);
    assert.ok(F.by < .6);
  });

  test('keeping the fish in the bar lands it', () => {
    const { h, F } = reeling();
    h.autoReel(40);
    assert.equal(F.phase, 'pull');
  });

  test('losing it for too long snaps the line', () => {
    const { F } = reeling();
    for (let i = 0; i < 60 * 30 && F.phase === 'reel'; i++) { F.fy = F.barFrac / 2; F.by = 1 - F.barFrac / 2; F.update(1 / 60); }
    assert.equal(F.phase, 'fail');
    assert.match(F.msg, /slack/);
  });

  test('the hook climbs the water column as progress fills', () => {
    const { F } = reeling();
    F.prog = .9; F.fy = .5; F.by = .5;
    F.update(1 / 60);
    assert.ok(F.hook.depth < F.startDepth * .2, 'depth ' + F.hook.depth);
  });
});

describe('the underwater ambush', () => {
  function minnowOnLine() {
    const s = atBow();
    runTo(s.F, 'bite', 15);
    s.h.press('KeyE'); s.F.update(1 / 60); s.g.Input.endFrame();
    return s;
  }

  test('halfway up, the small fish stops being the catch', () => {
    const { h, F } = minnowOnLine();
    h.autoReel(20);
    assert.equal(F.phase, 'ambush');
    assert.ok(F.prog >= .45 && F.prog < .6);
  });

  test('nothing happens for a moment, then a warning, then it strikes', () => {
    const { F } = minnowOnLine();
    F._startAmbush();
    step(F, 1);
    assert.equal(F.warned, false);
    assert.equal(F.eaten, false);
    step(F, .2);
    assert.equal(F.warned, true);
    assert.equal(F.eaten, false);
    step(F, 1.2);
    assert.equal(F.eaten, true);
  });

  test('the Gnashfin eats the small fish and takes the line', () => {
    const { g, F } = minnowOnLine();
    F._startAmbush();
    step(F, 2.4);
    assert.equal(F.target, g.MONSTERS[0]);
    assert.match(F.msg, /Something else/);
  });

  test('it dives about 150px deeper with the hook', () => {
    const { F } = minnowOnLine();
    F._startAmbush();
    step(F, 2.35);
    const from = F.yankFrom;
    step(F, 1);
    near(F.hook.depth, from + 150, 1);
  });

  test('then you have to reel the monster up', () => {
    const { g, F } = minnowOnLine();
    F._startAmbush();
    step(F, 3.7);
    assert.equal(F.phase, 'ambush');
    assert.ok(runTo(F, 'reel', .3));
    assert.equal(F.target, g.MONSTERS[0]);
    near(F.prog, .34);
  });

  test('the ambusher comes in from the open water on the left', () => {
    const { F } = minnowOnLine();
    F._startAmbush();
    assert.equal(F.ambushFrom, -1);
  });

  test('landing it hauls the monster aboard and starts the fight', () => {
    const { g, F, P } = minnowOnLine();
    F.target = g.MONSTERS[0]; F.phase = 'pull'; F.t = 0;
    step(F, 2);
    assert.equal(g.Game.state, 'battle');
    assert.equal(g.Battle.def.id, 'gnashfin');
    assert.equal(P.introDone, true);
    assert.equal(g.Game.viewY, 0);
  });

  test('a normal catch does not touch the intro flag', () => {
    const { g, F, P } = atBow({ veteran: true });
    P.introDone = false;
    F.intro = false;
    F.target = g.MONSTERS[1]; F.phase = 'pull'; F.t = 0;
    step(F, 2);
    assert.equal(P.introDone, false);
    assert.equal(g.Battle.def.id, 'bristlejaw');
  });
});

describe('rod pose', () => {
  test('rod angle and bend react to every phase', () => {
    const { F } = atBow();
    const pose = {};
    for (const phase of ['cast', 'sink', 'deep', 'bite', 'reel', 'ambush', 'pull', 'junk', 'fail']) {
      F.phase = phase; F.t = .3; F.eaten = false;
      const a = F.rodAngle(), b = F.rodBend();
      assert.ok(Number.isFinite(a) && Number.isFinite(b), phase);
      pose[phase] = b;
    }
    assert.ok(pose.pull > pose.deep && pose.reel > pose.deep);
    F.phase = 'ambush'; F.eaten = true;
    assert.ok(F.rodBend() > pose.ambush, 'the rod bends harder once it has the line');
  });
});

'use strict';
/* Whole frames through the real renderer: every screen of the game drawn
   into the recording canvas, through the full hires -> buffer -> screen
   pipeline. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');
const F = require('../helpers/flows');

// counts calls to an Art/Text function inside the sandbox
function spy(h, path) {
  const name = '__spy_' + path.replace(/\W/g, '_');
  h.sandbox[name] = { n: 0, args: [] };
  const wrap = `function (...a) { ${name}.n++; a.world = typeof __inWorld !== 'undefined' && __inWorld > 0; ${name}.args.push(a); return f.apply(this, a); }`;
  if (path.includes('.')) {
    const [obj, key] = path.split('.');
    h.eval(`(() => { const f = ${obj}.${key}; ${obj}.${key} = ${wrap}; })()`);
  } else {
    h.eval(`(() => { const f = ${path}; ${path} = ${wrap}; })()`);   // a global function
  }
  return h.sandbox[name];
}

function frameIsSound(h, label) {
  const rec = h.hires();
  rec.reset();
  const shown = h.ctx.calls.drawImage || 0;
  assert.doesNotThrow(() => h.frame(), label);
  assert.equal(rec.depth(), 0, label + ': unbalanced save/restore');
  assert.equal(rec.minDepth(), 0, label + ': extra restore');
  assert.equal((h.ctx.calls.drawImage || 0) - shown, 1, label + ': not presented');
}

describe('every screen renders', () => {
  test('title menu and each options screen', () => {
    const h = loadGame({ seed: 1 });
    for (const id of [null, 'options', 'graphics', 'audio', 'controls', 'gameplay', 'credits']) {
      if (id) { h.g.Menu.stack = ['main', id]; }
      frameIsSound(h, 'menu ' + (id || 'main'));
    }
  });

  test('the opening, sampled all the way through', () => {
    const h = loadGame({ seed: 1 });
    h.g.Game.newGame();
    for (let s = 0; s < 70 && h.g.Game.state === 'cutscene'; s++) {
      h.frames(1, 1 / 10);
      frameIsSound(h, 'opening at step ' + h.g.CUT.i);
    }
  });

  test('the deck, with markers, HUD, a toast and a line of dialogue', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[0]));
    h.g.Player.bandages = 2;
    h.g.Game.toast('A toast.');
    frameIsSound(h, 'deck');
    h.g.Game.say(['You', 'A long line of dialogue that needs to wrap across more than one line of the box.']);
    h.frames(2);
    frameIsSound(h, 'dialogue');
  });

  test('fishing, in every phase, with the view panned underwater', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.g.Player.weapon = 0;
    F.castLine(h);
    const seen = new Set();
    for (let i = 0; i < 60 * 40 && h.g.Game.state === 'fish'; i++) {
      const ph = h.g.Fishing.phase;
      if (!seen.has(ph)) { seen.add(ph); frameIsSound(h, 'fishing ' + ph); }
      if (ph === 'bite') h.press('KeyE');
      if (ph === 'reel') h.g.Fishing.by = h.g.Fishing.fy;
      h.frame();
    }
    for (const ph of ['cast', 'sink', 'deep', 'bite', 'reel', 'ambush', 'pull']) assert.ok(seen.has(ph), 'never drew ' + ph);
  });

  test('a boss fight in its last phase, mid-attack', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.g.Player.weapon = 4;
    h.g.Game.startBattle(h.g.MONSTERS.find(m => m.boss));
    h.frames(2.5);
    const B = h.g.Battle;
    B.m.hp = B.m.maxHp * .2;
    B._checkBossPhase();
    B.globs.push({ x: 500, y: 300, vx: 10, vy: 0, r: 12, t: 0 });
    B.waves.push({ x: 600, dir: 1, t: 0 });
    for (let i = 0; i < 20; i++) { h.frames(.2); frameIsSound(h, 'boss ' + B.m.state); }
  });

  test("Dorran's stall, every tab", () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[0]), h.g.makeTrophy(h.g.MONSTERS[1]));
    h.g.Shop.open();
    for (let t = 0; t < 3; t++) { frameIsSound(h, 'shop tab ' + t); h.tap('ArrowRight'); }
  });

  test('the pause menu over the game, and the ending', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.tap('Escape');
    frameIsSound(h, 'pause');
    h.g.Game.resume();
    h.g.Game.startEnding();
    for (let i = 0; i < 12; i++) { h.frames(2, 1 / 10); frameIsSound(h, 'ending'); }
  });
});

describe('what ends up on screen', () => {
  test('the HUD draws one heart per point of maximum health', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    h.g.Player.maxHp = 7; h.g.Player.hp = 3;
    const hearts = spy(h, 'Art.heart');
    h.frame();
    assert.equal(hearts.n, 7);
    assert.equal(hearts.args.filter(a => a[3]).length, 3);
  });

  test('the FPS counter appears only when switched on', () => {
    const h = loadGame({ seed: 1 });
    const text = spy(h, 'Text.draw');
    h.frame();
    assert.ok(!text.args.some(a => / FPS$/.test(a[1])));
    h.g.Settings.set('showFps', true);
    h.frame();
    assert.ok(text.args.some(a => / FPS$/.test(a[1])));
  });

  test('the water column is only drawn once a line is in the water', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    const water = spy(h, 'Art.underwater');
    h.frames(.2);
    assert.equal(water.n, 0);
    h.g.Player.weapon = 0;
    F.castLine(h);
    h.until(() => h.g.Fishing.phase === 'sink', 2);
    h.frames(.2);
    assert.ok(water.n > 0);
  });

  test('menu and HUD text stays inside the screen', () => {
    const h = loadGame({ seed: 1 });
    // world text (the boat's painted name, say) scrolls off screen on purpose, and
    // Art icons draw text relative to their own transform; only overlay text counts
    h.sandbox.__inWorld = 0;
    h.eval(`(() => {
      const mark = (o, k) => { const f = o[k]; o[k] = function (...a) { __inWorld++; try { return f.apply(this, a); } finally { __inWorld--; } }; };
      mark(Game, 'drawWorld');
      for (const k of Object.keys(Art)) if (typeof Art[k] === 'function') mark(Art, k);
    })()`);
    const text = spy(h, 'Text.draw');
    const check = label => {
      for (const a of text.args) {
        if (a.world) continue;
        const o = a[4] || {};
        const w = h.g.Text.width(null, a[1], o);
        const x0 = o.align === 'center' ? a[2] - w / 2 : o.align === 'right' ? a[2] - w : a[2];
        assert.ok(x0 >= -1 && x0 + w <= 961, label + ': "' + a[1] + '" runs off screen');
      }
      text.args.length = 0;
    };
    for (const id of [null, 'options', 'graphics', 'audio', 'controls', 'gameplay', 'credits', 'confirmNew', 'confirmReset']) {
      if (id) h.g.Menu.stack = ['main', id];
      h.frame(); check('menu ' + id);
    }
    h.startVoyage();
    h.g.Player.catches.push(h.g.makeTrophy(h.g.MONSTERS[0]));
    h.frame(); check('deck HUD');
  });

  test('taking a hit paints the red vignette, and a fade paints black over everything', () => {
    const h = loadGame({ seed: 1 });
    h.startVoyage();
    const vig = spy(h, 'stepVignette');
    h.g.Game.hurtFlash = 1;
    h.frame();
    assert.ok(vig.args.some(a => a[1] === 'rgb(180,20,30)'));
    const rec = h.hires();
    h.g.Game.fadeOut(() => {});
    h.frames(.2);
    rec.startLog();
    h.frame();
    assert.ok(rec.stopLog().some(e => e.set === 'fillStyle' && /^rgba\(3,4,10,/.test(e.value)));
  });
});

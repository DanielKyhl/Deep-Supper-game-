'use strict';
/* Who is talking, drawn beside what they say: a bust in a box of its own,
   blinking and moving its mouth while the line types itself out. */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

function talking(who, text) {
  const h = loadGame({ draw: true, seed: 6 });
  h.startVoyage();
  const g = h.g;
  g.Dialogue.show(who, text || 'Something or other, said out loud.');
  if (!text) g.Dialogue.complete();          // the whole line on screen, for measuring
  return { h, g, D: g.Dialogue, bctx: h.eval('bctx') };
}

// every sprite drawn in one frame of the dialogue box, by name and pose
function sprites(g, D, bctx) {
  const out = [], draw = g.Sprite.draw;
  g.Sprite.draw = function (ctx, who, pose) { out.push({ who, pose }); return draw.apply(this, arguments); };
  try { D.draw(bctx); } finally { g.Sprite.draw = draw; }
  return out;
}
// where the words start, to see the box make room for a face
function textX(g, D, bctx) {
  let x = null;
  const draw = g.Text.draw;
  g.Text.draw = function (ctx, s, tx) { if (x === null && /Something/.test(String(s))) x = tx; return draw.apply(this, arguments); };
  try { D.draw(bctx); } finally { g.Text.draw = draw; }
  return x;
}

describe('the face beside the words', () => {
  test('Dad, Dorran and Nerys each have one; narration has none', () => {
    for (const who of ['Dad', 'Dorran', 'Nerys']) {
      const { g, D, bctx } = talking(who);
      assert.ok(sprites(g, D, bctx).some(s => s.who === 'portrait:' + who), who + ' has a face');
    }
    const narr = talking('');
    assert.ok(!sprites(narr.g, narr.D, narr.bctx).some(s => /^portrait:/.test(s.who)), 'nobody in particular has no face');
  });

  test('a name nobody has a face for still speaks, with the box to itself', () => {
    const { g, D, bctx } = talking('A voice');
    assert.ok(!sprites(g, D, bctx).some(s => /^portrait:/.test(s.who)));
    const wide = textX(g, D, bctx);
    const withFace = talking('Dad');
    assert.ok(textX(withFace.g, withFace.D, withFace.bctx) > wide, 'a face pushes the words along');
  });

  test('the eyes blink, and the mouth moves only while the line is still typing', () => {
    const { h, g, D, bctx } = talking('Dorran', 'A long line, long enough to be still going when we look at it again.');
    const poses = new Set();
    for (let i = 0; i < 90; i++) { h.frame(); for (const s of sprites(g, D, bctx)) if (s.who === 'portrait:Dorran') poses.add(s.pose); }
    assert.ok(poses.size > 1, 'his face moves: ' + [...poses].join(' '));
    assert.ok([...poses].some(p => p.endsWith(',1')), 'the mouth opens while he talks');
    D.complete();
    h.frames(1);
    const done = new Set();
    for (let i = 0; i < 30; i++) { h.frame(); for (const s of sprites(g, D, bctx)) if (s.who === 'portrait:Dorran') done.add(s.pose.split(',')[1]); }
    assert.deepEqual([...done], ['0'], 'and shuts when the line is done');
  });

  test('every face draws balanced, and stays inside its box', () => {
    for (const who of ['Dad', 'Dorran', 'Nerys']) {
      const { h, g, D, bctx } = talking(who);
      const rec = h.hires();
      rec.reset();
      D.draw(bctx);
      assert.equal(rec.depth(), 0, who + ': unbalanced save/restore');
      assert.equal(g.Art.portrait(bctx, who, 100, 100, 0, false), true);
    }
    assert.equal(loadGame({ draw: true }).g.Art.portrait(null, 'Nobody', 0, 0, 0, false), false);
  });
});

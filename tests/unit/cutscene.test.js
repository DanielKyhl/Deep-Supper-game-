'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/harness');

describe('Dialogue', () => {
  test('types a line out at the text speed from settings', () => {
    const { g } = loadGame({ draw: false });
    g.Prefs.textCps = 40;
    g.Dialogue.show('Dad', 'x'.repeat(100));
    g.Dialogue.update(.5);
    assert.equal(Math.floor(g.Dialogue.shown), 20);
    assert.equal(g.Dialogue.done, false);
  });

  test('the first press finishes typing the line, the next asks for the next line', () => {
    const { g } = loadGame({ draw: false });
    g.Dialogue.show('Dad', 'x'.repeat(200));
    g.Dialogue.update(.1);
    assert.equal(g.Dialogue.press(), false, 'first press only completes the line');
    assert.equal(g.Dialogue.done, true);
    assert.equal(g.Dialogue.shown, 200);
    assert.equal(g.Dialogue.press(), false, 'not on the same frame it completed');
    g.Dialogue.update(1 / 60);
    assert.equal(g.Dialogue.press(), true);
  });

  test('confirm, interact and a mouse click all count as a press', () => {
    for (const act of [h => h.press('Enter'), h => h.press('Space'), h => h.press('KeyE'), h => h.press('KeyF'), h => h.click(10, 10)]) {
      const { h, g } = loadGame({ draw: false });
      act(h);
      assert.equal(g.Dialogue.pressed(), true);
    }
    const { h, g } = loadGame({ draw: false });
    h.press('KeyJ');
    assert.equal(g.Dialogue.pressed(), false);
  });

  test("'instant' text speed shows the whole line in one frame", () => {
    const { g } = loadGame({ draw: false });
    g.Settings.set('textSpeed', 'instant');
    g.Dialogue.show('You', 'A long line about supper and the sea.');
    g.Dialogue.update(1 / 60);
    assert.equal(g.Dialogue.done, true);
  });

  test('a finished line waits for as long as it takes', () => {
    const { g } = loadGame({ draw: false });
    g.Dialogue.show('You', 'Hm.');
    for (let i = 0; i < 60 * 30; i++) g.Dialogue.update(1 / 60);
    assert.equal(g.Dialogue.done, true);
    assert.equal(g.Dialogue.active, true, 'still on screen after thirty seconds');
  });

  test('draws nothing when hidden and a name plate when a speaker is set', () => {
    const { h, g } = loadGame({ draw: false });
    const rec = h.hires();
    g.Dialogue.hide();
    rec.reset();
    g.Dialogue.draw(h.eval('bctx'));
    assert.equal(Object.keys(rec.calls).length, 0);
    g.Dialogue.show('Dad', 'Supper.');
    g.Dialogue.update(1);
    g.Dialogue.draw(h.eval('bctx'));
    assert.ok(rec.calls.fill > 2);
    assert.equal(rec.depth(), 0);
  });
});

describe('the cutscene sequencer', () => {
  function steps(h, src) { return h.eval(src); }

  test('runs steps in order and calls onEnd after the last', () => {
    const { h, g } = loadGame({ draw: false });
    const log = [];
    h.sandbox.__log = log;
    const s = steps(h, '[sAct(() => __log.push("a")), sWait(.5), sAct(() => __log.push("b"))]');
    g.CUT.play(s, { onEnd: () => log.push('end') });
    assert.deepEqual(log, ['a']);
    g.CUT.update(.1);                        // the act step completes; wait begins
    g.CUT.update(.3);
    assert.deepEqual(log, ['a']);
    g.CUT.update(.3);
    g.CUT.update(.01);
    assert.deepEqual(log, ['a', 'b', 'end']);
    assert.equal(g.CUT.running, false);
  });

  test('sTween drives a value from 0 to 1 over its duration', () => {
    const { h, g } = loadGame({ draw: false });
    h.sandbox.__v = [];
    g.CUT.play(steps(h, '[sTween(1, p => __v.push(p))]'));
    for (let i = 0; i < 12; i++) g.CUT.update(.1);
    const v = h.sandbox.__v;
    assert.equal(v[v.length - 1], 1);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1]);
  });

  test('bgTween runs alongside the steps', () => {
    const { h, g } = loadGame({ draw: false });
    h.sandbox.__bg = 0;
    g.CUT.play(steps(h, '[sAct(() => CUT.bgTween(1, p => { __bg = p; })), sWait(5)]'));
    for (let i = 0; i < 6; i++) g.CUT.update(.1);
    assert.ok(h.sandbox.__bg > .4 && h.sandbox.__bg < .7);
    for (let i = 0; i < 6; i++) g.CUT.update(.1);
    assert.equal(h.sandbox.__bg, 1);
    assert.equal(g.CUT.tweens.length, 0);
  });

  test('a spoken line waits for a press to finish it and another to move on', () => {
    const { h, g } = loadGame({ draw: false });
    g.CUT.play(steps(h, '[sSay("Dad", "Go on, lad, the tide will not wait for you."), sWait(99)]'));
    for (let i = 0; i < 600; i++) g.CUT.update(1 / 60);
    assert.equal(g.CUT.i, 0, 'ten seconds later, still waiting');
    g.Dialogue.shown = 3; g.Dialogue.done = false;
    h.press('Enter'); g.CUT.update(1 / 60); g.Input.endFrame();
    assert.equal(g.Dialogue.done, true, 'first press shows the whole line');
    assert.equal(g.CUT.i, 0);
    g.CUT.update(1 / 60);
    h.press('Enter'); g.CUT.update(1 / 60); g.Input.endFrame();
    assert.equal(g.CUT.i, 1);
  });

  test('holding ESC skips: finalize runs, then onEnd', () => {
    const { h, g } = loadGame({ draw: false });
    const order = [];
    g.CUT.play(steps(h, '[sWait(60)]'), { finalize: () => order.push('finalize'), onEnd: () => order.push('end') });
    h.keyDown('Escape');
    for (let i = 0; i < 40 && g.CUT.running; i++) g.CUT.update(1 / 30);
    assert.deepEqual(order, ['finalize', 'end']);
  });

  test('tapping ESC briefly does not skip', () => {
    const { h, g } = loadGame({ draw: false });
    g.CUT.play(steps(h, '[sWait(60)]'));
    for (let k = 0; k < 5; k++) {
      h.keyDown('Escape'); g.CUT.update(.3); h.keyUp('Escape'); g.CUT.update(.3);
    }
    assert.equal(g.CUT.running, true);
  });

  test('an unskippable scene ignores ESC', () => {
    const { h, g } = loadGame({ draw: false });
    g.CUT.play(steps(h, '[sWait(60)]'), { skippable: false });
    h.keyDown('Escape');
    for (let i = 0; i < 60; i++) g.CUT.update(1 / 30);
    assert.equal(g.CUT.running, true);
  });

  test('a title card appears and clears itself', () => {
    const { h, g } = loadGame({ draw: false });
    g.CUT.play(steps(h, '[sTitle("DEEP SUPPER", "sub", 1), sWait(5)]'));
    assert.equal(g.CUT.titleCard.title, 'DEEP SUPPER');
    for (let i = 0; i < 12; i++) g.CUT.update(.1);
    assert.equal(g.CUT.titleCard, null);
  });

  test('stop clears everything and hides dialogue', () => {
    const { h, g } = loadGame({ draw: false });
    g.CUT.play(steps(h, '[sSay("a", "b")]'));
    g.CUT.bgTween(1, () => {});
    g.CUT.stop();
    assert.equal(g.CUT.running, false);
    assert.equal(g.CUT.tweens.length, 0);
    assert.equal(g.Dialogue.active, false);
  });
});

describe('the opening and the ending', () => {
  test('the opening has Dad give the order, leave, and ends out at sea at night', () => {
    const { h, g } = loadGame({ draw: false });
    const o = g.buildOpening();
    assert.ok(o.steps.length > 30);
    const src = h.eval('buildOpening.toString()');
    assert.match(src, /catch us some supper/);
    o.finalize();
    assert.equal(g.Game.night, 1);
    assert.equal(g.CUT.dad.visible, false);
    assert.equal(g.Player.x, 640);
    assert.equal(g.CUT.harbourX, -1400);
  });

  test('the opening only needs reading: pressing through the lines reaches free play', () => {
    const { h, g } = loadGame({ draw: false });
    g.Game.newGame();
    assert.equal(g.Game.state, 'cutscene');
    for (let i = 0; i < 4000 && g.Game.state === 'cutscene'; i++) {
      if (g.Dialogue.active && i % 10 === 0) h.press('Enter');
      h.frame(1 / 20);
    }
    assert.equal(g.Game.state, 'play');
    assert.equal(g.Game.night, 1);
  });

  test('left alone, the opening stops on its first line rather than rushing past it', () => {
    const { h, g } = loadGame({ draw: false });
    g.Game.newGame();
    h.frames(60, 1 / 20);
    assert.equal(g.Game.state, 'cutscene');
    assert.equal(g.Dialogue.active, true);
    assert.match(g.Dialogue.full, /There you are/);
  });

  test('the ending brings Dad back to the harbour at dawn', () => {
    const { g } = loadGame({ draw: false });
    const e = g.buildEnding();
    assert.ok(e.steps.length > 15);
    e.finalize();
    assert.ok(g.Game.night < .5);
    assert.equal(g.CUT.dad.visible, true);
  });
});

'use strict';
/* ========================================================================
   cutscene.js — dialogue box, a tiny sequencer, and the two set pieces
   ======================================================================== */

const Dialogue = {
  active: false, who: '', full: '', shown: 0, cps: 42, hold: 0, done: false, tick: 0,

  show(who, text) {
    this.active = true; this.who = who; this.full = text;
    this.shown = 0; this.done = false; this.hold = 0; this.tick = 0;
  },
  hide() { this.active = false; },

  update(dt) {
    if (!this.active) return;
    this.tick += dt;
    if (!this.done) {
      const prev = Math.floor(this.shown);
      this.shown += this.cps * dt * (Input.held('confirm') ? 3.2 : 1);
      if (Math.floor(this.shown) > prev && Math.floor(this.shown) % 2 === 0) Sfx.text();
      if (this.shown >= this.full.length) { this.shown = this.full.length; this.done = true; this.hold = 0; }
    } else {
      this.hold += dt;
    }
  },

  // true when the line has been read long enough / skipped
  finished(minHold) {
    return this.done && this.hold >= (minHold === undefined ? 1.35 : minHold);
  },

  draw(g) {
    if (!this.active) return;
    const x = 78, y = 398, w = VIEW_W - 156, h = 108;
    panel(g, x, y, w, h, { alpha: .97 });

    // name plate
    if (this.who) {
      const nw = Text.width(g, this.who, { size: 17, weight: 'bold' }) + 30;
      panel(g, x + 16, y - 19, nw, 34, { alpha: 1, top: 'rgba(40,34,26,.98)', bottom: 'rgba(24,20,14,.99)' });
      Text.draw(g, this.who, x + 16 + nw / 2, y + 3, {
        size: 17, weight: 'bold', align: 'center', color: '#f0cf8a', font: 'Georgia, serif'
      });
    }

    const str = this.full.slice(0, Math.floor(this.shown));
    const opts = { size: 21, font: 'Georgia, serif', color: '#e8e3d6' };
    const lines = Text.wrap(g, this.full, w - 60, opts);
    // render progressively, line by line
    let left = Math.floor(this.shown);
    let ly = y + 46;
    for (const ln of lines) {
      const take = Math.max(0, Math.min(ln.length, left));
      if (take > 0) Text.draw(g, ln.slice(0, take), x + 30, ly, opts);
      left -= ln.length + 1;
      ly += 30;
      if (left <= 0) break;
    }
    if (this.done) {
      const a = .4 + .6 * Math.abs(Math.sin(this.tick * 3.4));
      Text.draw(g, '▸', x + w - 30, y + h - 18, { size: 20, color: '#c8a45c', alpha: a, align: 'center' });
    }
  }
};

/* --------------------------- the sequencer ------------------------------ */

const CUT = {
  steps: null, i: 0, t: 0, running: false, onEnd: null, finalize: null,
  tweens: [], letterbox: 0, skipHold: 0, skippable: true,
  dad: { x: 560, face: -1, state: 'idle', visible: false, pipe: true },
  harbourX: -1200, bigShadow: 0, titleCard: null, wake: 0, allowShadows: 0,

  play(steps, opts) {
    opts = opts || {};
    this.steps = steps; this.i = 0; this.t = 0; this.running = true;
    this.onEnd = opts.onEnd || null;
    this.finalize = opts.finalize || null;
    this.tweens.length = 0;
    this.skipHold = 0;
    this.skippable = opts.skippable !== false;
    this.letterbox = 0;
    Dialogue.hide();
    this._enter();
  },

  _enter() {
    const s = this.steps[this.i];
    if (s && s.enter) s.enter();
    this.t = 0;
  },

  bgTween(dur, fn, ease2) {
    this.tweens.push({ t: 0, dur, fn, ease: ease2 });
  },

  stop() {
    this.running = false;
    this.steps = null;
    Dialogue.hide();
    this.tweens.length = 0;
  },

  skip() {
    if (this.finalize) this.finalize();
    const end = this.onEnd;
    this.stop();
    this.letterbox = 0;
    this.titleCard = null;
    if (end) end();
  },

  update(dt) {
    if (!this.running) return;

    // letterbox eases in
    this.letterbox = approach(this.letterbox, 1, dt * 3);

    // hold ESC to skip
    if (this.skippable) {
      if (Input.held('cancel')) {
        this.skipHold += dt;
        if (this.skipHold > 0.85) { this.skip(); return; }
      } else this.skipHold = Math.max(0, this.skipHold - dt * 2);
    }

    for (let k = this.tweens.length - 1; k >= 0; k--) {
      const tw = this.tweens[k];
      tw.t += dt;
      const p = clamp(tw.t / tw.dur, 0, 1);
      tw.fn(tw.ease ? tw.ease(p) : p);
      if (p >= 1) this.tweens.splice(k, 1);
    }

    Dialogue.update(dt);

    if (this.titleCard) {
      this.titleCard.t += dt;
      if (this.titleCard.t > this.titleCard.dur) this.titleCard = null;
    }

    const s = this.steps[this.i];
    if (!s) return;
    this.t += dt;
    if (s.update(dt, this)) {
      this.i++;
      if (this.i >= this.steps.length) {
        const end = this.onEnd;
        this.stop();
        if (end) end();
      } else this._enter();
    }
  },

  drawOverlay(g) {
    // letterbox
    const h = 56 * this.letterbox;
    if (h > 0.5) {
      g.fillStyle = '#05060c';
      g.fillRect(0, 0, VIEW_W, h);
      g.fillRect(0, VIEW_H - h, VIEW_W, h);
    }

    Dialogue.draw(g);

    if (this.titleCard) {
      const c = this.titleCard;
      const p = c.t / c.dur;
      const a = clamp(Math.min(p * 4, (1 - p) * 4), 0, 1);
      g.save();
      g.globalAlpha = a;
      g.fillStyle = 'rgba(3,5,12,.72)';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      const yy = VIEW_H / 2 - 10 + (1 - easeOut(clamp(p * 3, 0, 1))) * 14;
      Text.draw(g, c.title, VIEW_W / 2, yy, {
        size: 62, align: 'center', color: '#f2e2bd', weight: 'bold',
        font: 'Georgia, serif', shadow: 'rgba(0,0,0,.8)', sdx: 3, sdy: 4
      });
      g.strokeStyle = 'rgba(200,164,92,.75)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(VIEW_W / 2 - 190, yy + 20); g.lineTo(VIEW_W / 2 + 190, yy + 20); g.stroke();
      if (c.sub) Text.draw(g, c.sub, VIEW_W / 2, yy + 52, {
        size: 22, align: 'center', color: '#a8b4cf', italic: true, font: 'Georgia, serif'
      });
      g.restore();
    }

    if (this.skippable && this.skipHold > 0.05) {
      const p = clamp(this.skipHold / .85, 0, 1);
      Text.draw(g, 'skipping…', VIEW_W - 30, VIEW_H - 20, {
        size: 13, align: 'right', color: 'rgba(200,208,230,.8)', font: 'Verdana, sans-serif'
      });
      g.fillStyle = 'rgba(200,208,230,.25)';
      g.fillRect(VIEW_W - 130, VIEW_H - 14, 100, 3);
      g.fillStyle = '#c8a45c';
      g.fillRect(VIEW_W - 130, VIEW_H - 14, 100 * p, 3);
    } else if (this.skippable) {
      Text.draw(g, 'hold ESC to skip', VIEW_W - 30, VIEW_H - 20, {
        size: 12, align: 'right', color: 'rgba(160,172,200,.45)', font: 'Verdana, sans-serif'
      });
    }
  }
};

/* --------------------------- step constructors -------------------------- */

function sWait(d) {
  return { update(dt, c) { return c.t >= d; } };
}
function sAct(fn) {
  return { enter: fn, update() { return true; } };
}
function sSay(who, text, minHold) {
  return {
    enter() { Dialogue.show(who, text); },
    update(dt, c) {
      if (Dialogue.finished(minHold)) { return true; }
      // a tap advances once the line is fully typed
      if (Dialogue.done && Input.tap('confirm') && Dialogue.hold > .15) return true;
      return false;
    }
  };
}
function sHideText() {
  return sAct(() => Dialogue.hide());
}
function sTween(dur, fn, easeFn) {
  return {
    update(dt, c) {
      const p = clamp(c.t / dur, 0, 1);
      fn(easeFn ? easeFn(p) : p);
      return p >= 1;
    }
  };
}
function sTitle(title, sub, dur) {
  return {
    enter() { CUT.titleCard = { title, sub, dur, t: 0 }; Dialogue.hide(); },
    update(dt, c) { return c.t >= dur; }
  };
}

/* ============================ OPENING ================================== */

function buildOpening() {
  const finalize = () => {
    Game.night = 1;
    CUT.harbourX = -1400;
    CUT.dad.visible = false;
    CUT.wake = 1;
    Cam.locked = false;
    CUT.allowShadows = 1;
    CUT.bigShadow = 0;
    Player.x = 640; Player.face = 1; Player.state = 'idle';
    Cam.snap(Player.x);
  };

  return {
    finalize,
    steps: [
      sAct(() => {
        Game.night = 0.04;
        CUT.harbourX = 300;
        CUT.dad.visible = true; CUT.dad.x = 596; CUT.dad.face = -1; CUT.dad.state = 'idle';
        Player.x = 500; Player.face = 1; Player.state = 'idle';
        Cam.snap(548);
        CUT.wake = 0; CUT.allowShadows = 0;
      }),
      sWait(1.1),
      sSay('Dad', "There you are. Nets are stowed, wind's fair, tide's about to turn."),
      sSay('Dad', "And your mother has a pot on the fire with absolutely nothing in it."),
      sSay('Dad', "So. Go and catch us some supper, lad."),
      sSay('You', "...On my own? Out there?"),
      sSay('Dad', "You've watched me do it a hundred times. Line goes in the water. Fish comes out."),
      sSay('Dad', "Simple as breathing, and about as dangerous."),
      sSay('You', "And if something goes wrong?"),
      sSay('Dad', "Then you'll have a story. Every fisherman's got one, and every one of them's a lie."),
      sSay('Dad', "I'll be at the harbour office till the tide turns. She's all yours, Margaret and all."),
      sAct(() => { Player.face = -1; }),
      sSay('You', "Margaret's the boat."),
      sSay('Dad', "Margaret's the boat. Don't sink her."),

      // dad leaves
      sAct(() => { CUT.dad.state = 'walk'; CUT.dad.face = -1; Dialogue.hide(); }),
      sTween(3.4, p => { CUT.dad.x = lerp(596, 30, p); }),
      sAct(() => { CUT.dad.visible = false; CUT.dad.state = 'idle'; }),
      sWait(.8),
      sSay('You', "...Right. Supper."),
      sHideText(),
      sWait(.6),

      // cast off
      sAct(() => {
        Sfx.whoosh();
        CUT.bgTween(9.5, p => {
          CUT.harbourX = lerp(300, -1400, ease(p));
          CUT.wake = Math.min(1, p * 3);
        });
        CUT.bgTween(11, p => { Game.night = lerp(0.04, 0.74, p); });
        Cam.locked = true;
        const c0 = Cam.x;
        CUT.bgTween(9, p => { Cam.x = lerp(c0, c0 + 210, ease(p)); });
      }),
      sWait(2.6),
      sSay('You', "Hah. The whole harbour, getting smaller."),
      sWait(1.4),
      sSay('You', "...It's getting dark very fast."),
      sHideText(),
      sAct(() => {
        CUT.bgTween(7, p => { Game.night = lerp(0.74, 1, p); });
        CUT.allowShadows = 1;
      }),
      sWait(2.2),

      // something enormous passes between you and the water
      sAct(() => {
        Dialogue.hide();
        CUT.bigShadow = 0.001;
        CUT.bgTween(6.5, p => { CUT.bigShadow = p; });
      }),
      sWait(2.0),
      sAct(() => { Sfx.roar(); Cam.kick(8); }),
      sWait(1.9),
      sSay('You', "..."),
      sSay('You', "That was not a wave."),
      sHideText(),
      sWait(1.0),
      sAct(() => { CUT.bigShadow = 0; Cam.locked = false; }),
      sTitle('DEEP SUPPER', 'Chapter One — The Fish Are Not Right', 4.0),
      sAct(() => { finalize(); })
    ]
  };
}

/* ============================= ENDING ================================== */

function buildEnding() {
  const finalize = () => {
    Game.night = 0.12;
    CUT.harbourX = 300;
    CUT.dad.visible = true; CUT.dad.x = 300; CUT.dad.face = 1;
    Cam.locked = false;
    Player.x = 640;
  };
  return {
    finalize,
    steps: [
      sAct(() => {
        Dialogue.hide();
        Player.face = 1; Player.state = 'idle';
        CUT.harbourX = -1400; CUT.dad.visible = false;
        Cam.locked = true;
        CUT.bgTween(10, p => { Game.night = lerp(1, 0.12, ease(p)); });
        CUT.bgTween(10, p => { CUT.harbourX = lerp(-1400, 300, ease(p)); });
      }),
      sWait(1.2),
      sSay('You', "Sun's coming up."),
      sWait(1.0),
      sSay('You', "Everything out here goes quiet when the sun comes up. Everything."),
      sWait(2.4),
      sAct(() => { CUT.dad.visible = true; CUT.dad.x = 240; CUT.dad.face = 1; }),
      sWait(1.0),
      sSay('Dad', "You're late. Tide turned hours ago, I've been stood here like a—"),
      sAct(() => { Dialogue.hide(); Cam.kick(4); Sfx.thud(); }),
      sWait(1.0),
      sSay('Dad', "..."),
      sSay('Dad', "What is that."),
      sSay('You', "Supper."),
      sSay('Dad', "That is not supper. That has a jaw on it the size of a rowboat."),
      sSay('You', "You said to catch something. I caught something."),
      sSay('Dad', "..."),
      sSay('Dad', "Your mother is going to need a bigger pot."),
      sHideText(),
      sWait(1.2),
      sTitle('THE END', 'You caught supper. Supper caught nothing.', 5.0),
      sAct(() => { finalize(); })
    ]
  };
}

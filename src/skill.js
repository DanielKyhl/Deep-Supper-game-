'use strict';
/* ========================================================================
   skill.js — the attacks you have to answer. A boss winds up something too
   big to dodge, and you meet it: press as a ring closes, keep up with a
   string of keys, or hold your ground in a tug of war. While one is being
   answered, the fight around it holds still.
     ring  press the key as the closing ring meets the gold one
     keys  press each key as it comes up, before its time runs out
     hold  hold against the pull to keep the marker off either end
   ======================================================================== */

const SKILL_WATCH = ['left', 'right', 'up', 'down', 'jump', 'attack', 'roll'];

const Skill = {
  active: null,

  /* spec: { kind, label, ...kind-specific }, done(ok) is called once, when it ends.
     ring: at() -> {x, y} on screen, action, count, shrink (s), window (s)
     keys: seq [actions], per (s)
     hold: dur (s), pull (1 or -1: which way it drags), strength, keys [against, with] */
  start(spec, done) {
    this.active = Object.assign({ t: 0, i: 0, local: 0, pos: 0, vel: 0, result: null, endT: 0, done }, spec);
    Sfx.tone({ f: 330, f2: 660, dur: .16, type: 'square', vol: .12 });
  },

  _finish(ok) {
    const A = this.active;
    if (!A || A.result !== null) return;
    A.result = ok;
    A.endT = 0;
    if (ok) Sfx.crit(); else Sfx.deny();
  },

  update(dt) {
    const A = this.active;
    if (!A) return false;
    A.t += dt;
    // the result stays up for a moment so you can see how it went
    if (A.result !== null) {
      A.endT += dt;
      if (A.endT > .45) { this.active = null; A.done(A.result); }
      return true;
    }
    A.local += dt;
    if (A.kind === 'ring') this._ring(A);
    else if (A.kind === 'keys') this._keys(A);
    else this._hold(A, dt);
    return true;
  },

  _ring(A) {
    const pressed = Input.tap(A.action);
    const off = A.local - A.shrink;
    if (pressed) {
      if (Math.abs(off) <= A.window) {
        A.i++; A.local = -.25;               // a breath before the next ring
        Sfx.hit();
        if (A.i >= A.count) this._finish(true);
      } else this._finish(false);
    } else if (off > A.window) this._finish(false);
  },

  _keys(A) {
    if (A.local < 0) return;
    const want = A.seq[A.i];
    for (const raw of SKILL_WATCH) {
      if (!Input.tap(raw)) continue;
      // underwater, the jump keys swim up
      const a = (A.alias && A.alias[raw]) || raw;
      if (a !== want) { this._finish(false); return; }
      A.i++; A.local = 0;
      Sfx.select();
      if (A.i >= A.seq.length) { this._finish(true); return; }
    }
    if (A.local > A.per) this._finish(false);
  },

  _hold(A, dt) {
    const against = Input.held(A.keys[0]), along = Input.held(A.keys[1]);
    // it hauls, harder in surges
    const surge = .55 + .45 * Math.max(0, Math.sin(A.t * 3.1) + Math.sin(A.t * 7.3) * .5);
    let acc = A.pull * A.strength * surge;
    if (against) acc -= A.pull * 3.4;
    if (along) acc += A.pull * 1.2;
    A.vel += acc * dt;
    A.vel *= 1 - Math.min(1, dt * 3.2);
    A.pos += A.vel * dt;
    if (A.pos * A.pull < -1) { A.pos = -A.pull; A.vel = 0; }
    if (A.pos * A.pull >= 1) { A.pos = A.pull; this._finish(false); return; }
    if (A.t >= A.dur) this._finish(true);
  },

  /* ------------------------------- drawing ------------------------------ */

  draw(g) {
    const A = this.active;
    if (!A) return;
    const fade = A.result === null ? clamp(A.t * 6, 0, 1) : clamp(1 - A.endT / .45, 0, 1);
    g.save();
    g.globalAlpha = fade;
    Text.draw(g, A.label, VIEW_W / 2, 132, {
      size: 30, align: 'center', color: '#f0cf6a', weight: 'bold', outline: 'rgba(0,0,0,.85)', outlineW: 6
    });
    if (A.kind === 'ring') this._drawRing(g, A);
    else if (A.kind === 'keys') this._drawKeys(g, A);
    else this._drawHold(g, A);
    if (A.result !== null) {
      Text.draw(g, A.result ? 'YES' : 'NO', VIEW_W / 2, 176, {
        size: 26, align: 'center', color: A.result ? '#8ce0a4' : '#ff6a6a', weight: 'bold', outline: 'rgba(0,0,0,.85)', outlineW: 5
      });
    }
    g.restore();
  },

  _key(g, action, x, y, on, done) {
    const label = keyLabel(ACTIONS[action][0]);
    const w = Math.max(40, Text.width(g, label, { size: 18 }) + 22);
    g.fillStyle = done ? 'rgba(80,140,100,.9)' : on ? 'rgba(240,207,106,.95)' : 'rgba(20,24,40,.85)';
    g.fillRect(snap(x - w / 2), snap(y - 20), w, 36);
    g.fillStyle = on ? '#241c10' : '#1a1a24';
    g.fillRect(snap(x - w / 2), snap(y + 14), w, 4);
    Text.draw(g, label, x, y + 6, { size: 18, align: 'center', color: on ? '#241c10' : '#e8e3d6', weight: 'bold' });
    return w;
  },

  _drawRing(g, A) {
    const p = A.at();
    const R0 = 96, R1 = 22;
    const k = clamp(A.local / A.shrink, 0, 1.3);
    const r = Math.max(4, lerp(R0, R1, k));
    const close = Math.abs(A.local - A.shrink) <= A.window;
    g.strokeStyle = '#f0cf6a'; g.lineWidth = 4;
    g.beginPath(); g.arc(snap(p.x), snap(p.y), R1, 0, 6.2832); g.stroke();
    if (A.local >= 0 && A.result === null) {
      g.strokeStyle = close ? '#8ce0a4' : '#ffffff'; g.lineWidth = 4;
      g.beginPath(); g.arc(snap(p.x), snap(p.y), r, 0, 6.2832); g.stroke();
    }
    this._key(g, A.action, p.x, p.y + R0 * .9 + 14, close, false);
    for (let i = 0; i < A.count; i++) {
      g.fillStyle = i < A.i ? '#8ce0a4' : 'rgba(240,207,106,.4)';
      g.fillRect(snap(p.x - (A.count - 1) * 9 + i * 18 - 5), snap(p.y - R0 - 12), 10, 10);
    }
  },

  _drawKeys(g, A) {
    const gap = 62, x0 = VIEW_W / 2 - (A.seq.length - 1) * gap / 2, y = 176;
    for (let i = 0; i < A.seq.length; i++) this._key(g, A.seq[i], x0 + i * gap, y, i === A.i && A.result === null, i < A.i);
    if (A.result === null && A.i < A.seq.length) {
      const left = clamp(1 - A.local / A.per, 0, 1);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(snap(x0 + A.i * gap - 24), y + 22, 48, 6);
      g.fillStyle = left > .35 ? '#f0cf6a' : '#ff6a6a'; g.fillRect(snap(x0 + A.i * gap - 24), y + 22, snap(48 * left), 6);
    }
  },

  _drawHold(g, A) {
    const w = 420, x = VIEW_W / 2 - w / 2, y = 168;
    g.fillStyle = 'rgba(10,12,24,.85)'; g.fillRect(x - 4, y - 4, w + 8, 26);
    g.fillStyle = 'rgba(160,40,50,.75)';
    g.fillRect(x, y, 70, 18); g.fillRect(x + w - 70, y, 70, 18);
    g.fillStyle = 'rgba(140,224,164,.35)'; g.fillRect(x + w / 2 - 70, y, 140, 18);
    const mx = x + w / 2 + A.pos * (w / 2 - 6);
    g.fillStyle = '#f0cf6a'; g.fillRect(snap(mx - 5), y - 6, 10, 30);
    // which key to hold, on the side it pulls you away from
    const side = -A.pull;
    this._key(g, A.keys[0], VIEW_W / 2 + side * (w / 2 + 50), y + 8, Input.held(A.keys[0]), false);
    const left = clamp(1 - A.t / A.dur, 0, 1);
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y + 30, w, 5);
    g.fillStyle = '#9fd4e4'; g.fillRect(x, y + 30, snap(w * left), 5);
  }
};

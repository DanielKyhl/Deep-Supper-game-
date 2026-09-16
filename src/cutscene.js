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
      this.shown += Prefs.textCps * dt;
      if (Math.floor(this.shown) > prev && Math.floor(this.shown) % 2 === 0) Sfx.text();
      if (this.shown >= this.full.length) this.complete();
    } else {
      this.hold += dt;
    }
  },

  // show the rest of the line at once
  complete() {
    if (!this.active || this.done) return;
    this.shown = this.full.length;
    this.done = true;
    this.hold = 0;
  },

  /* Lines never move on by themselves: some people read slower than others.
     The first press finishes typing the line, the next one moves on. Returns
     true when this press asks for the next line. */
  press() {
    if (!this.active) return false;
    if (!this.done) { this.complete(); return false; }
    return this.hold > 0;      // not the same frame the line finished on
  },

  // the keys (or click) that read on
  pressed() {
    return Input.tap('confirm') || Input.tap('interact') || Input.mouse().click;
  },

  draw(g) {
    if (!this.active) return;
    const x = 78, y = 398, w = VIEW_W - 156, h = 108;
    panel(g, x, y, w, h, { alpha: .97 });

    // name plate; a line with no name on it is narration, set apart from speech
    const narr = !this.who;
    if (!narr) {
      const nw = Text.width(g, this.who, { size: 17, weight: 'bold' }) + 30;
      panel(g, x + 16, y - 19, nw, 34, { alpha: 1, top: 'rgba(40,34,26,.98)', bottom: 'rgba(24,20,14,.99)' });
      Text.draw(g, this.who, x + 16 + nw / 2, y + 3, {
        size: 17, weight: 'bold', align: 'center', color: '#f0cf8a', font: 'Georgia, serif'
      });
    } else {
      g.fillStyle = 'rgba(160,176,208,.35)';
      g.fillRect(x + w / 2 - 60, y + 12, 120, 2);
    }

    const opts = { size: 21, font: 'Georgia, serif', color: narr ? '#b9c6de' : '#e8e3d6' };
    const lines = Text.wrap(g, this.full, w - 60, opts);
    // render progressively, line by line
    let left = Math.floor(this.shown);
    let ly = y + 46;
    for (const ln of lines) {
      const take = Math.max(0, Math.min(ln.length, left));
      if (take > 0) {
        if (narr) Text.draw(g, ln.slice(0, take), x + w / 2 - Text.width(g, ln, opts) / 2, ly, opts);
        else Text.draw(g, ln.slice(0, take), x + 30, ly, opts);
      }
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
  girl: { x: 0, y: DECK_Y, face: 1, pose: 'stand', rot: 0, visible: false },
  drops: { x: 0, visible: false },
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
function sSay(who, text) {
  return {
    enter() { Dialogue.show(who, text); },
    // waits for the reader: one press finishes the line, the next moves on
    update() { return Dialogue.pressed() && Dialogue.press(); }
  };
}
// a line of narration: what happens, told by nobody in particular
function sNarrate(text) { return sSay('', text); }
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
      sWait(1.0),
      sSay('Dad', "...Don't look at me like that. You know I can't stand it when you look at me like that."),
      sSay('Dad', "You've watched me do it a hundred times. Line goes in the water. Fish comes out."),
      sSay('Dad', "And if anything goes wrong out there..."),
      sSay('Dad', "...no. Things don't go wrong around you, do they. They go wrong around everything else."),
      sSay('Dad', "Your Uncle Dorran's aboard, at his stall. He'll buy whatever you pull up."),
      sSay('Dad', "Don't drink anything he gives you. And don't let him steer."),
      sAct(() => { Player.face = 1; }),
      sSay('Dorran', "I HEARD that. *hic*"),
      sAct(() => { Player.face = -1; }),
      sSay('Dad', "I'll be at the harbour office till the tide turns. Margaret's all yours. Don't sink her."),

      // dad leaves
      sAct(() => { CUT.dad.state = 'walk'; CUT.dad.face = -1; Dialogue.hide(); }),
      sTween(3.4, p => { CUT.dad.x = lerp(596, 30, p); }),
      sAct(() => { CUT.dad.visible = false; CUT.dad.state = 'idle'; }),
      sWait(1.4),

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
      sNarrate("The harbour grows smaller behind the Margaret, and then it is gone."),
      sWait(1.4),
      sNarrate("It gets dark very fast out here."),
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
      sNarrate("Something the length of the hull passes beneath the boat."),
      sNarrate("It was not a wave."),
      sHideText(),
      sWait(1.0),
      sAct(() => { CUT.bigShadow = 0; Cam.locked = false; }),
      sTitle('DEEP SUPPER', 'Chapter One — The Fish Are Not Right', 4.0),
      sAct(() => { finalize(); })
    ]
  };
}

/* ============================= NERYS ===================================
   Somewhere around the second or third rod, the line comes up with a
   person on it. She has a lot to say, and then she goes back.            */

// a leap from one point to another over a hump of `height`
function arc(from, to, height, p) {
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) - Math.sin(p * Math.PI) * height };
}

function buildGirlScene() {
  const G = CUT.girl;
  const splash = (x, n) => {
    Sfx.splash();
    Particles.burst(x, WATER_Y, n, { color: '#cfeaf4', vx: rand(-160, 160), vy: rand(-380, -120), g: 900, size: rand(2, 6), life: rand(.5, 1) });
  };
  const finalize = () => {
    G.visible = false;
    Player.girlMet = true;
    Player.x = FISH_X; Player.face = 1; Player.state = 'idle';
    Game.viewY = 0;
    Cam.locked = false;
    Cam.snap(Player.x);
  };
  const up = { x: FISH_X + 150, y: WATER_Y + 30 }, deck = { x: FISH_X - 110, y: DECK_Y };
  const over = { x: FISH_X + 190, y: WATER_Y + 40 };

  return {
    finalize,
    steps: [
      // hauled up and over the rail on the end of the line
      sAct(() => {
        Object.assign(G, { visible: true, x: up.x, y: up.y, face: -1, pose: 'rise', rot: 0 });
        splash(up.x, 30);
        Cam.kick(4);
      }),
      sTween(1.1, p => {
        const a = arc(up, deck, 150, p);
        G.x = a.x; G.y = a.y; G.rot = -p * 5.8;
        if (p > .5) Player.face = -1;
      }),
      sAct(() => { G.pose = 'sit'; G.rot = 0; G.face = 1; Sfx.thud(); Cam.kick(5); }),
      sWait(1.0),
      sSay('???', '*cough* — your hook. It was in my hair.'),
      sAct(() => { G.pose = 'stand'; Dialogue.hide(); }),
      sWait(.9),
      sSay('???', "...You're not even surprised."),
      sSay('???', "You're the boy on the boat. The one who keeps pulling up the Brood: everything down there with too many teeth."),
      sSay('???', "Things our wardens run from. You've been killing them. With a fishing rod."),
      sSay('Nerys', "I'm Nerys. From Lanthorne: the city under your boat. Eighty fathoms, straight down."),
      sSay('Nerys', "There was a city. Now there's half a city, and a lot of doors we don't open any more."),
      sSay('Nerys', "Something is waking at the bottom of the trench. The big ones aren't hunting you. They're running from it, straight up your line."),
      sSay('Nerys', "Our wardens can't hold the outer halls much longer. We need help. Yours, whatever you are."),
      sWait(.8),
      sSay('Nerys', "Do you ever say anything? ...No. Fine. Just listen, then."),
      sSay('Nerys', 'To come down, you would need a suit. Your great-grandfather had one. He used to come down and trade with us.'),
      sSay('Nerys', "Then one day he didn't come back up. Neither did the suit."),
      sSay('Nerys', 'Keep hauling them up. Get strong. And if you ever find a way down: come down.'),
      sHideText(),

      // straight over his head and back into the sea
      sAct(() => { G.pose = 'swim'; G.face = 1; G.rot = -.9; Sfx.whoosh(); }),
      sTween(1.0, p => {
        const a = arc(deck, over, 190, p);
        G.x = a.x; G.y = a.y - 30; G.rot = lerp(-.9, 1.1, p);
        if (p > .45) Player.face = 1;
      }),
      sAct(() => { G.visible = false; splash(over.x, 34); Cam.kick(3); }),
      sWait(1.8),
      sNarrate("She is gone before the ripples are."),
      sSay('Dorran', "Was that a girl? Out of the sea? ...Happens."),
      sHideText(),
      sAct(() => { finalize(); })
    ]
  };
}

/* ========================== THE MOTHER BELOW ===========================
   Run inside the dive (Dive.phase 'scene'), so the sea keeps moving under
   the conversation. D is the Dive object.                                 */

// the fight is on: Nerys hides by the gate, the Mother comes for him
function motherReady(D) {
  Object.assign(D.girl, { x: CITY_X - 300, y: DIVE_FLOOR - 80, face: -1 });
  Object.assign(D.boss, { state: 'idle', t: 0, cool: 1.8, x: CITY_X + 460, y: 3600 });
  D.camFocus = null;
}

function motherIntroSteps(D) {
  const B = D.boss, G = D.girl;
  return {
    finalize: () => motherReady(D),
    steps: [
      sAct(() => { D.camFocus = { x: CITY_X + 150, y: 3620 }; Sfx.roar(); Cam.kick(10); }),
      sTween(1.6, p => {
        G.x = lerp(CITY_X + 320, CITY_X - 60, p); G.y = 3620 + Math.sin(p * 9) * 10; G.face = -1;
        B.x = lerp(CITY_X + 900, CITY_X + 460, ease(p)); B.gape = .3 + p * .5;
      }),
      sSay('Nerys', 'No! Go back up! Not you, not now!'),
      sAct(() => { Dialogue.hide(); D.camFocus = { x: CITY_X + 360, y: 3600 }; B.gape = .95; Sfx.roar(); Cam.kick(14); }),
      sWait(1.3),
      sSay('Nerys', 'She came up out of the trench the night you killed it.'),
      sSay('Nerys', "The Old One wasn't what was waking down here. It was her child."),
      sSay('Nerys', "I know it came for you first. She won't care!"),
      sHideText(),
      sAct(() => {
        D.camFocus = null;
        D.banner = { text: 'THE MOTHER BELOW', t: 0, dur: 3, color: '#c46bff' };
        Sfx.roar(); Cam.kick(10);
      }),
      sTween(.9, p => { G.x = lerp(CITY_X - 60, CITY_X - 300, p); G.y = lerp(3620, DIVE_FLOOR - 80, p); G.face = -1; }),
      sAct(() => motherReady(D))
    ]
  };
}

// back for another try, no speeches
function motherReturnSteps(D) {
  const B = D.boss, G = D.girl;
  return {
    finalize: () => motherReady(D),
    steps: [
      sAct(() => {
        Object.assign(G, { x: CITY_X - 300, y: DIVE_FLOOR - 80, face: -1 });
        D.banner = { text: 'THE MOTHER BELOW', t: 0, dur: 2.4, color: '#c46bff' };
        Sfx.roar(); Cam.kick(10);
      }),
      sTween(1.2, p => { B.x = lerp(CITY_X + 900, CITY_X + 460, ease(p)); }),
      sAct(() => motherReady(D))
    ]
  };
}

function motherEndSteps(D) {
  const B = D.boss, G = D.girl;
  const finalize = () => {
    Player.beatMother = true;
    D.boss = null; D.banner = null; D.camFocus = null;
    G.visible = false;
    Game.autosave();
  };
  return {
    finalize,
    steps: [
      // she sinks away into the trench
      sAct(() => { D.camFocus = { x: B.x, y: B.y }; }),
      sWait(3.0),
      sAct(() => { D.camFocus = null; Object.assign(G, { visible: true, x0: G.x, y0: G.y }); }),
      sTween(1.4, p => {
        G.x = lerp(G.x0, D.p.x + (G.x0 < D.p.x ? -80 : 80), p);
        G.y = lerp(G.y0, D.p.y, p);
        G.face = D.p.x > G.x ? 1 : -1;
      }),
      sSay('Nerys', "She's going back down. Down past where even we go."),
      sSay('Nerys', 'A boy off a fishing boat. Not one word, the whole way down, and you put the Mother back in the trench.'),
      sSay('Nerys', 'Who ARE you?'),
      sWait(1.2),
      sSay('Nerys', "...Right. Of course you're not going to tell me."),
      sSay('Nerys', 'Lanthorne will light the outer halls again tonight. Come and see them one day. When you are not bleeding.'),
      sSay('Nerys', "And tell your father his grandfather's suit came home. Or don't. You won't."),
      sHideText(),
      sAct(() => { G.x0 = G.x; G.y0 = G.y; G.face = CITY_X > G.x ? 1 : -1; }),
      sTween(1.8, p => { G.x = lerp(G.x0, CITY_X, p); G.y = lerp(G.y0, DIVE_FLOOR - 320, p); }),
      sAct(() => { G.visible = false; }),
      sTitle('END OF PART TWO', 'Lanthorne is lit again.', 5.0),
      sAct(() => finalize())
    ]
  };
}

/* ============================= ENDING ================================== */

// what the Old One leaves on the deck: the suit it swallowed and the harpoon stuck in it
function takeTheSuit() {
  CUT.drops.visible = false;
  Player.suit = Math.max(Player.suit, 0);
  Player.diveWeapon = Math.max(Player.diveWeapon, 0);
}

function buildEnding() {
  const finalize = () => {
    takeTheSuit();
    Game.night = 0.12;
    CUT.harbourX = 300;
    CUT.dad.visible = true; CUT.dad.x = 300; CUT.dad.face = 1;
    Cam.locked = false;
    Player.x = 640;
  };
  return {
    finalize,
    steps: [
      // it coughs something up on its way back over the rail
      sAct(() => {
        Dialogue.hide();
        Player.face = 1; Player.state = 'idle';
        Object.assign(CUT.drops, { visible: true, x: Player.x + 120 });
        Sfx.thud(); Cam.kick(5);
        Particles.burst(Player.x + 120, DECK_Y - 12, 20, { color: '#9fd4e4', vy: rand(-240, -60), g: 800, size: rand(2, 5), life: .7 });
      }),
      sWait(1.2),
      sNarrate("It coughs something up on its way back over the rail."),
      sNarrate('A diving suit: brass helmet, rubber gone hard, and a harpoon snapped off through the sleeve.'),
      sNarrate("Somebody went down after it before you. A long time before you."),
      sAct(() => {
        takeTheSuit();
        Sfx.buy();
        Floaters.add(VIEW_W / 2, 230, 'Diving suit + Drowned Harpoon', { color: '#9ff0ff', size: 22, fixed: true, life: 2.8, vy: -12 });
      }),
      sHideText(),
      sWait(1.4),

      sAct(() => {
        Dialogue.hide();
        Player.face = 1; Player.state = 'idle';
        CUT.harbourX = -1400; CUT.dad.visible = false;
        Cam.locked = true;
        CUT.bgTween(10, p => { Game.night = lerp(1, 0.12, ease(p)); });
        CUT.bgTween(10, p => { CUT.harbourX = lerp(-1400, 300, ease(p)); });
      }),
      sWait(1.2),
      sNarrate("The sun comes up."),
      sWait(1.0),
      sNarrate("Everything out here goes quiet when the sun comes up. Everything."),
      sWait(2.4),
      sAct(() => { CUT.dad.visible = true; CUT.dad.x = 240; CUT.dad.face = 1; }),
      sWait(1.0),
      sSay('Dad', "You're late. Tide turned hours ago, I've been stood here like a—"),
      sAct(() => { Dialogue.hide(); Cam.kick(4); Sfx.thud(); }),
      sWait(1.0),
      sSay('Dad', "..."),
      sSay('Dad', "What is that."),
      sSay('Dorran', "Supper!"),
      sSay('Dad', "That is not supper. That has a jaw on it the size of a rowboat."),
      sSay('Dad', "..."),
      sSay('Dad', "Your mother is going to need a bigger pot."),
      sSay('Dad', 'And where did you get that suit?'),
      sSay('Dorran', 'Came out of the fish.'),
      sSay('Dad', "That's the Margaret's stamp on the collar. That was your great-grandad's. He went over the side in it and never came up."),
      sSay('Dad', 'Everyone said he was mad. Kept talking about lights down there. A city.'),
      sSay('Dad', "..."),
      sSay('Dad', "Don't you dare."),
      sSay('Dad', "Look at me. Say you won't."),
      sHideText(),
      sWait(2.0),
      sSay('Dad', "...You never do say anything, do you."),
      sHideText(),
      sWait(1.2),
      sTitle('END OF PART ONE', 'He did.', 5.0),
      sAct(() => { finalize(); })
    ]
  };
}

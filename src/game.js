'use strict';
/* ========================================================================
   game.js — state machine, the deck, the HUD, the loop
   ======================================================================== */

const Player = {
  x: 640, y: DECK_Y, vy: 0, air: 0, face: 1,
  state: 'idle',      // on-deck anim state
  bState: 'idle',     // battle anim state
  animT: 0,
  hp: 5, maxHp: 5,
  coins: 0,
  rod: 0, weapon: -1, introDone: false, girlMet: false,
  bandages: 0, lockets: 0, lantern: false, luck: false,
  catches: [],
  kills: {}, totalKills: 0, sold: 0, casts: 0,
  beatBoss: false,
  suit: -1, diveWeapon: -1, beatMother: false,   // the second half: diving
  excalibur: false, lore: [],                    // what the sea gave back
  sawEnding: false,                              // sailed home and watched the credits
  records: {}, chapters: [],                     // the heaviest of each kind landed; bestiary chapters paid for
  // battle scratch
  attackT: 0, attackDur: .32, attackDone: false, combo: 0, comboBuffer: false,
  chargeT: 0, heavy: false,          // holding the attack key for a heavy blow, and whether this one is
  rollT: 0, rollCd: 0, invuln: 0, knock: 0, healT: 0,

  reset() {
    this.x = 640; this.y = DECK_Y; this.vy = 0; this.face = 1;
    this.hp = 5; this.maxHp = 5; this.coins = 0;
    this.rod = 0; this.weapon = -1; this.introDone = false; this.girlMet = false;
    this.bandages = 0; this.lockets = 0; this.lantern = false; this.luck = false;
    this.catches.length = 0; this.kills = {}; this.totalKills = 0; this.sold = 0; this.casts = 0;
    this.beatBoss = false;
    this.suit = -1; this.diveWeapon = -1; this.beatMother = false;
    this.excalibur = false; this.lore = [];
    this.sawEnding = false;
    this.records = {}; this.chapters = [];
    this.attackT = 0; this.rollT = 0; this.invuln = 0; this.knock = 0;
    this.state = 'idle'; this.bState = 'idle';
  }
};

const STALL_X = 742;     // Dorran's stall, amidships

const SPOTS = [
  { id: 'helm',  x: FINALE.helmX, r: 64 },
  { id: 'crate', x: 392, r: 70 },
  { id: 'stall', x: STALL_X, r: 118 },
  { id: 'fish',  x: FISH_X, r: 104 }
];

const Game = {
  state: 'menu', viewY: 0,
  pausedFrom: 'play',
  fps: 60,
  t: 0, night: 1, crateOpen: false,
  fade: { a: 0, dir: 0, cb: null },
  msgs: [], msgWho: '',
  toastT: 0, toastText: '',
  hintT: 0,
  muteFlash: 0,
  // Uncle Dorran calling out from behind his counter: what, for how long so far,
  // how soon he may call again, and when he next talks to nobody in particular
  bark: { text: '', t: 0 },
  barkCd: 0, barkIdle: 40, nearStall: false,

  /* ------------------------------ lifecycle ---------------------------- */

  init() {
    Settings.load();
    Art.init();
    CUT.harbourX = 300;
    this.night = 0.5;
    Cam.snap(700);
    Menu.openMain();
    // closing the window mid-voyage should never lose the voyage
    addEventListener('beforeunload', () => {
      if (this.state !== 'menu' && this.state !== 'cutscene') this.autosave();
    });
    let last = performance.now();
    const loop = now => {
      let dt = (now - last) / 1000;
      const raw = dt;
      last = now;
      watchFrames(dt);
      if (dt > 1 / 20) dt = 1 / 20;
      this.frame(dt, raw);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  // from the menu: fade out, then the opening cutscene
  beginVoyage() {
    Sfx.select();
    this.fadeOut(() => this.newGame());
  },

  newGame() {
    Player.reset();
    this.crateOpen = false;
    this.endingRun = false;
    this._toldStart = false;
    this.viewY = 0;
    this.msgs = [];
    Dialogue.hide();
    Particles.clear(); Floaters.clear();
    Lore.open = null; Bestiary.book = null;
    this.hushDorran();
    const o = buildOpening();
    this.state = 'cutscene';
    CUT.play(o.steps, { finalize: o.finalize, onEnd: () => this.startPlay() });
  },

  startPlay() {
    this.state = 'play';
    Cam.locked = false;
    CUT.letterbox = 0;
    Dialogue.hide();
    if (Player.weapon < 0 && !this._toldStart) {
      this._toldStart = true;
      this.narrate('start');
    }
    this.autosave();
  },

  /* ------------------------------ saving -------------------------------- */

  autosave() {
    return SaveGame.save();
  },

  continueGame() {
    return this.loadSave(SaveGame.read(), 'Back aboard the Margaret.');
  },

  loadSlot(n) {
    return this.loadSave(SaveGame.readSlot(n), 'Loaded slot ' + n + '.');
  },

  saveSlot(n) {
    return SaveGame.saveSlot(n);
  },

  // fade out of wherever we are, onto the deck of a restored voyage
  loadSave(d, message) {
    if (!d) return false;
    Sfx.select();
    this.fadeOut(() => {
      SaveGame.restore(d);
      Player.hp = Player.maxHp;
      this.atSea();
      this.state = 'play';
      this.toast(message);
    });
    return true;
  },

  /* ---------------------------- test shortcuts -------------------------- */

  // everything Dorran sells for the fishing half of the game
  giveFishingGear() {
    const bandage = GOODS.find(x => x.type === 'consume');
    const locket = GOODS.find(x => x.type === 'maxhp');
    Object.assign(Player, {
      rod: RODS.length - 1, weapon: WEAPONS.length - 1,
      bandages: bandage.max, lockets: locket.max, maxHp: 5 + locket.max,
      lantern: true, luck: true, introDone: true, girlMet: true, totalKills: Math.max(Player.totalKills, 12)
    });
    Player.hp = Player.maxHp;
    this.crateOpen = true;
  },

  // straight into the Old One with every item bought
  devFinalBoss() {
    Sfx.select();
    this.fadeOut(() => {
      Player.reset();
      this.giveFishingGear();
      Player.x = 1100;
      this.atSea();
      this.startBattle(MONSTERS.find(m => m.boss));
    });
  },

  // the Old One already beaten and its suit on: ready to go over the side
  devDiving() {
    Sfx.select();
    this.fadeOut(() => {
      Player.reset();
      this.giveFishingGear();
      Object.assign(Player, { beatBoss: true, suit: 0, diveWeapon: 0 });
      Player.x = FISH_X - 80;
      this.atSea();
      this.state = 'play';
      this.toast('Test shortcut: the suit is yours. Dive at the bow.');
    });
  },

  // at the bottom in the best suit with the best of everything, just short of her
  devMother() {
    Sfx.select();
    this.fadeOut(() => {
      Player.reset();
      this.giveFishingGear();
      Object.assign(Player, { beatBoss: true, suit: SUITS.length - 1, diveWeapon: DIVE_WEAPONS.length - 1 });
      Player.x = FISH_X;
      this.atSea();
      this.state = 'dive';
      Dive.start();
      Dive.enterWater();
      Object.assign(Dive.p, { x: CITY_X - 1300, y: 3500 });
      Dive._camera(0, true);
    });
  },

  // everything beaten, standing at the wheel: straight into the voyage home and the credits
  devFinale() {
    Sfx.select();
    this.fadeOut(() => {
      Player.reset();
      this.giveFishingGear();
      Object.assign(Player, { beatBoss: true, beatMother: true, suit: SUITS.length - 1, diveWeapon: DIVE_WEAPONS.length - 1 });
      Player.x = FINALE.helmX;
      this.atSea();
      this.state = 'play';
      this.startFinale();
    });
  },

  // out on the water at night with nothing going on: the state every load starts from
  atSea() {
    this.endingRun = false;
    this.toldHomeward = false;
    this._toldStart = true;
    this.night = 1;
    this.viewY = 0;
    this.msgs = [];
    CUT.stop();
    CUT.harbourX = -1400; CUT.dad.visible = false; CUT.girl.visible = false; CUT.drops.visible = false; CUT.letterbox = 0;
    this.cutKind = null;
    CUT.allowShadows = 1; CUT.wake = 1; CUT.bigShadow = 0; CUT.titleCard = null;
    Particles.clear(); Floaters.clear(); Dialogue.hide();
    Lore.open = null; Bestiary.book = null;
    this.hushDorran();
    Dive.reset();
    Player.state = 'idle'; Player.bState = 'idle'; Player.y = DECK_Y; Player.vy = 0;
    Cam.locked = false;
    Cam.snap(Player.x);
  },

  /* ------------------------------ Uncle Dorran --------------------------- */

  // the sword in the stone, except it was the sea
  foundExcalibur() {
    Player.excalibur = true;
    Sfx.buy(); Sfx.crit(); Cam.kick(10);
    Particles.burst(Player.x - Cam.x + 40, DECK_Y - 80, 60, {
      color: chance(.5) ? '#fff6c8' : '#bfe0ff', vx: rand(-260, 260), vy: rand(-380, -40), g: 300, size: rand(2, 6), life: rand(.8, 1.6), fixed: true
    });
    Floaters.add(VIEW_W / 2, 200, 'EXCALIBUR', { color: '#f0cf6a', size: 44, fixed: true, life: 3, vy: -8 });
    this.say(...NARRATION.excalibur);
    this.autosave();
  },

  // what happens, in the dialogue box, told by nobody in particular
  narrate(topic) {
    this.say(...NARRATION[topic]);
  },
  // called across the deck, in a bubble over his stall
  dorranShouts(text) {
    this.bark.text = text;
    this.bark.t = 0;
    this.barkCd = Math.max(this.barkCd, 14);
  },
  // a new voyage, or a loaded one: he has forgotten everything, as usual
  hushDorran() {
    this.bark.text = '';
    this.barkCd = 10;
    this.barkIdle = 90;
    this.nearStall = Math.abs(Player.x - STALL_X) < 300;
    Shop.remarked = {};
  },
  _dorran(dt, busy) {
    const B = this.bark;
    const near = Math.abs(Player.x - STALL_X) < 300;
    this.barkCd = Math.max(0, this.barkCd - dt);
    if (busy) {
      // he doesn't talk over a conversation, or straight after one
      B.text = '';
      this.barkCd = Math.max(this.barkCd, 8);
      this.nearStall = near;
      return;
    }
    if (B.text) {
      B.t += dt;
      if (B.t > this.barkLife(B.text)) B.text = '';
    }
    if (near && !this.nearStall && this.barkCd <= 0 && !B.text) {
      this.dorranShouts(dorranPick(DORRAN.deck.near));
      this.barkCd = 60;
    }
    this.nearStall = near;
    this.barkIdle -= dt;
    if (this.barkIdle <= 0) {
      this.barkIdle = 90;
      if (!B.text && this.barkCd <= 0 && Math.abs(Player.x - STALL_X) < 700) this.dorranShouts(dorranPick(DORRAN.deck.idle));
    }
  },
  // long enough to read
  barkLife(text) { return 2.2 + text.length * .05; },

  pause() {
    if (this.state === 'pause' || this.state === 'menu') return;
    this.pausedFrom = this.state;
    this.state = 'pause';
    Menu.openPause();
    Sfx.select();
  },

  resume() {
    if (this.state !== 'pause') return;
    this.state = this.pausedFrom || 'play';
    Sfx.select();
  },

  quitToTitle() {
    this.autosave();
    this.fadeOut(() => {
      CUT.stop();
      Dialogue.hide();
      this.msgs = [];
      this.viewY = 0;
      this.endingRun = false;
      Cam.locked = false;
      Particles.clear(); Floaters.clear();
      Lore.open = null; Bestiary.book = null;
      Dive.reset();
      this.night = .88;
      CUT.harbourX = 300;
      CUT.girl.visible = false;
      this.cutKind = null;
      this.state = 'menu';
      Menu.openMain();
    });
  },

  quitApp() {
    if (this.state !== 'menu' && this.state !== 'cutscene') this.autosave();
    if (window.native && window.native.quit) window.native.quit();
  },

  // the girl on the end of the line
  startGirlScene() {
    const s = buildGirlScene();
    this.state = 'cutscene';
    this.cutKind = 'girl';
    CUT.play(s.steps, {
      finalize: s.finalize,
      onEnd: () => { this.cutKind = null; this.state = 'play'; this.autosave(); }
    });
  },

  startBattle(def) {
    this.state = 'battle';
    Battle.start(def);
  },

  endBattle(won, reward) {
    Cam.locked = false;
    Status.clear(Player);
    Player.bState = 'idle';
    Player.attackT = 0; Player.rollT = 0; Player.invuln = 0; Player.knock = 0;
    Player.y = DECK_Y; Player.vy = 0;
    if (!won) {
      Player.hp = Player.maxHp;
      this.state = 'play';
      const fee = salvageFee();
      this.say(...NARRATION.lost, ...(fee > 0 ? [NARRATION.fee.replace('{fee}', fee)] : []));
      this.autosave();
      return;
    }
    if (Battle.def.id === 'leviathan' && !Player.beatBoss) {
      Player.beatBoss = true;
      this.autosave();
      this.startEnding();
      return;
    }
    this.state = 'play';
    if (reward) {
      this.toast('Hauled aboard: ' + reward.name + ' (' + reward.weight + ' lb)');
      this.dorranShouts(dorranPick(DORRAN.deck.won));
    }
    this.autosave();
  },

  startEnding() {
    const e = buildEnding();
    this.endingRun = true;
    this.state = 'cutscene';
    CUT.play(e.steps, {
      finalize: e.finalize,
      onEnd: () => {
        this.fadeOut(() => {
          this.night = 0.92;
          CUT.harbourX = -1400;
          CUT.letterbox = 0;
          CUT.dad.visible = false;
          this.endingRun = false;
          Player.x = 640;
          Cam.snap(Player.x);
          this.state = 'play';
          this.toast('You sail out again. The suit fits, near enough.');
          this.autosave();
        });
      }
    });
  },

  // the voyage home, then the credits; afterwards the sea is still there to play in
  startFinale() {
    const f = buildFinale();
    this.endingRun = true;
    this.bark.text = '';
    this.state = 'cutscene';
    CUT.play(f.steps, {
      finalize: f.finalize,
      onEnd: () => {
        this.fadeOut(() => {
          f.finalize();
          this.endingRun = false;
          CUT.letterbox = 0;
          CUT.titleCard = null;
          Cam.snap(Player.x);
          this.state = 'play';
          this.toast('The Margaret is still yours. So is the sea.');
          this.autosave();
        });
      }
    });
  },

  /* -------------------------------- modal ------------------------------ */

  say(...lines) {
    this.msgs = lines.map(l => Array.isArray(l) ? { who: l[0], text: l[1] } : { who: '', text: l });
    this._nextMsg();
  },
  _nextMsg() {
    const m = this.msgs.shift();
    if (!m) { Dialogue.hide(); return; }
    Dialogue.show(m.who, m.text);
  },
  toast(text) { this.toastText = text; this.toastT = 4.2; },

  // pick the score for whatever is happening
  syncMusic() {
    let want = 'sea';
    // pausing keeps whatever was playing
    const st = this.state === 'pause' ? this.pausedFrom : this.state;
    if (st === 'menu') want = 'title';
    else if (st === 'battle') want = (Battle.def && Battle.def.boss) ? 'boss' : 'battle';
    else if (st === 'dive') want = !Dive.underwater ? 'sea' : !Dive.boss ? 'dive' : Dive.boss.dead ? 'lanthorne' : 'abyss';
    else if (st === 'cutscene') want = this.endingRun ? 'ending' : this.cutKind === 'girl' ? 'lanthorne' : (this.night < .5 ? 'title' : 'sea');
    if (want !== this._musicWant) { this._musicWant = want; Music.set(want); }
  },

  fadeOut(cb) { this.fade.dir = 1; this.fade.cb = cb; },

  /* -------------------------------- frame ------------------------------ */

  flashMsg(text) { this.muteMsg = text; this.muteFlash = 1.6; },

  frame(dt, rawDt) {
    this.t += dt;
    if (rawDt > 0) this.fps += (1 / rawDt - this.fps) * .08;

    if (Input.tap('mute')) {
      Settings.set('muted', !Settings.data.muted);
      this.flashMsg(Settings.data.muted ? 'sound off' : 'sound on');
    }
    if (Input.tap('music')) {
      Settings.set('musicOff', !Settings.data.musicOff);
      this.flashMsg(Settings.data.musicOff ? 'music off' : 'music on');
    }
    if (Input.tap('fullscreen')) Settings.set('fullscreen', !Settings.data.fullscreen);
    this.muteFlash = Math.max(0, this.muteFlash - dt);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 2.2);
    this.syncMusic();

    // fade machine
    if (this.fade.dir !== 0) {
      this.fade.a += this.fade.dir * dt * 2.4;
      if (this.fade.a >= 1 && this.fade.dir > 0) {
        this.fade.a = 1; this.fade.dir = -1;
        if (this.fade.cb) { const c = this.fade.cb; this.fade.cb = null; c(); }
      } else if (this.fade.a <= 0 && this.fade.dir < 0) { this.fade.a = 0; this.fade.dir = 0; }
    }

    if (Lore.open) Lore.update(dt);
    else if (Bestiary.book) Bestiary.update(dt);
    else switch (this.state) {
      case 'menu':     this.updateMenu(dt); break;
      case 'cutscene': CUT.update(dt); break;
      case 'play':     this.updatePlay(dt); break;
      case 'fish':     if (Input.tap('cancel')) this.pause(); else Fishing.update(dt); break;
      case 'battle':   if (Input.tap('cancel')) this.pause(); else Battle.update(dt); break;
      case 'dive':     if (Input.tap('cancel') && Dive.phase === 'swim') this.pause(); else Dive.update(dt); break;
      case 'shop':     Shop.update(dt); break;
      case 'pause':    Menu.update(dt); break;
    }

    Cam.update(dt);
    Particles.update(dt);
    Floaters.update(dt);
    this.toastT = Math.max(0, this.toastT - dt);

    this.draw();
    // underwater, the crosshair stands in for the mouse pointer
    const cursor = this.state === 'dive' && Dive.underwater && Dive.mouseAim ? 'none' : 'default';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    Input.endFrame();
  },

  /* -------------------------------- title ------------------------------ */

  updateMenu(dt) {
    this.night = 0.88;
    Cam.x = 560 + Math.sin(this.t * .12) * 60;
    Menu.update(dt);
  },

  /* --------------------------------- play ------------------------------ */

  nearestSpot() {
    let best = null, bd = 1e9;
    for (const s of SPOTS) {
      const d = Math.abs(Player.x - s.x);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    if (best && this.spotLabel(best) === null) return null;
    return best;
  },

  spotLabel(s) {
    if (s.id === 'helm')  return FINALE.ready() ? 'Sail home' : null;
    if (s.id === 'crate') return Player.weapon < 0 ? 'Open the crate' : null;
    if (s.id === 'stall') return 'Talk to Dorran';
    if (s.id === 'fish')  return Player.suit >= 0 ? 'Dive' : 'Cast your line';
    return null;
  },

  useSpot(s) {
    if (s.id === 'helm') { if (FINALE.ready()) this.startFinale(); return; }
    if (s.id === 'crate') {
      if (Player.weapon >= 0) return;
      Player.weapon = 0;
      this.crateOpen = true;
      Sfx.buy();
      Particles.burst(392 - Cam.x, DECK_Y - 50, 20, {
        color: '#f0cf8a', vy: rand(-240, -60), g: 520, size: rand(2, 5), life: .9, fixed: true
      });
      this.toast('Took the dip net.');
      this.narrate('crate');
      this.autosave();
      return;
    }
    // at the counter he says it to your face instead
    if (s.id === 'stall') { this.bark.text = ''; Shop.open(); return; }
    if (s.id === 'fish') {
      if (Player.suit >= 0) {
        this.state = 'dive';
        Dive.start();
        return;
      }
      if (Player.weapon < 0) {
        this.narrate('noNet');
        return;
      }
      Player.casts++;
      this.state = 'fish';
      Fishing.start();
      return;
    }
  },

  updatePlay(dt) {
    const P = Player;
    P.animT += dt;

    this._dorran(dt, Dialogue.active);

    // modal dialogue takes priority
    if (Dialogue.active) {
      Dialogue.update(dt);
      P.state = 'idle';
      if (Dialogue.pressed() && Dialogue.press()) this._nextMsg();
      return;
    }

    if (Input.tap('cancel')) { this.pause(); return; }

    let mv = 0;
    if (Input.held('left')) mv--;
    if (Input.held('right')) mv++;
    const onGround = P.y >= DECK_Y - .01;

    if (mv !== 0) { P.face = mv; }
    P.x = clamp(P.x + mv * 236 * dt, WALK_L, WALK_R);

    if (Input.tap('jump') && onGround) { P.vy = -560; Sfx.whoosh(); }
    P.vy += 1750 * dt;
    P.y += P.vy * dt;
    if (P.y >= DECK_Y) {
      if (P.vy > 260) P.landT = .2;
      P.y = DECK_Y; P.vy = 0;
    }
    P.landT = Math.max(0, (P.landT || 0) - dt);
    P.air = P.y - DECK_Y;

    P.state = !onGround ? 'jump' : (mv !== 0 ? 'walk' : 'idle');
    if (P.state === 'walk' && chance(dt * 5.5)) Sfx.step();

    // patch yourself up between fights
    if (Input.tap('use')) {
      if (P.bandages > 0 && P.hp < P.maxHp) {
        P.bandages--; P.hp = Math.min(P.maxHp, P.hp + 2);
        Sfx.heal();
        if (Prefs.damageNumbers) Floaters.add(P.x, DECK_Y - 70, '+2', { color: '#8ce0a4', size: 22 });
        Particles.burst(P.x, DECK_Y - 40, 12, { color: '#a8f0c0', vy: -90, g: 120, size: 3, life: .8 });
      } else if (P.hp >= P.maxHp) {
        this.toast('Nothing to bind. You are whole enough.');
      } else {
        Sfx.deny();
        this.toast('No bandages left. Dorran sells them.');
      }
    }

    Cam.follow(P.x, dt, 4.2);

    const spot = this.nearestSpot();
    if (spot && (Input.tap('interact'))) this.useSpot(spot);
  },

  /* -------------------------------- drawing ---------------------------- */

  draw() {
    const g = bctx;
    resetTransform(g);
    g.clearRect(0, 0, VIEW_W, VIEW_H);

    // what is underneath a pause is what gets drawn
    const scene = this.state === 'pause' ? this.pausedFrom : this.state;
    const below = scene === 'dive' && Dive.underwater;

    if (below) {
      Dive.draw(g);
    } else {
      g.save();
      g.translate(Cam.shakeX, Cam.shakeY);
      this.drawWorld(g, scene);
      g.restore();
    }

    // ---- overlays (no shake) ----
    switch (this.state) {
      case 'menu':     Menu.draw(g); break;
      case 'cutscene': CUT.drawOverlay(g); break;
      case 'play':     this.drawHUD(g); this.drawBark(g); Dialogue.draw(g); break;
      case 'fish':     if (Fishing.phase !== 'reel') this.drawHUD(g); Fishing.drawUI(g); break;
      case 'battle':   this.drawBattleHUD(g); Battle.drawUI(g); break;
      case 'shop':     Shop.draw(g); break;
      case 'dive':     Dive.drawUI(g); break;
      case 'pause':    if (below) Dive.drawHUD(g); else this.drawHUD(g); Menu.draw(g); break;
    }

    if (!below) Floaters.draw(g, Cam.x);

    if (this.toastT > 0 && this.state === 'play') {
      const a = clamp(Math.min(this.toastT, 1), 0, 1);
      const w = Text.width(g, this.toastText, { size: 17, font: 'Georgia, serif' }) + 46;
      g.save(); g.globalAlpha = a;
      panel(g, VIEW_W / 2 - w / 2, VIEW_H - 74, w, 42, { alpha: .9 });
      Text.draw(g, this.toastText, VIEW_W / 2, VIEW_H - 47, {
        size: 17, align: 'center', color: '#e8e3d6', italic: true
      });
      g.restore();
    }

    if (this.muteFlash > 0) {
      g.save(); g.globalAlpha = clamp(this.muteFlash, 0, 1);
      Text.draw(g, this.muteMsg || '', VIEW_W - 24, 28, {
        size: 14, align: 'right', color: '#9fb0d0', font: 'Verdana, sans-serif'
      });
      g.restore();
    }

    if (Prefs.showFps) {
      Text.draw(g, Math.round(this.fps) + ' FPS', 14, VIEW_H - 10, {
        size: 14, color: '#9fe6a0', outline: 'rgba(0,0,0,.8)'
      });
    }

    // a red bloom round the edges when something lands on you
    if (this.hurtFlash > 0) {
      const a = this.hurtFlash;
      g.save();
      stepVignette(g, 'rgb(180,20,30)', a * .9, true);
      g.restore();
    }

    if (Bestiary.book) Bestiary.draw(g);
    if (Lore.open) Lore.draw(g);

    if (this.fade.a > 0) {
      g.fillStyle = 'rgba(3,4,10,' + this.fade.a + ')';
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    present();   // buffer -> screen, nearest-neighbour
  },

  // Dorran's words in a bubble over his stall, typed out as he says them
  drawBark(g) {
    const B = this.bark;
    if (!B.text || Dialogue.active) return;
    const o = { size: 15, color: '#2c2430' };
    const lines = Text.wrap(g, B.text, 250, o);
    const w = Math.max(...lines.map(l => Text.width(g, l, o))) + 26, h = lines.length * 20 + 16;
    const hx = STALL_X + 8 - Cam.x, hy = DECK_Y - 142;
    const x = snap(clamp(hx - w / 2, 10, VIEW_W - w - 10)), y = snap(hy - h - 10);
    let left = Math.floor(B.t * 45);
    g.save();
    g.globalAlpha = clamp(Math.min(B.t * 8, (this.barkLife(B.text) - B.t) * 3), 0, 1);
    g.fillStyle = '#1c1620';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#efe4c8';
    g.fillRect(x, y, w, h);
    if (hx > 0 && hx < VIEW_W) {
      const tx = snap(clamp(hx, x + 14, x + w - 22));
      g.fillStyle = '#1c1620'; g.fillRect(tx - 2, y + h, 12, 4); g.fillRect(tx, y + h + 4, 8, 4); g.fillRect(tx + 2, y + h + 8, 4, 4);
      g.fillStyle = '#efe4c8'; g.fillRect(tx, y + h - 2, 8, 4); g.fillRect(tx + 2, y + h + 2, 4, 4);
    }
    for (let i = 0; i < lines.length && left > 0; i++) {
      Text.draw(g, lines[i].slice(0, left), x + 13, y + 23 + i * 20, o);
      left -= lines[i].length + 1;
    }
    g.restore();
  },

  drawWorld(g, scene) {
    const t = this.t, night = this.night;
    scene = scene || this.state;

    // the whole world slides up when you are following a line down
    g.save();
    g.translate(0, -snap(this.viewY));
    if (this.viewY > 1) {
      // keep the top of the frame from going transparent as the sky rides up
      g.fillStyle = css(skyAt(night).top);
      g.fillRect(0, -this.viewY - 20, VIEW_W, this.viewY + 24);
    }

    Art.sky(g, night, t);
    Art.harbour(g, CUT.harbourX, night, t);
    Art.sea(g, Cam.x, t, night);
    if (CUT.allowShadows > 0 && night > .5) Art.shadows(g, t, Cam.x, 3);

    // ---- the boat (rocks as one piece) ----
    Art.beginBoat(g, t);
    Art.boatBack(g, Cam.x, t, night, { crateOpen: this.crateOpen });

    // actors on deck
    if (CUT.drops.visible) Art.drops(g, CUT.drops.x - Cam.x, DECK_Y, this.t);
    if (CUT.girl.visible) {
      Art.girl(g, CUT.girl.x - Cam.x, CUT.girl.y, { face: CUT.girl.face, t: this.t, pose: CUT.girl.pose, rot: CUT.girl.rot });
    }
    if (CUT.dad.visible) {
      Art.dad(g, CUT.dad.x - Cam.x + (this.state === 'cutscene' ? 0 : 0), DECK_Y,
        { face: CUT.dad.face, t: this.t, state: CUT.dad.state });
    }

    if (scene === 'battle') {
      Battle.drawActors(g);
    } else {
      this.drawPlayerOnDeck(g);
    }

    Art.boatFront(g, Cam.x, t, night);

    // station markers float above the rail, behind the water line
    if (scene === 'play') this.drawSpotMarkers(g);

    Art.endBoat(g);

    Art.seaFront(g, Cam.x, t, night);

    // everything below the surface, once a line is down there
    if (scene === 'fish' && (this.viewY > 1 || Fishing.hook.depth > 0)) {
      const info = Fishing.waterInfo();
      Art.underwater(g, {
        viewY: this.viewY, t, night, shapes: info.shapes, watcher: info.watcher
      });
    }

    // the enormous thing, passing between you and the boat
    if (CUT.bigShadow > 0) this.drawBigShadow(g, CUT.bigShadow, t);

    // fishing line hangs over the near rail, in front of the water
    if (scene === 'fish') Fishing.drawLine(g);

    Particles.draw(g, 0, 'water');

    // wake
    if (CUT.wake > 0) {
      g.save();
      g.globalAlpha = .28 * CUT.wake;
      g.fillStyle = '#dcecf6';
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 137 + t * 240) % (VIEW_W + 200)) - 100;
        const sy = 470 + (i % 5) * 16 + Math.sin(t * 2 + i) * 4;
        g.fillRect(sx, sy, 22 + (i % 4) * 14, 2);
      }
      g.restore();
    }

    g.restore();          // end of the vertical view pan

    Particles.draw(g, scene === 'fish' ? 0 : Cam.x);

    Art.nightTint(g, night * .5);
    Art.vignette(g, night);

  },

  // a silhouette longer than the boat, sliding by just under the surface
  drawBigShadow(g, p, t) {
    const x = lerp(VIEW_W + 620, -900, p);
    const y = 506;
    g.save();

    // the swell it pushes ahead of itself
    g.globalAlpha = .5;
    g.strokeStyle = 'rgba(214,236,250,.7)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 520, y - 44);
    g.quadraticCurveTo(x, y - 74 + Math.sin(t * 2) * 3, x + 520, y - 44);
    g.stroke();

    g.globalAlpha = .78;
    g.fillStyle = '#01040c';
    // body
    g.beginPath();
    g.ellipse(x, y, 520, 62, 0, 0, 6.2832);
    g.fill();
    // tail
    g.beginPath();
    g.moveTo(x - 500, y);
    g.lineTo(x - 660, y - 74);
    g.lineTo(x - 620, y);
    g.lineTo(x - 660, y + 60);
    g.closePath(); g.fill();
    // dorsal breaking the surface
    const fin = Math.sin(t * 1.2) * 4;
    g.beginPath();
    g.moveTo(x - 30, y - 40);
    g.quadraticCurveTo(x + 60, y - 140 + fin, x + 34, y - 46);
    g.closePath(); g.fill();
    // an eye, briefly
    if (p > .38 && p < .72) {
      g.globalAlpha = clamp(Math.min((p - .38), (.72 - p)) * 9, 0, 1) * .85;
      g.fillStyle = '#ff4d4d';
      g.beginPath(); g.arc(x + 330, y - 20, 7, 0, 6.2832); g.fill();
      g.globalCompositeOperation = 'lighter';
      stepGlow(g, x + 330, y - 20, 60, 'rgb(255,60,60)', .5, { steps: 3 });
    }
    g.restore();
  },

  drawPlayerOnDeck(g) {
    const P = Player;
    const scene = this.state === 'pause' ? this.pausedFrom : this.state;
    if (scene === 'dive') { Dive.drawDeckPlayer(g); return; }
    const sx = P.x - Cam.x;
    const o = { face: P.face, t: P.animT, state: P.state, squash: bodySquash(P) };

    if (scene === 'fish') {
      o.hold = 'rod';
      o.state = 'idle';
      Object.assign(o, Fishing.rodPose());
      o.backArm = 0.5;
    } else if (P.weapon >= 0) {
      o.hold = 'weapon';
      o.weapon = deckWeapon();
      o.weaponAngle = -1.15 + Math.sin(P.animT * 2) * .04;
      o.frontArm = 0.35;
    }
    Art.boy(g, sx, P.y, o);
  },

  drawSpotMarkers(g) {
    for (const s of SPOTS) {
      const label = this.spotLabel(s);
      if (!label) continue;
      const sx = s.x - Cam.x;
      if (sx < -60 || sx > VIEW_W + 60) continue;
      const d = Math.abs(Player.x - s.x);
      const near = d < s.r;
      const bobY = Math.sin(this.t * 2.4 + s.x) * 4;

      if (!near) {
        g.save();
        g.globalAlpha = .55;
        Text.draw(g, '▾', sx, DECK_Y - 118 + bobY, {
          size: 22, align: 'center', color: '#f0cf8a', outline: 'rgba(0,0,0,.6)', outlineW: 4
        });
        g.restore();
      } else {
        const txt = '[E] ' + label;
        const w = Text.width(g, txt, { size: 16, font: 'Verdana, sans-serif' }) + 26;
        const px = clamp(sx - w / 2, 8, VIEW_W - w - 8);
        panel(g, px, DECK_Y - 146 + bobY, w, 32, { alpha: .93 });
        Text.draw(g, txt, px + w / 2, DECK_Y - 124 + bobY, {
          size: 16, align: 'center', color: '#f6e9c6', font: 'Verdana, sans-serif'
        });
      }
    }
  },

  /* --------------------------------- HUD ------------------------------- */

  drawHearts(g, x, y) {
    for (let i = 0; i < Player.maxHp; i++) {
      Art.heart(g, x + i * 24, y, i < Player.hp);
    }
  },

  drawHUD(g) {
    // hearts
    this.drawHearts(g, 34, 34);

    // coins
    Art.coin(g, 32, 66, 1);
    Text.draw(g, String(Player.coins), 48, 73, {
      size: 20, color: '#f0cf8a', weight: 'bold', font: 'Verdana, sans-serif',
      outline: 'rgba(0,0,0,.6)', outlineW: 3
    });

    // hold
    if (Player.catches.length) {
      Art.fishIcon(g, 40, 100, .9, Player.catches[Player.catches.length - 1].body, Player.catches[Player.catches.length - 1].belly);
      Text.draw(g, '×' + Player.catches.length, 60, 106, {
        size: 16, color: '#cfd8ea', font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
      });
    }
    if (Player.bandages) {
      Text.draw(g, '❤ ×' + Player.bandages + '  [Q]', 34, 130, {
        size: 13, color: '#9fd8b0', font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
      });
    }

    // gear, top right
    // after the Old One, the gear that matters is what you dive in
    const diving = Player.suit >= 0;
    const rodName = diving ? SUITS[Player.suit].name : RODS[Player.rod].name;
    const swName = diving ? DIVE_WEAPONS[Math.max(0, Player.diveWeapon)].name
      : Player.weapon >= 0 ? deckWeapon().name : 'unarmed';
    Text.draw(g, rodName, VIEW_W - 24, 34, {
      size: 14, align: 'right', color: '#b9c4dd', font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
    });
    Text.draw(g, swName, VIEW_W - 24, 54, {
      size: 14, align: 'right', color: diving || Player.weapon >= 0 ? '#d8cdb4' : '#8a8a96',
      font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
    });

    // objective
    if (this.state === 'play' && !Dialogue.active) {
      Text.draw(g, this.objective(), VIEW_W / 2, 34, {
        size: 16, align: 'center', color: 'rgba(232,227,214,.8)', italic: true,
        outline: 'rgba(0,0,0,.65)', outlineW: 4
      });
    }
  },

  drawBattleHUD(g) {
    this.drawHearts(g, 34, 34);
    if (Player.bandages) {
      Text.draw(g, '❤ ×' + Player.bandages + '  [Q]', 34, 66, {
        size: 13, color: '#9fd8b0', font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
      });
    }
    const swName = Player.weapon >= 0 ? deckWeapon().name : 'bare hands';
    Text.draw(g, swName, VIEW_W - 24, 34, {
      size: 14, align: 'right', color: '#d8cdb4', font: 'Verdana, sans-serif', outline: 'rgba(0,0,0,.6)', outlineW: 3
    });
  },

  objective() {
    if (Player.weapon < 0) return 'Find some gear in the crate by the cabin';
    if (Player.catches.length) return 'Sell your catch to Dorran at the stall';
    if (Player.totalKills === 0) return 'Cast a line at the bow';
    if (FINALE.ready() && !Player.sawEnding) return 'Take the Margaret home: the wheel is in the wheelhouse';
    if (Player.beatMother) return 'Lanthorne is lit again. The sea is yours.';
    if (Player.suit >= 0) {
      if (Player.suit < SUITS.length - 1) return 'Dive at the bow. A better suit goes deeper.';
      return 'Dive to the bottom. Lanthorne is down there.';
    }
    if (Player.beatBoss) return 'The sea is quiet again. For now.';
    if (Player.rod < RODS.length - 1) return 'Deeper line reaches deeper things';
    return 'Something is still down there';
  }
};


Game.init();

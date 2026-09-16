'use strict';
/* ========================================================================
   menu.js — the title menu, the pause menu, and every options screen.

   A screen is just a list of items. Items describe themselves (a button,
   a toggle bound to a setting, a slider, a key binding...) and one set of
   rules handles moving, changing and activating them for both keyboard
   and mouse, so no screen has its own input code.
   ======================================================================== */

const CHOICE_LABELS = {
  fullscreen: { false: 'Windowed', true: 'Fullscreen' },
  scaling:    { sharp: 'Sharp pixels', fill: 'Fill window' },
  quality:    { auto: 'Auto', high: 'High', low: 'Low' },
  shake:      { 0: 'Off', .5: 'Low', 1: 'Full' },
  particles:  { low: 'Low', high: 'High' },
  textSpeed:  { slow: 'Slow', normal: 'Normal', fast: 'Fast', instant: 'Instant' }
};

// on a Mac F11 belongs to the system; the window's own shortcut is Ctrl+Cmd+F
function onMac() {
  const n = window.navigator || {};
  return /Mac/i.test(String(n.platform || '') + ' ' + String(n.userAgent || ''));
}
function fullscreenKeyLabel() { return onMac() ? 'CTRL+CMD+F' : 'F11'; }

const SCREEN_TITLES = {
  pause: 'PAUSED', options: 'OPTIONS', graphics: 'GRAPHICS', audio: 'AUDIO',
  controls: 'CONTROLS', gameplay: 'GAMEPLAY', credits: 'CREDITS',
  confirmNew: 'NEW VOYAGE', confirmReset: 'RESET SETTINGS', confirmQuit: 'QUIT',
  saveSlots: 'SAVE GAME', loadSlots: 'LOAD GAME', confirmOverwrite: 'OVERWRITE', confirmLoad: 'LOAD',
  dev: 'TEST SHORTCUTS'
};

// screens whose rows carry long values
const WIDE_SCREENS = ['controls', 'graphics', 'audio', 'credits', 'saveSlots', 'loadSlots', 'dev'];

const Menu = {
  context: 'main',     // 'main' (title screen) or 'pause'
  stack: ['main'],
  sel: {},
  rebinding: null,     // the action waiting for a key, while rebinding
  pendingSlot: 0,      // the slot a confirm screen is asking about
  notice: '', noticeT: 0,
  t: 0,
  hits: [],            // clickable rows from the last draw

  /* ------------------------------ navigation ---------------------------- */

  openMain() {
    this.context = 'main';
    this.stack = ['main'];
    this.sel = {};
    this.rebinding = null;
    Input.cancelCapture();
  },

  openPause() {
    this.context = 'pause';
    this.stack = ['pause'];
    this.sel = {};
    this.rebinding = null;
    Input.cancelCapture();
  },

  top() { return this.stack[this.stack.length - 1]; },

  push(id) {
    this.stack.push(id);
    this.sel[id] = this.firstSelectable(this.items(id));
    Sfx.select();
  },

  // one level up; at the root of the pause menu, that means back to the game
  back() {
    if (this.rebinding) return;
    if (this.stack.length > 1) {
      this.stack.pop();
      Sfx.select();
      return true;
    }
    if (this.context === 'pause') { Game.resume(); return true; }
    return false;
  },

  say(text) { this.notice = text; this.noticeT = 2.4; },

  /* -------------------------------- screens ----------------------------- */

  items(id) {
    const hasSave = SaveGame.exists();
    const isApp = !!(window.native && window.native.isApp);
    switch (id) {
      case 'main': return [
        { kind: 'action', label: 'Continue', id: 'continue', hidden: !hasSave, run: () => Game.continueGame() },
        { kind: 'action', label: 'Load game', id: 'load', hidden: !SaveGame.anySlot(), run: () => this.push('loadSlots') },
        { kind: 'action', label: 'New voyage', id: 'new', run: () => hasSave ? this.push('confirmNew') : Game.beginVoyage() },
        { kind: 'action', label: 'Options', id: 'options', run: () => this.push('options') },
        { kind: 'action', label: 'Test shortcuts', id: 'dev', run: () => this.push('dev') },
        { kind: 'action', label: 'Credits', id: 'credits', run: () => this.push('credits') },
        { kind: 'action', label: 'Quit', id: 'quit', hidden: !isApp, run: () => this.push('confirmQuit') }
      ].filter(i => !i.hidden);

      case 'pause': return [
        { kind: 'action', label: 'Resume', id: 'resume', run: () => Game.resume() },
        { kind: 'action', label: 'Save game', id: 'save', run: () => this.push('saveSlots') },
        { kind: 'action', label: 'Load game', id: 'load', hidden: !SaveGame.anySlot(), run: () => this.push('loadSlots') },
        { kind: 'action', label: 'Journal  (' + Player.lore.length + '/' + LORE.length + ')', id: 'journal', run: () => this.push('journal') },
        { kind: 'action', label: 'Options', id: 'options', run: () => this.push('options') },
        { kind: 'action', label: 'Save and return to title', id: 'title', run: () => Game.quitToTitle() },
        { kind: 'action', label: 'Save and quit game', id: 'quit', hidden: !isApp, run: () => Game.quitApp() },
        { kind: 'gap' },
        { kind: 'text', label: Player.coins + '§ in pocket   ·   ' + Player.totalKills + ' killed   ·   ' + Player.catches.length + ' in the hold' }
      ].filter(i => !i.hidden);

      case 'options': return [
        { kind: 'action', label: 'Graphics', id: 'graphics', run: () => this.push('graphics') },
        { kind: 'action', label: 'Audio', id: 'audio', run: () => this.push('audio') },
        { kind: 'action', label: 'Controls', id: 'controls', run: () => this.push('controls') },
        { kind: 'action', label: 'Gameplay', id: 'gameplay', run: () => this.push('gameplay') },
        { kind: 'gap' },
        { kind: 'action', label: 'Reset all settings', id: 'reset', run: () => this.push('confirmReset') },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];

      case 'graphics': return [
        { kind: 'choice', label: 'Display mode', key: 'fullscreen' },
        { kind: 'choice', label: 'Pixel scaling', key: 'scaling' },
        { kind: 'choice', label: 'Render quality', key: 'quality' },
        { kind: 'slider', label: 'Brightness', key: 'brightness' },
        { kind: 'choice', label: 'Screen shake', key: 'shake' },
        { kind: 'choice', label: 'Particles', key: 'particles' },
        { kind: 'toggle', label: 'Show FPS', key: 'showFps' },
        { kind: 'gap' },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];

      case 'audio': return [
        { kind: 'slider', label: 'Master volume', key: 'master' },
        { kind: 'slider', label: 'Music', key: 'music' },
        { kind: 'slider', label: 'Sound effects', key: 'sfx' },
        { kind: 'toggle', label: 'Mute everything', key: 'muted' },
        { kind: 'toggle', label: 'Music off', key: 'musicOff' },
        { kind: 'toggle', label: 'Mute when in background', key: 'muteUnfocused' },
        { kind: 'gap' },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];

      case 'controls': return REBINDABLE.map(a => ({ kind: 'bind', label: ACTION_LABELS[a], action: a })).concat([
        { kind: 'gap' },
        { kind: 'text', label: 'Menus: arrows, ENTER, ESC      Pause: ESC' },
        { kind: 'text', label: 'Mute: M      Music: N      Fullscreen: ' + fullscreenKeyLabel() },
        { kind: 'action', label: 'Reset controls', id: 'resetControls', run: () => { Settings.resetBindings(); this.say('Controls reset to defaults.'); } },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ]);

      case 'gameplay': return [
        { kind: 'choice', label: 'Text speed', key: 'textSpeed' },
        { kind: 'toggle', label: 'Damage numbers', key: 'damageNumbers' },
        { kind: 'gap' },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];

      case 'confirmNew': return [
        { kind: 'text', label: 'Start a new voyage from the harbour?' },
        { kind: 'text', label: 'Your saved progress will be lost.' },
        { kind: 'gap' },
        { kind: 'action', label: 'Yes, start over', id: 'yes', run: () => { SaveGame.clear(); Game.beginVoyage(); } },
        { kind: 'action', label: 'No', id: 'no', run: () => this.back() }
      ];

      case 'confirmReset': return [
        { kind: 'text', label: 'Put every setting and key back to its default?' },
        { kind: 'gap' },
        { kind: 'action', label: 'Reset', id: 'yes', run: () => { Settings.resetAll(); this.back(); this.say('Settings reset.'); } },
        { kind: 'action', label: 'Cancel', id: 'no', run: () => this.back() }
      ];

      case 'confirmQuit': return [
        { kind: 'text', label: 'Leave the Margaret for now?' },
        { kind: 'gap' },
        { kind: 'action', label: 'Quit', id: 'yes', run: () => Game.quitApp() },
        { kind: 'action', label: 'Stay', id: 'no', run: () => this.back() }
      ];

      case 'saveSlots':
      case 'loadSlots': {
        const saving = id === 'saveSlots';
        const rows = [];
        for (let n = 1; n <= SLOT_COUNT; n++) {
          const d = SaveGame.readSlot(n);
          rows.push({
            kind: 'slot', id: 'slot' + n, slot: n, empty: !d,
            label: 'Slot ' + n + '    ' + SaveGame.describe(d), value: SaveGame.stamp(d),
            run: () => saving ? this.chooseSave(n, d) : this.chooseLoad(n, d)
          });
        }
        return rows.concat([
          { kind: 'gap' },
          { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
        ]);
      }

      case 'confirmOverwrite': return [
        { kind: 'text', label: 'Slot ' + this.pendingSlot + ' already holds a voyage.' },
        { kind: 'text', label: 'Save over it?' },
        { kind: 'gap' },
        { kind: 'action', label: 'Overwrite', id: 'yes', run: () => { this.back(); this.saveTo(this.pendingSlot); } },
        { kind: 'action', label: 'Cancel', id: 'no', run: () => this.back() }
      ];

      case 'confirmLoad': return [
        { kind: 'text', label: 'Load slot ' + this.pendingSlot + '?' },
        { kind: 'text', label: 'Anything since you last saved will be lost.' },
        { kind: 'gap' },
        { kind: 'action', label: 'Load', id: 'yes', run: () => Game.loadSlot(this.pendingSlot) },
        { kind: 'action', label: 'Cancel', id: 'no', run: () => this.back() }
      ];

      // jumps for trying out later parts of the game without playing up to them
      case 'dev': return [
        { kind: 'text', label: 'For testing. Each shortcut replaces your Continue save.' },
        { kind: 'gap' },
        { kind: 'action', label: 'Fight the Old One, fully geared', id: 'devOldOne', run: () => Game.devFinalBoss() },
        { kind: 'action', label: 'Start diving, with the first suit', id: 'devDiving', run: () => Game.devDiving() },
        { kind: 'action', label: 'Swim to the Mother Below, fully geared', id: 'devMother', run: () => Game.devMother() },
        { kind: 'action', label: 'Sail home: the ending and the credits', id: 'devFinale', run: () => Game.devFinale() },
        { kind: 'gap' },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];

      // everything found so far, in the order it was found
      case 'journal': {
        const rows = Player.lore.map(id => loreDef(id)).filter(Boolean).map(L => ({
          kind: 'action', label: (L.kind === 'relic' ? 'Relic: ' : 'Letter: ') + L.title, id: 'lore-' + L.id, run: () => Lore.read(L.id)
        }));
        if (!rows.length) rows.push({ kind: 'text', label: 'Nothing yet. Bottles come up on lines; other things lie on the bottom.' });
        return [
          { kind: 'text', label: Lore.count('letter') + ' of ' + Lore.total('letter') + ' letters   ·   ' + Lore.count('relic') + ' of ' + Lore.total('relic') + ' relics' },
          { kind: 'gap' },
          ...rows,
          { kind: 'gap' },
          { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
        ];
      }

      case 'credits': return [
        { kind: 'text', label: 'DEEP SUPPER' },
        { kind: 'text', label: 'Made by Daniel Kyhl' },
        { kind: 'gap' },
        { kind: 'text', label: 'Every pixel drawn and every note synthesised at runtime.' },
        { kind: 'text', label: 'No fish were harmed. Several monsters were.' },
        { kind: 'gap' },
        { kind: 'action', label: 'Back', id: 'back', run: () => this.back() }
      ];
    }
    return [];
  },

  /* ----------------------------- save slots ----------------------------- */

  chooseSave(n, existing) {
    if (existing) { this.pendingSlot = n; this.push('confirmOverwrite'); return; }
    this.saveTo(n);
  },

  saveTo(n) {
    if (Game.saveSlot(n)) { Sfx.buy(); this.say('Saved to slot ' + n + '.'); }
    else { Sfx.deny(); this.say('Saved for this session only: storage is unavailable.'); }
  },

  chooseLoad(n, d) {
    if (!d) { Sfx.deny(); this.say('Slot ' + n + ' is empty.'); return; }
    // mid-voyage, loading throws away the voyage in progress, so ask first
    if (this.context === 'pause') { this.pendingSlot = n; this.push('confirmLoad'); return; }
    Game.loadSlot(n);
  },

  selectable(it) { return !!it && it.kind !== 'gap' && it.kind !== 'text'; },

  firstSelectable(items) {
    for (let i = 0; i < items.length; i++) if (this.selectable(items[i])) return i;
    return 0;
  },

  // move the cursor, skipping gaps and text, wrapping at the ends
  step(items, from, dir) {
    let i = from;
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length;
      if (this.selectable(items[i])) return i;
    }
    return from;
  },

  /* --------------------------- changing values -------------------------- */

  valueText(it) {
    const d = Settings.data;
    if (it.kind === 'slot') return it.value || '';
    if (it.kind === 'toggle') return d[it.key] ? 'ON' : 'OFF';
    if (it.kind === 'choice') {
      const map = CHOICE_LABELS[it.key] || {};
      const v = d[it.key];
      return '‹ ' + (map[String(v)] !== undefined ? map[String(v)] : String(v)) + ' ›';
    }
    if (it.kind === 'slider') return Math.round(d[it.key] * 100) + '%';
    if (it.kind === 'bind') {
      if (this.rebinding === it.action) return 'press a key…';
      return (d.bindings[it.action] || []).map(keyLabel).join('  /  ');
    }
    return '';
  },

  // left/right on an item
  adjust(it, dir) {
    if (!it) return;
    if (it.kind === 'toggle' || it.kind === 'choice' || it.kind === 'slider') {
      Settings.nudge(it.key, dir);
      Sfx.select();
    }
  },

  // enter or a click on an item; `side` is -1/+1 when a click lands on a value
  activate(it, side) {
    if (!it || !this.selectable(it)) return;
    if (it.kind === 'action' || it.kind === 'slot') { Sfx.select(); it.run(); return; }
    if (it.kind === 'toggle') { Settings.set(it.key, !Settings.data[it.key]); Sfx.select(); return; }
    if (it.kind === 'choice') {
      if (side) return this.adjust(it, side);
      // enter cycles forward, wrapping round
      const spec = SETTINGS_SPEC[it.key];
      const i = spec.values.indexOf(Settings.data[it.key]);
      Settings.set(it.key, spec.values[(i + 1) % spec.values.length]);
      Sfx.select();
      return;
    }
    if (it.kind === 'slider') { this.adjust(it, side || 1); return; }
    if (it.kind === 'bind') this.beginRebind(it.action);
  },

  beginRebind(action) {
    this.rebinding = action;
    Sfx.select();
    Input.captureNext(code => this.finishRebind(action, code));
  },

  finishRebind(action, code) {
    this.rebinding = null;
    if (code === 'Escape') { this.say('Left as it was.'); return; }
    if (RESERVED_KEYS.indexOf(code) >= 0) {
      Sfx.deny();
      this.say(keyLabel(code) + ' is kept for menus and shortcuts.');
      return;
    }
    Settings.bind(action, code);
    Sfx.buy();
    this.say(ACTION_LABELS[action] + ': ' + keyLabel(code));
  },

  /* -------------------------------- update ------------------------------ */

  update(dt) {
    this.t += dt;
    this.noticeT = Math.max(0, this.noticeT - dt);
    if (this.rebinding) return;          // the next key belongs to the rebind
    if (Game.fade.dir > 0) return;       // already leaving this screen

    const id = this.top();
    const items = this.items(id);
    let sel = this.sel[id];
    if (sel === undefined || !this.selectable(items[sel])) sel = this.firstSelectable(items);

    const m = Input.mouse();
    if (m.moved || m.click) {
      const hit = this.hitAt(m.x, m.y);
      if (hit) {
        if (hit.index !== sel && this.selectable(items[hit.index])) { sel = hit.index; Sfx.select(); }
        if (m.click) {
          this.sel[id] = sel;
          this.activate(items[sel], hit.side);
          return;
        }
      }
    }

    if (Input.tap('menuUp')) { sel = this.step(items, sel, -1); Sfx.select(); }
    if (Input.tap('menuDown')) { sel = this.step(items, sel, 1); Sfx.select(); }
    this.sel[id] = sel;

    if (Input.tap('menuLeft')) this.adjust(items[sel], -1);
    if (Input.tap('menuRight')) this.adjust(items[sel], 1);
    if (Input.tap('cancel')) { this.back(); return; }
    if (Input.tap('confirm')) this.activate(items[sel], 0);
  },

  hitAt(x, y) {
    for (const h of this.hits) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        let side = 0;
        if (h.valueX !== undefined && x >= h.valueX) side = x < h.valueMid ? -1 : 1;
        return { index: h.index, side };
      }
    }
    return null;
  },

  /* --------------------------------- draw ------------------------------- */

  draw(g) {
    const id = this.top();
    const items = this.items(id);
    const sel = this.sel[id] === undefined ? this.firstSelectable(items) : this.sel[id];
    this.hits = [];

    if (id === 'main') this.drawMain(g, items, sel);
    else this.drawPanel(g, id, items, sel);

    // panels show notices in their footer; the title screen above its hint
    if (id === 'main' && this.noticeT > 0) {
      g.save();
      g.globalAlpha = clamp(this.noticeT, 0, 1);
      Text.draw(g, this.notice, VIEW_W / 2, VIEW_H - 34, { size: 16, align: 'center', color: '#f0cf8a', outline: 'rgba(0,0,0,.8)' });
      g.restore();
    }
  },

  drawMain(g, items, sel) {
    g.fillStyle = 'rgba(4,6,16,.5)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const y = 132 + Math.sin(this.t * .9) * 3;
    Text.draw(g, 'DEEP SUPPER', VIEW_W / 2, y, {
      size: 78, align: 'center', color: '#f2e2bd', shadow: 'rgba(0,0,0,.85)'
    });
    g.fillStyle = 'rgba(200,164,92,.8)';
    g.fillRect(VIEW_W / 2 - 230, y + 18, 460, 2);
    Text.draw(g, 'a small boy, a large sea, and dinner', VIEW_W / 2, y + 50, {
      size: 22, align: 'center', color: '#a8b4cf', outline: 'rgba(0,0,0,.8)'
    });

    // rows centred on ry: the 28px-tall label sits in the middle of its box;
    // a long menu packs its rows tighter so the last one clears the hint
    const tight = items.length > 5;
    const top = tight ? 240 : 262, rowH = tight ? 38 : 46, boxH = rowH - 6;
    const w = 320, x = VIEW_W / 2 - w / 2;
    items.forEach((it, i) => {
      const ry = top + i * rowH;
      const on = i === sel;
      if (on) {
        g.fillStyle = 'rgba(200,164,92,.18)';
        g.fillRect(x, ry - boxH / 2, w, boxH);
        g.fillStyle = '#e8c76a';
        g.fillRect(x, ry - boxH / 2, 4, boxH);
        g.fillRect(x + w - 4, ry - boxH / 2, 4, boxH);
      }
      Text.draw(g, it.label, VIEW_W / 2, ry + 14, {
        size: 26, align: 'center', color: on ? '#f6e9c6' : '#9aa7c4', outline: 'rgba(0,0,0,.85)'
      });
      this.hits.push({ x, y: ry - boxH / 2, w, h: boxH, index: i });
    });

    Text.draw(g, '↑↓ choose     ENTER select', VIEW_W / 2, VIEW_H - 18, {
      size: 14, align: 'center', color: 'rgba(160,172,200,.7)'
    });
    Text.draw(g, 'v' + GAME_VERSION, VIEW_W - 16, VIEW_H - 18, {
      size: 14, align: 'right', color: 'rgba(160,172,200,.45)'
    });
  },

  drawPanel(g, id, items, sel) {
    g.fillStyle = this.context === 'pause' ? 'rgba(4,6,14,.74)' : 'rgba(4,6,14,.62)';
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    // long lists tighten their rows so the panel always fits on screen
    const rowH = Math.min(34, Math.floor((VIEW_H - 36 - 122) / Math.max(1, items.length)));
    const wide = WIDE_SCREENS.indexOf(id) >= 0;
    const W = wide ? 720 : 580;
    const H = 92 + items.length * rowH + 30;
    const X = VIEW_W / 2 - W / 2;
    const Y = Math.max(18, VIEW_H / 2 - H / 2);
    panel(g, X, Y, W, H, { alpha: .97 });

    Text.draw(g, SCREEN_TITLES[id] || '', VIEW_W / 2, Y + 50, {
      size: 34, align: 'center', color: '#f2e2bd'
    });

    const valueX = X + W * .52;
    items.forEach((it, i) => {
      const ry = Y + 92 + i * rowH;
      if (it.kind === 'gap') return;
      if (it.kind === 'text') {
        Text.draw(g, it.label, VIEW_W / 2, ry + 6, { size: 16, align: 'center', color: '#8d97b4' });
        return;
      }
      const on = i === sel;
      if (on) {
        g.fillStyle = 'rgba(200,164,92,.16)';
        g.fillRect(X + 16, ry - 14, W - 32, 28);
        g.fillStyle = '#e8c76a';
        g.fillRect(X + 16, ry - 14, 4, 28);
      }
      const hasValue = it.kind !== 'action';
      const labelCol = on ? '#f6e9c6' : (it.empty ? '#6f7892' : '#c4cbe0');
      Text.draw(g, it.label, hasValue ? X + 40 : VIEW_W / 2, ry + 6, {
        size: 18, align: hasValue ? 'left' : 'center', color: labelCol
      });
      if (hasValue) {
        if (it.kind === 'slider') this.drawSlider(g, valueX, ry, W * .48 - 50, Settings.data[it.key], it.key, on);
        else {
          const blink = this.rebinding === it.action && Math.sin(this.t * 8) < 0;
          Text.draw(g, this.valueText(it), X + W - 40, ry + 6, {
            size: 18, align: 'right',
            color: blink ? 'rgba(240,207,138,.35)' : (on ? '#f0cf8a' : '#9aa7c4')
          });
        }
      }
      this.hits.push({
        x: X + 16, y: ry - 14, w: W - 32, h: 28, index: i,
        valueX: hasValue ? valueX : undefined,
        valueMid: valueX + (X + W - 40 - valueX) / 2
      });
    });

    const adjustable = items.some(i => i.kind === 'slider' || i.kind === 'choice' || i.kind === 'toggle');
    const hint = this.rebinding ? 'press the new key     ESC cancel'
      : !adjustable ? '↑↓ choose     ENTER select     ESC back'
      : '↑↓ choose     ←→ change     ENTER select     ESC back';
    if (this.noticeT > 0 && !this.rebinding) {
      Text.draw(g, this.notice, VIEW_W / 2, Y + H - 12, { size: 14, align: 'center', color: '#f0cf8a' });
    } else {
      Text.draw(g, hint, VIEW_W / 2, Y + H - 12, { size: 14, align: 'center', color: 'rgba(160,172,200,.7)' });
    }
  },

  drawSlider(g, x, y, w, v, key, on) {
    const spec = SETTINGS_SPEC[key];
    const f = (v - spec.min) / (spec.max - spec.min);
    const segs = 10, gap = 4;
    const sw = Math.floor((w - 60 - gap * (segs - 1)) / segs);
    for (let i = 0; i < segs; i++) {
      g.fillStyle = (i + .5) / segs <= f ? (on ? '#e8c76a' : '#b89a58') : 'rgba(120,132,164,.3)';
      g.fillRect(snap(x + i * (sw + gap)), y - 6, sw, 12);
    }
    Text.draw(g, Math.round(v * 100) + '%', x + w, y + 6, { size: 18, align: 'right', color: on ? '#f0cf8a' : '#9aa7c4' });
  }
};

'use strict';
/* ========================================================================
   ship.js — the Margaret, as pixel art.

   The boat is painted in world coordinates through the same workbench as
   everything else, in a few layers: the wall, cabin and stall behind the
   crew; the mast and its sail; everything a working boat accumulates; the
   counter Dorran leans on; and the hull in front. What never moves is
   rasterised once and put down every frame; what sways is rasterised on
   whole animation steps. Lights and their glow are drawn live on top.
   ======================================================================== */

const SHIP_COLORS = {
  WOOD: '#5c4230', C1: '#3e2a1d', C2: '#8a6842', SHELL: '#b08a4e', BONE: '#bba374', METAL: '#6e7680',
  C3: '#c9a44c', C4: '#7a3f47', C5: '#d8ceb2', C6: '#4d5a52', C8: '#c4483f', WHITE: '#ece6d4',
  DARK: '#1a1210', BODY: '#6b7a84', BELLY: '#2a2f33', FIN: '#4a5a6b', GUM: '#e0aa3c', GLOW: '#ffd27a',
  EYE: '#ffe9b0', C7: '#8fb9c9', outline: '#140e0c'
};
const hex = c => '#' + c.map(v => ('0' + Math.round(v).toString(16)).slice(-2)).join('');

function shipPalette(key, extra) { return spritePalette('ship:' + key, Object.assign({}, SHIP_COLORS, extra || {})); }

// paint in world coordinates, into a sprite centred on world (cx, cy)
function shipRig(cx, cy) {
  Rig.begin();
  Rig.scale(1 / PIX, 1 / PIX);
  Rig.translate(-cx, -cy);
}
// a lighting function in world coordinates, for a sprite centred on (cx, cy)
const worldLit = (cx, cy, fn) => (sx, sy) => fn(sx * PIX + cx, sy * PIX + cy);

const Ship = {

  /* ----------------------------- behind the crew ----------------------------- */

  wall(night) {
    const cx = 950, cy = DECK_Y - 70;
    shipRig(cx, cy);
    // the far bulwark: two strakes of planking, butt joints staggered, nails
    Rig.poly([[16, DECK_Y - 42], [1884, DECK_Y - 42], [1884, DECK_Y - 4], [16, DECK_Y - 4]], MAT.WOOD, worldLit(cx, cy, (x, y) => {
      const row = Math.floor((y - (DECK_Y - 42)) / 13);
      const ry = (y - (DECK_Y - 42)) % 13;
      let L = .46 - row * .06;
      if (ry < 1.6) L -= .2;
      if (((x + row * 31) % 94) < 2) L -= .16;
      if (((x + row * 31) % 94) > 88 && ry > 5 && ry < 8) L += .22;
      return L;
    }));
    Rig.box(14, DECK_Y - 48, 1872, 6, MAT.SHELL, .6);
    Rig.box(14, DECK_Y - 48, 1872, 2, MAT.SHELL, .85);
    Rig.box(14, DECK_Y - 5, 1872, 5, MAT.C2, .48);
    // stanchions and the rope slung between them
    for (let x = 60; x < 1860; x += 108) {
      Rig.box(x, DECK_Y - 72, 6, 26, MAT.C1, .4);
      Rig.box(x - 1, DECK_Y - 74, 8, 3, MAT.C1, .7);
    }
    const rope = [];
    for (let x = 40; x < 1880; x += 12) rope.push([x, DECK_Y - 66 + Math.sin((((x - 60) % 108) + 108) % 108 / 108 * Math.PI) * 5]);
    Rig.line(rope, 1.6, 1.6, MAT.BONE, .5);

    // the wheelhouse at the stern
    const x = 150, top = DECK_Y - 104;
    Rig.poly([[x, top], [x + 172, top], [x + 172, DECK_Y - 4], [x, DECK_Y - 4]], MAT.WOOD, worldLit(cx, cy, (px, py) => .5 + (((px - x) % 16) < 2 ? -.18 : 0) + (py > DECK_Y - 20 ? -.08 : 0)));
    Rig.box(x - 2, top, 6, 100, MAT.C1, .45); Rig.box(x + 168, top, 6, 100, MAT.C1, .35);
    Rig.box(x - 12, top - 14, 196, 14, MAT.C1, .38);
    Rig.box(x - 12, top - 16, 196, 3, MAT.SHELL, .75);
    // the window, and the wheel behind the glass
    Rig.box(x + 26, top + 20, 50, 38, MAT.SHELL, .55);
    Rig.box(x + 29, top + 23, 44, 32, MAT.C7, night > .4 ? .82 : .55);
    Rig.ring(x + 40, top + 50, 10, 10, 1.4, MAT.C1, .3);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; Rig.line([[x + 40 + Math.cos(a) * 3, top + 50 + Math.sin(a) * 3], [x + 40 + Math.cos(a) * 14, top + 50 + Math.sin(a) * 14]], 1.1, 1.1, MAT.C1, .3); }
    Rig.box(x + 50, top + 23, 2, 32, MAT.SHELL, .5);
    Rig.box(x + 29, top + 38, 44, 2, MAT.SHELL, .5);
    // a door with an oilskin on its hook
    Rig.poly([[x + 104, DECK_Y - 72], [x + 148, DECK_Y - 72], [x + 148, DECK_Y - 4], [x + 104, DECK_Y - 4]], MAT.C1, worldLit(cx, cy, (px) => .42 + (((px - x - 104) % 11) < 2 ? -.15 : 0)));
    Rig.box(x + 104, DECK_Y - 74, 44, 3, MAT.SHELL, .55);
    Rig.ell(x + 112, DECK_Y - 36, 3, 3, MAT.C3, { lit: .8 });
    Rig.poly([[x + 130, DECK_Y - 68], [x + 136, DECK_Y - 68], [x + 146, DECK_Y - 52], [x + 144, DECK_Y - 24], [x + 128, DECK_Y - 26]], MAT.GUM, .55);
    // a chalkboard nobody has updated
    Rig.box(x + 10, DECK_Y - 48, 44, 32, MAT.SHELL, .5);
    Rig.box(x + 13, DECK_Y - 45, 38, 26, MAT.BELLY, .45);
    for (let i = 0; i < 3; i++) Rig.line([[x + 17, DECK_Y - 39 + i * 7], [x + 17 + [24, 30, 14][i], DECK_Y - 39 + i * 7 + (i % 2)]], .9, .9, MAT.WHITE, .7);
    // chimney
    Rig.box(x + 130, top - 38, 16, 24, MAT.METAL, .4);
    Rig.box(x + 127, top - 41, 22, 4, MAT.METAL, .65);

    // Dorran's stall: poles, a striped awning, a shelf of bottles
    const s = 742;
    Rig.box(s - 62, DECK_Y - 134, 8, 130, MAT.C1, .4);
    Rig.box(s + 66, DECK_Y - 134, 8, 130, MAT.C1, .35);
    Rig.box(s - 50, DECK_Y - 84, 112, 5, MAT.C1, .45);
    const bottles = ['#4a7a52', '#6a4a32', '#4a6a7a', '#7a6a3a', '#4a7a52'];
    bottles.forEach((col, i) => {
      const bx = s - 44 + i * 22;
      Rig.box(bx, DECK_Y - 100, 7, 16, i % 2 ? MAT.C6 : MAT.FIN, .45 + (i % 3) * .08);
      Rig.box(bx + 2, DECK_Y - 105, 3, 5, MAT.C1, .5);
    });
    Rig.poly([[s - 84, DECK_Y - 136], [s + 94, DECK_Y - 136], [s + 84, DECK_Y - 110], [s - 74, DECK_Y - 110]], MAT.C4, worldLit(cx, cy, (px, py) => .42 + (Math.floor((px - s + 84) / 28) % 2 ? .14 : 0) - (py - DECK_Y + 136) * .006));
    for (let i = 0; i < 7; i++) Rig.ell(s - 72 + i * 26, DECK_Y - 110, 13, 5, MAT.C4, { lit: i % 2 ? .5 : .36 });
    // what hangs off the awning: three fish and a lamp
    const hang = [[s - 50, 18, MAT.METAL], [s - 16, 26, MAT.C8], [s + 18, 16, MAT.C6], [s + 52, 24, MAT.FIN]];
    for (const [hx, len, mat] of hang) {
      Rig.line([[hx, DECK_Y - 106], [hx, DECK_Y - 106 + len]], .9, .9, MAT.BONE, .5);
      Rig.poly([[hx - 4, DECK_Y - 104 + len], [hx + 4, DECK_Y - 104 + len], [hx + 3, DECK_Y - 90 + len], [hx, DECK_Y - 84 + len], [hx - 3, DECK_Y - 90 + len]], mat, .55);
      Rig.poly([[hx - 4, DECK_Y - 84 + len], [hx, DECK_Y - 88 + len], [hx + 4, DECK_Y - 84 + len]], mat, .4);
    }
  },

  /* ------------------------ everything on the deck ------------------------ */

  props(crateOpen) {
    const cx = 950, cy = DECK_Y - 70;
    shipRig(cx, cy);
    // the ship's bell post (the bell swings on its own)
    Rig.box(60, DECK_Y - 96, 8, 92, MAT.C1, .42);
    Rig.box(48, DECK_Y - 100, 32, 6, MAT.SHELL, .6);
    // a life ring on its hook
    Rig.line([[336, DECK_Y - 112], [336, DECK_Y - 96]], 1.2, 1.2, MAT.BONE, .5);
    Rig.ring(336, DECK_Y - 78, 17, 17, 4.8, MAT.WHITE, .62);
    for (let i = 0; i < 4; i++) {
      const a0 = i * Math.PI / 2 + .3, pts = [];
      for (let k = 0; k <= 5; k++) { const a = a0 + k * .19; pts.push([336 + Math.cos(a) * 17, DECK_Y - 78 + Math.sin(a) * 17]); }
      Rig.line(pts, 4.8, 4.8, MAT.C8, .5);
    }
    this.crate(392, 46, crateOpen);
    this.crate(452, 34, false);
    this.pots(520, 2);
    // bucket and mop
    Rig.poly([[568, DECK_Y - 24], [592, DECK_Y - 24], [588, DECK_Y], [572, DECK_Y]], MAT.BODY, .5);
    Rig.box(566, DECK_Y - 27, 28, 4, MAT.BODY, .7);
    Rig.ring(580, DECK_Y - 26, 12, 12, 1, MAT.METAL, .45);
    Rig.line([[602, DECK_Y], [616, DECK_Y - 84]], 2.2, 2, MAT.C2, .55);
    for (let i = 0; i < 6; i++) Rig.line([[615, DECK_Y - 84], [608 + i * 3, DECK_Y - 66 - (i % 2) * 4]], 1.2, .8, MAT.BONE, .6);
    // a drum of something
    Rig.poly([[867, DECK_Y - 52], [901, DECK_Y - 52], [901, DECK_Y], [867, DECK_Y]], MAT.C6, worldLit(cx, cy, (px) => .38 + (px < 876 ? .14 : 0) + (px > 894 ? -.1 : 0)));
    Rig.box(867, DECK_Y - 42, 34, 4, MAT.C6, .25); Rig.box(867, DECK_Y - 16, 34, 4, MAT.C6, .25);
    Rig.ell(884, DECK_Y - 52, 17, 5, MAT.C6, { lit: .62 });
    Rig.ell(890, DECK_Y - 30, 5, 7, MAT.C3, { lit: .45 });
    this.barrel(960, 1); this.barrel(1002, .82); this.barrel(1640, .9);
    // a crate under a tarp
    this.crate(1140, 52, false);
    Rig.poly([[1098, DECK_Y - 6], [1106, DECK_Y - 60], [1142, DECK_Y - 66], [1180, DECK_Y - 58], [1184, DECK_Y - 4], [1140, DECK_Y - 14]], MAT.C6, worldLit(cx, cy, (px, py) => .42 + (py < DECK_Y - 50 ? .14 : 0) + (((px + py) % 23) < 2 ? -.1 : 0)));
    Rig.line([[1096, DECK_Y - 26], [1140, DECK_Y - 34], [1186, DECK_Y - 24]], 1.4, 1.4, MAT.BONE, .5);
    this.crate(1240, 40, false);
    this.pots(1392, 1);
    // a chair with a coat over it
    Rig.box(1432, DECK_Y - 28, 40, 6, MAT.C2, .62);
    Rig.box(1434, DECK_Y - 22, 5, 22, MAT.C2, .4); Rig.box(1465, DECK_Y - 22, 5, 22, MAT.C2, .4);
    Rig.box(1465, DECK_Y - 60, 5, 34, MAT.C2, .5);
    Rig.box(1463, DECK_Y - 62, 9, 4, MAT.C2, .7);
    Rig.poly([[1460, DECK_Y - 58], [1475, DECK_Y - 58], [1477, DECK_Y - 30], [1470, DECK_Y - 22], [1462, DECK_Y - 34]], MAT.C4, .5);
    Rig.box(1462, DECK_Y - 58, 13, 3, MAT.C4, .7);
    // a mug left on the seat
    Rig.box(1440, DECK_Y - 36, 8, 8, MAT.WHITE, .55); Rig.ring(1450, DECK_Y - 32, 2.4, 2.4, .8, MAT.WHITE, .5);
    // the bow: posts and a rail gap for the rod, a bait bucket
    const f = 1744;
    Rig.box(f - 4, DECK_Y - 54, 9, 54, MAT.C1, .42);
    Rig.box(f + 54, DECK_Y - 54, 9, 54, MAT.C1, .36);
    Rig.box(f - 10, DECK_Y - 58, 82, 6, MAT.SHELL, .62);
    Rig.box(f + 20, DECK_Y - 52, 5, 18, MAT.METAL, .5);
    Rig.poly([[f + 78, DECK_Y], [f + 84, DECK_Y - 30], [f + 110, DECK_Y - 30], [f + 116, DECK_Y]], MAT.BODY, .45);
    Rig.ell(f + 97, DECK_Y - 30, 16, 4, MAT.BELLY, { lit: .3 });
    Rig.ring(f + 97, DECK_Y - 34, 13, 8, 1, MAT.METAL, .5);
    // lantern posts (the light itself is drawn live)
    // the two out on the open deck hang from crooked poles
    for (const [px, lx, ly] of [[1490, 1452, DECK_Y - 128], [1742, 1766, DECK_Y - 118]]) {
      Rig.box(px - 3, ly - 16, 6, DECK_Y - ly + 16, MAT.C1, .42);
      Rig.line([[px, ly - 14], [lx, ly - 14]], 1.6, 1.6, MAT.C1, .45);
    }
    for (const [lx, ly] of [[812, DECK_Y - 122], [1452, DECK_Y - 128], [1766, DECK_Y - 118]]) {
      Rig.line([[lx, ly - 14], [lx, ly]], 1.2, 1.2, MAT.C1, .4);
      Rig.box(lx - 9, ly, 18, 4, MAT.METAL, .55);
      Rig.box(lx - 9, ly + 22, 18, 4, MAT.METAL, .45);
      Rig.box(lx - 7, ly + 4, 14, 18, MAT.GLOW, .55);
      Rig.line([[lx, ly + 4], [lx, ly + 22]], .8, .8, MAT.METAL, .4);
    }
  },

  crate(x, s, open) {
    const w = s * 1.25, h = s;
    const cx = 950, cy = DECK_Y - 70;
    Rig.poly([[x - w / 2, DECK_Y - h], [x + w / 2, DECK_Y - h], [x + w / 2, DECK_Y], [x - w / 2, DECK_Y]], MAT.C2, worldLit(cx, cy, (px, py) => .46 + (((py - DECK_Y + h) % 11) < 1.6 ? -.2 : 0)));
    Rig.line([[x - w / 2 + 3, DECK_Y - h + 3], [x + w / 2 - 3, DECK_Y - 3]], 1.6, 1.6, MAT.C1, .4);
    Rig.line([[x + w / 2 - 3, DECK_Y - h + 3], [x - w / 2 + 3, DECK_Y - 3]], 1.6, 1.6, MAT.C1, .4);
    Rig.ring(x, DECK_Y - h / 2, w / 2 - 1.5, h / 2 - 1.5, .01, MAT.C1, .4);
    Rig.box(x - w / 2, DECK_Y - h, 3, h, MAT.C1, .35); Rig.box(x + w / 2 - 3, DECK_Y - h, 3, h, MAT.C1, .35);
    if (open) {
      Rig.box(x - w / 2 + 4, DECK_Y - h + 1, w - 8, 9, MAT.DARK, .1);
      Rig.poly([[x - w / 2, DECK_Y - h - 2], [x - w / 2 + w * .9, DECK_Y - h - 26], [x - w / 2 + w * .92, DECK_Y - h - 21], [x - w / 2 + 2, DECK_Y - h + 2]], MAT.SHELL, .6);
    } else Rig.box(x - w / 2 - 1, DECK_Y - h - 5, w + 2, 5, MAT.SHELL, .62);
  },

  pots(x, n) {
    for (let k = 0; k < n; k++) {
      const yy = DECK_Y - k * 30, w = 40 - k * 4;
      Rig.poly([[x - w, yy], [x - w + 4, yy - 26], [x + w - 4, yy - 26], [x + w, yy]], MAT.C1, .3);
      for (let i = 0; i <= 5; i++) Rig.line([[x - w + i * (w * 2 / 5), yy - 1], [x - w + 4 + i * ((w * 2 - 8) / 5), yy - 25]], .9, .9, MAT.BONE, .55);
      for (let i = 1; i < 3; i++) Rig.line([[x - w + 2, yy - i * 9], [x + w - 2, yy - i * 9]], .9, .9, MAT.BONE, .5);
      Rig.box(x - w, yy - 3, w * 2, 3, MAT.C1, .5);
      Rig.box(x - w + 4, yy - 28, w * 2 - 8, 3, MAT.C1, .5);
    }
  },

  barrel(x, s) {
    const w = 40 * s, h = 54 * s, cx = 950, cy = DECK_Y - 70;
    const pts = [];
    for (let i = 0; i <= 8; i++) { const f = i / 8; pts.push([x - w / 2 - Math.sin(f * Math.PI) * 4, DECK_Y - f * h]); }
    for (let i = 8; i >= 0; i--) { const f = i / 8; pts.push([x + w / 2 + Math.sin(f * Math.PI) * 4, DECK_Y - f * h]); }
    Rig.poly(pts, MAT.WOOD, worldLit(cx, cy, (px) => .38 + clamp((x - px) / w, -.5, .5) * .3 + (((px - x + 60) % 8) < 1.4 ? -.12 : 0)));
    for (const fy of [.12, .5, .86]) Rig.box(x - w / 2 - 4, DECK_Y - h * fy - 2, w + 8, 4 * s + 1, MAT.METAL, .5);
    Rig.ell(x, DECK_Y - h, w / 2, 5 * s, MAT.C2, { lit: .6 });
  },

  // what stands behind the crew but in front of Dorran: his counter, scale and money
  counter() {
    const s = 742, cx = s, cy = DECK_Y - 40;
    shipRig(cx, cy);
    Rig.poly([[s - 74, DECK_Y - 46], [s + 82, DECK_Y - 46], [s + 82, DECK_Y], [s - 74, DECK_Y]], MAT.WOOD, worldLit(cx, cy, (px) => .5 + (((px - s + 74) % 31) < 2 ? -.2 : 0)));
    Rig.box(s - 78, DECK_Y - 52, 164, 8, MAT.SHELL, .65);
    Rig.box(s - 78, DECK_Y - 52, 164, 2, MAT.SHELL, .88);
    Rig.box(s + 33, DECK_Y - 78, 3, 26, MAT.C3, .55);
    Rig.box(s + 20, DECK_Y - 78, 31, 3, MAT.C3, .7);
    Rig.ell(s + 22, DECK_Y - 68, 7, 3, MAT.C3, { lit: .5 });
    Rig.ell(s + 49, DECK_Y - 70, 7, 3, MAT.C3, { lit: .5 });
    for (let i = 0; i < 6; i++) Rig.ell(s - 46 + (i % 3) * 9, DECK_Y - 55 - Math.floor(i / 3) * 4, 6, 2.6, MAT.C3, { lit: i % 2 ? .8 : .55 });
  },

  /* ------------------------------ the mast ------------------------------ */

  mast(night, billow, flag) {
    const x = 1050, cx = 1060, cy = 180;
    shipRig(cx, cy);
    const bill = billow * 10;
    // the sail, bellied out and seamed
    const edge = [];
    for (let i = 0; i <= 10; i++) {
      const f = i / 10, a = 1 - f;
      const px = a * a * (x + 6) + 2 * a * f * (x + 150 + bill) + f * f * (x + 128 + bill * .5);
      edge.push([px, a * a * 70 + 2 * a * f * 150 + f * f * 300]);
    }
    Rig.poly([[x + 6, 70]].concat(edge, [[x + 6, 300]]), MAT.C5, worldLit(cx, cy, (px, py) => .58 - (px - x) / 150 * .22 + (((py - 70) % 46) < 2 ? -.14 : 0)));
    // mast, yard and rigging
    Rig.box(x - 7, -44, 14, DECK_Y + 44, MAT.WOOD, .45);
    Rig.box(x - 7, -44, 4, DECK_Y + 44, MAT.WOOD, .65);
    Rig.box(x - 60, 66, 200, 7, MAT.C1, .45);
    Rig.box(x - 10, -48, 20, 5, MAT.C1, .5);
    Rig.line([[x, 74], [x - 210, DECK_Y - 36]], 1.1, 1.1, MAT.BONE, .38);
    Rig.line([[x, 74], [x + 240, DECK_Y - 36]], 1.1, 1.1, MAT.BONE, .38);
    Rig.line([[x, 120], [x - 150, DECK_Y - 36]], 1.1, 1.1, MAT.BONE, .38);
    // the flag
    Rig.poly([[x + 2, -38], [x + 44 + flag * 5, -32 + flag * 3], [x + 30, -26], [x + 44 - flag * 4, -18 - flag * 2], [x + 2, -16]], MAT.C8, .5);
  },

  bell(sway) {
    const cx = 64, cy = DECK_Y - 80;
    shipRig(cx, cy);
    Rig.translate(64, DECK_Y - 94);
    Rig.rotate(sway);
    Rig.poly([[-3, 0], [3, 0], [9, 12], [11, 22], [-11, 22], [-9, 12]], MAT.C3, worldLit(cx, cy, (px) => .58 + (px < 60 ? .15 : 0)));
    Rig.box(-12, 21, 24, 4, MAT.C3, .35);
    Rig.box(-1.5, 24, 3, 7, MAT.METAL, .4);
  },

  dryingLine(sway) {
    const x1 = 624, x2 = 714, y = DECK_Y - 96, cx = 669, cy = DECK_Y - 80;
    shipRig(cx, cy);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push([lerp(x1, x2, f), y + Math.sin(f * Math.PI) * 12]); }
    Rig.line(pts, 1.2, 1.2, MAT.BONE, .5);
    for (let i = 0; i < 5; i++) {
      const f = (i + .5) / 5, bx = lerp(x1, x2, f), by = y + Math.sin(f * Math.PI) * 12 + 2;
      Rig.save(); Rig.translate(bx, by); Rig.rotate(Math.sin(sway * 3 + i) * .08);
      if (i % 2) Rig.poly([[-4, 0], [4, 0], [3, 22], [0, 28], [-3, 22]], MAT.METAL, .6);
      else Rig.poly([[-5, 0], [5, 0], [5, 16], [-5, 16]], MAT.C5, .5);
      Rig.restore();
    }
  },

  buoys(sway) {
    const cx = 1586, cy = DECK_Y - 34;
    shipRig(cx, cy);
    const cols = [MAT.C8, MAT.SHELL, MAT.FIN];
    for (let i = 0; i < 3; i++) {
      Rig.save(); Rig.translate(1560 + i * 26, DECK_Y - 46); Rig.rotate(Math.sin(sway * 2 + i) * .08);
      Rig.line([[0, -10], [0, 2]], 1.2, 1.2, MAT.BONE, .5);
      Rig.ell(0, 16, 10, 15, cols[i], {});
      Rig.box(-10, 12, 20, 4, MAT.WHITE, .7);
      Rig.restore();
    }
  },

  /* ------------------------------ in front of the crew ------------------------------ */

  hull() {
    const cx = 960, cy = DECK_Y + 48;
    shipRig(cx, cy);
    const top = DECK_Y + 6;
    const pts = [[14, top], [1886, top]];
    for (let i = 1; i <= 8; i++) { const f = i / 8, a = 1 - f; pts.push([a * a * 1886 + 2 * a * f * 1940 + f * f * 1790, a * a * top + 2 * a * f * (DECK_Y + 46) + f * f * (DECK_Y + 88)]); }
    pts.push([150, DECK_Y + 92]);
    for (let i = 1; i <= 8; i++) { const f = i / 8, a = 1 - f; pts.push([a * a * 150 + 2 * a * f * -26 + f * f * 14, a * a * (DECK_Y + 92) + 2 * a * f * (DECK_Y + 56) + f * f * top]); }
    Rig.poly(pts, MAT.WOOD, worldLit(cx, cy, (px, py) => {
      const d = py - DECK_Y;
      let L = .62 - d / 92 * .34;
      if (((d + px * .0016 * 11) % 11) < 1.6) L -= .16;
      if ((px % 137) < 5 && d > 10 && d < 58) L -= .12 * (1 - (d - 10) / 48);
      if (d > 24 && d < 30) L = .72 - (d > 28 ? .25 : 0);
      return L;
    }));
    // the gunwale cap
    Rig.box(10, DECK_Y, 1880, 7, MAT.SHELL, .62);
    Rig.box(10, DECK_Y, 1880, 2, MAT.SHELL, .86);
    Rig.box(10, DECK_Y + 7, 1880, 3, MAT.C1, .4);
    // a strake of gold paint
    Rig.box(20, DECK_Y + 24, 1860, 5, MAT.C3, .6);
    // portholes
    for (let x = 560; x < 1700; x += 180) {
      Rig.ring(x, DECK_Y + 48, 9, 9, 2.4, MAT.C3, .6);
      Rig.ell(x, DECK_Y + 48, 7, 7, MAT.BELLY, { lit: .3 });
      Rig.dot(x - 3, DECK_Y + 45, MAT.WHITE, .6);
    }
    // rope fenders
    for (const fx of [220, 620, 1120, 1560]) {
      Rig.line([[fx, DECK_Y + 8], [fx, DECK_Y + 22]], 1.3, 1.3, MAT.BONE, .5);
      Rig.ell(fx, DECK_Y + 30, 9, 10, MAT.BONE, { lit: .4 });
      Rig.ell(fx, DECK_Y + 30, 4, 5, MAT.C1, { lit: .3 });
    }
    // the anchor, stowed at the bow
    const ax = 1842;
    Rig.line([[ax, DECK_Y + 4], [ax, DECK_Y + 24]], 1.4, 1.4, MAT.BONE, .5);
    Rig.line([[ax, DECK_Y + 22], [ax, DECK_Y + 62]], 2.6, 2.6, MAT.METAL, .5);
    Rig.line([[ax - 14, DECK_Y + 30], [ax + 14, DECK_Y + 30]], 2.2, 2.2, MAT.METAL, .55);
    Rig.line([[ax - 17, DECK_Y + 48], [ax - 8, DECK_Y + 60], [ax, DECK_Y + 63], [ax + 8, DECK_Y + 60], [ax + 17, DECK_Y + 48]], 2.4, 2.4, MAT.METAL, .45);
    Rig.poly([[ax - 23, DECK_Y + 42], [ax - 12, DECK_Y + 52], [ax - 20, DECK_Y + 55]], MAT.METAL, .5);
    Rig.poly([[ax + 23, DECK_Y + 42], [ax + 12, DECK_Y + 52], [ax + 20, DECK_Y + 55]], MAT.METAL, .5);
  }
};

/* ------------------------------ the lights ------------------------------ */

// a string of bulbs, as a sagging line of whole pixels
function lightString(g, x1, x2, y, sag, t, night, n) {
  if (x2 < -120 || x1 > VIEW_W + 120) return;
  const mx = (x1 + x2) / 2, my = y + sag + Math.round(Math.sin(t * .8) * 1.5) * PIX;
  g.fillStyle = 'rgba(40,32,26,.9)';
  for (let i = 0; i <= 60; i++) {
    const f = i / 60, bx = (1 - f) * (1 - f) * x1 + 2 * (1 - f) * f * mx + f * f * x2;
    const by = (1 - f) * (1 - f) * y + 2 * (1 - f) * f * my + f * f * y;
    if (bx > -4 && bx < VIEW_W + 4) g.fillRect(snap(bx), snap(by), PIX, PIX);
  }
  for (let i = 0; i <= n; i++) {
    const f = i / n, bx = (1 - f) * (1 - f) * x1 + 2 * (1 - f) * f * mx + f * f * x2;
    const by = (1 - f) * (1 - f) * y + 2 * (1 - f) * f * my + f * f * y;
    if (bx < -30 || bx > VIEW_W + 30) continue;
    const flick = .75 + Math.sin(t * 3 + i * 1.7) * .12 + Math.sin(t * 9 + i) * .07;
    const col = ['#ffd27a', '#ff9c6a', '#ffe9a8', '#8fd6ff'][i % 4];
    g.fillStyle = 'rgba(40,32,26,.9)';
    g.fillRect(snap(bx), snap(by), PIX, 3 * PIX);
    if (night > .2) {
      g.save(); g.globalCompositeOperation = 'lighter';
      stepGlow(g, snap(bx) + 1, snap(by + 10), 12, col, .34 * night * flick, { steps: 2 });
      g.restore();
    }
    g.fillStyle = night > .2 ? col : '#e8e2d0';
    g.fillRect(snap(bx) - PIX, snap(by) + 3 * PIX, PIX * 3, PIX * 4);
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.fillRect(snap(bx) - PIX, snap(by) + 3 * PIX, PIX, PIX);
  }
}

Object.assign(Art, {
  boatBack(g, camX, t, night, st) {
    const X = x => x - camX;
    const nightStep = Math.round(clamp(night, 0, 1) * 5);
    Sprite.draw(g, 'ship-wall', 'n' + (night > .4 ? 1 : 0), X(950), DECK_Y - 70, {
      w: 980, h: 150, face: 1, pal: shipPalette('wall'), paint: () => Ship.wall(night)
    });
    const sail = hex(mix([236, 226, 200], [58, 64, 96], nightStep / 5));
    Sprite.draw(g, 'ship-mast', [nightStep, q(Math.sin(t * .7), .25), q(Math.sin(t * 3), .5)].join(','), X(1060), 180, {
      w: 280, h: 250, face: 1, pal: shipPalette('sail' + nightStep, { C5: sail }),
      paint: () => Ship.mast(night, Math.round(Math.sin(t * .7) * 4) / 4, Math.round(Math.sin(t * 3) * 2) / 2)
    });
    Sprite.draw(g, 'ship-props', st && st.crateOpen ? 'open' : 'shut', X(950), DECK_Y - 70, {
      w: 980, h: 150, face: 1, pal: shipPalette('props'), paint: () => Ship.props(st && st.crateOpen)
    });
    Sprite.draw(g, 'ship-bell', String(q(Math.sin(t * 1.2) * .06, .03)), X(64), DECK_Y - 80, {
      w: 40, h: 40, face: 1, pal: shipPalette('props'), paint: () => Ship.bell(Math.round(Math.sin(t * 1.2) * 2) * .03)
    });
    Sprite.draw(g, 'ship-line', String(q(Math.sin(t * 1.4), .5)), X(669), DECK_Y - 80, {
      w: 70, h: 40, face: 1, pal: shipPalette('line' + nightStep, { C5: hex(mix([166, 158, 130], [96, 102, 118], nightStep / 5)) }),
      paint: () => Ship.dryingLine(Math.round(Math.sin(t * 1.4) * 2) / 2)
    });
    Sprite.draw(g, 'ship-buoys', String(q(Math.sin(t * .9), .5)), X(1586), DECK_Y - 34, {
      w: 60, h: 40, face: 1, pal: shipPalette('props'), paint: () => Ship.buoys(Math.round(Math.sin(t * .9) * 2) / 2)
    });

    // the stall keeper, then his counter in front of him
    Art.dorran(g, X(742) + 8, DECK_Y - 16, { t });
    Sprite.draw(g, 'ship-counter', '0', X(742), DECK_Y - 40, {
      w: 100, h: 60, face: 1, pal: shipPalette('props'), paint: () => Ship.counter()
    });

    // smoke from the wheelhouse chimney, in whole pixels
    g.fillStyle = 'rgba(207,214,226,.18)';
    for (let i = 0; i < 5; i++) {
      const p = (t * .35 + i * .2) % 1, s = Math.round(2 + p * 7) * PIX;
      g.fillRect(snap(X(288) + Math.sin(t * .8 + i) * 16 * p - s / 2), snap(DECK_Y - 150 - p * 78 - s / 2), s, s);
    }
    // light: the wheelhouse window, lanterns, strings of bulbs, and where it lands
    if (night > .25) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      stepGlow(g, X(201), DECK_Y - 65, 64, 'rgb(255,190,110)', .22 * night, { steps: 2 });
      for (const [lx, ly, s] of [[812, DECK_Y - 122, 1], [1452, DECK_Y - 128, .8], [1766, DECK_Y - 118, .9]]) {
        const flick = .82 + Math.sin(t * 11 + lx) * .06 + Math.sin(t * 5.3) * .09;
        stepGlow(g, X(lx), ly + 12 * s, 84 * s, 'rgb(255,180,100)', .26 * night * flick, { steps: 3 });
      }
      for (const lx of [156, 812, 1452, 1766]) {
        if (X(lx) > -200 && X(lx) < VIEW_W + 200) stepGlow(g, X(lx), DECK_Y - 4, 110, 'rgb(255,180,100)', .12 * night, { steps: 2, squash: 36 / 110 });
      }
      g.restore();
    }
    lightString(g, X(230), X(1046), DECK_Y - 150, 46, t, night, 9);
    lightString(g, X(1054), X(1800), DECK_Y - 146, 40, t, night, 8);
  },

  boatFront(g, camX, t, night) {
    const X = x => x - camX;
    Sprite.draw(g, 'ship-hull', '0', X(960), DECK_Y + 48, {
      w: 1010, h: 70, face: 1, pal: shipPalette('hull'), paint: () => Ship.hull()
    });
    Text.draw(g, 'MARGARET', X(300), DECK_Y + 56, {
      size: 20, color: 'rgba(238,214,158,.72)', font: 'Georgia, serif', weight: 'bold', align: 'center', italic: true
    });
    if (night > .4) {
      g.fillStyle = 'rgba(255,196,110,' + (.22 * night).toFixed(3) + ')';
      for (let x = 560; x < 1700; x += 180) {
        const sx = X(x);
        if (sx > -20 && sx < VIEW_W + 20) { g.fillRect(snap(sx - 6), DECK_Y + 42, 12, 12); g.fillRect(snap(sx - 4), DECK_Y + 40, 8, 16); }
      }
    }
  }
});

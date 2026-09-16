'use strict';
/* ========================================================================
   Draws the app icon as 32x32 pixel art and writes it out as a 1024x1024
   PNG (build/icon.png), which electron-builder turns into the .exe icon
   and the Mac app icon (a Mac needs at least 512x512).

   No image libraries: pixels go into an RGBA buffer by hand and a minimal
   PNG encoder writes it, using the zlib that ships with Node.

   Run:  node scripts/make-icon.js
   ======================================================================== */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 32;          // design grid
const SCALE = 32;      // 32 * 32 = 1024

function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
const CLEAR = [0, 0, 0, 0];

/* ------------------------------ the design ------------------------------ */

function designIcon() {
  const px = Array.from({ length: N }, () => Array.from({ length: N }, () => CLEAR));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y][x] = c; };

  // night sky over dark water, with a lighter horizon line
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let c;
      if (y < 13) c = y < 6 ? hex('#0a1028') : hex('#101a3a');
      else if (y === 13) c = hex('#2a4a70');
      else c = y < 20 ? hex('#0a1a30') : hex('#061022');
      set(x, y, c);
    }
  }
  // stars
  for (const [x, y] of [[3, 2], [12, 4], [26, 3], [18, 1], [29, 8], [9, 9]]) set(x, y, hex('#c8d4ff'));
  // moon
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    if (x * x + y * y <= 9) set(6 + x, 6 + y, hex('#e8eeff'));
  }
  set(5, 5, hex('#b8c4e0')); set(7, 8, hex('#b8c4e0'));

  // the fishing line coming down into the water, and the hook
  for (let y = 0; y <= 20; y++) set(23, y, hex('#dce6f0'));
  set(23, 21, hex('#dce6f0')); set(24, 22, hex('#dce6f0')); set(24, 21, hex('#dce6f0'));
  set(22, 22, hex('#c07a4c'));

  // the eye in the dark: a halo, the red iris, a slit pupil, a glint
  for (let y = -6; y <= 6; y++) for (let x = -10; x <= 10; x++) {
    const d = (x * x) / 100 + (y * y) / 36;
    if (d <= 1) set(13 + x, 24 + y, hex('#2a0610'));
  }
  for (let y = -3; y <= 3; y++) for (let x = -7; x <= 7; x++) {
    const d = (x * x) / 49 + (y * y) / 9;
    if (d <= 1) set(13 + x, 24 + y, d > .55 ? hex('#a01c24') : hex('#e23a3a'));
  }
  for (let y = -3; y <= 3; y++) set(13, 24 + y, hex('#1a0004'));
  set(10, 22, hex('#ffd0c8'));

  // rounded corners, so it sits nicely on a desktop
  const cut = [[0, 0], [1, 0], [0, 1]];
  for (const [x, y] of cut) {
    set(x, y, CLEAR); set(N - 1 - x, y, CLEAR);
    set(x, N - 1 - y, CLEAR); set(N - 1 - x, N - 1 - y, CLEAR);
  }
  return px;
}

/* ------------------------------ PNG encoding ---------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

// rgba: Buffer of width*height*4 bytes
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;  // no filter
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// blow the design up to full size with hard pixel edges
function rasterize(px, scale) {
  const size = px.length * scale;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = px[Math.floor(y / scale)][Math.floor(x / scale)];
      const i = (y * size + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
    }
  }
  return { size, data: out };
}

if (require.main === module) {
  const { size, data } = rasterize(designIcon(), SCALE);
  const file = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(size, size, data));
  console.log('wrote ' + path.relative(process.cwd(), file) + ' (' + size + 'x' + size + ')');
}

module.exports = { designIcon, encodePNG, rasterize, crc32 };

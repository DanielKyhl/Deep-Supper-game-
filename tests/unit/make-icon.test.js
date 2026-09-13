'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { crc32, encodePNG, rasterize, designIcon } = require('../../scripts/make-icon');

describe('app icon', () => {
  test('crc32 matches the standard check value', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });

  test('encodePNG writes a signature, IHDR with the right size, and IEND', () => {
    const png = encodePNG(3, 2, Buffer.alloc(3 * 2 * 4, 255));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), 3);
    assert.equal(png.readUInt32BE(20), 2);
    assert.equal(png[24], 8, 'bit depth');
    assert.equal(png[25], 6, 'RGBA');
    assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
  });

  test('every chunk carries a valid CRC', () => {
    const png = encodePNG(4, 4, Buffer.alloc(64, 7));
    let off = 8, chunks = 0;
    while (off < png.length) {
      const len = png.readUInt32BE(off);
      const body = png.subarray(off + 4, off + 8 + len);
      assert.equal(png.readUInt32BE(off + 8 + len), crc32(body), body.toString('ascii', 0, 4));
      off += 12 + len; chunks++;
    }
    assert.equal(chunks, 3);
  });

  test('the image data inflates back to the pixels, one filter byte per row', () => {
    const rgba = Buffer.from(Array.from({ length: 2 * 2 * 4 }, (_, i) => i * 9));
    const png = encodePNG(2, 2, rgba);
    const idatLen = png.readUInt32BE(33);
    assert.equal(png.toString('ascii', 37, 41), 'IDAT');
    const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen));
    assert.equal(raw.length, (2 * 4 + 1) * 2);
    assert.equal(raw[0], 0);
    assert.deepEqual([...raw.subarray(1, 9)], [...rgba.subarray(0, 8)]);
    assert.deepEqual([...raw.subarray(10, 18)], [...rgba.subarray(8, 16)]);
  });

  test('rasterize scales with hard pixel edges', () => {
    const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
    const { size, data } = rasterize([[red, blue], [blue, red]], 3);
    assert.equal(size, 6);
    const px = (x, y) => [...data.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
    assert.deepEqual(px(0, 0), red);
    assert.deepEqual(px(2, 2), red);
    assert.deepEqual(px(3, 0), blue);
    assert.deepEqual(px(5, 5), red);
  });

  test('the design is 32x32 with transparent rounded corners', () => {
    const d = designIcon();
    assert.equal(d.length, 32);
    assert.ok(d.every(row => row.length === 32));
    for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31], [1, 0], [0, 1]]) assert.equal(d[y][x][3], 0, x + ',' + y);
    assert.equal(d[16][16][3], 255);
  });

  test('the red eye is in the picture', () => {
    const d = designIcon();
    assert.deepEqual(d[24][13], [0x1a, 0x00, 0x04, 255], 'slit pupil');
    assert.ok(d.flat().some(c => c[0] === 0xe2 && c[1] === 0x3a && c[2] === 0x3a), 'bright red iris');
  });
});

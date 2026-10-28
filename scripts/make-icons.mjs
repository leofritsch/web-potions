// Renders the pixel potion into the extension's PNG icons, plus a contact sheet of
// every sprite for eyeballing. No dependencies: a tiny PNG encoder on top of zlib.
//   node scripts/make-icons.mjs [--sheet out.png]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import vm from 'node:vm';

const root = new URL('../extension/', import.meta.url);
const ctx = { self: {} };
vm.runInNewContext(readFileSync(new URL('lib/pixels.js', root), 'utf8'), ctx);
const { sprites, palette } = ctx.self.WP.pixels;

for (const [name, rows] of Object.entries(sprites)) {
  const bad = rows.findIndex((r) => r.length !== rows[0].length);
  if (bad !== -1) throw new Error(`sprite "${name}" row ${bad} is ${rows[bad].length} wide, expected ${rows[0].length}`);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function render(rows, scale, pad = 0, size = null) {
  const w = rows[0].length;
  const h = rows.length;
  const W = size ?? w * scale + pad * 2;
  const H = size ?? h * scale + pad * 2;
  const ox = Math.floor((W - w * scale) / 2);
  const oy = Math.floor((H - h * scale) / 2);
  const px = new Uint8Array(W * H * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const [r, g, b] = hex(palette[ch]);
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = ((oy + y * scale + dy) * W + ox + x * scale + dx) * 4;
          px.set([r, g, b, 255], i);
        }
    }),
  );
  return { W, H, px };
}

function png({ W, H, px }) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const iconsDir = new URL('icons/', root);
mkdirSync(iconsDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const scale = Math.floor(size / 16);
  writeFileSync(new URL(`icon${size}.png`, iconsDir), png(render(sprites.potion, scale, 0, size)));
}

const sheetArg = process.argv.indexOf('--sheet');
if (sheetArg !== -1) {
  // Lay every sprite side by side on a light background at 12x.
  const scale = 12;
  const tiles = Object.values(sprites).map((rows) => render(rows, scale, 12, 16 * scale + 24));
  const W = tiles.reduce((s, t) => s + t.W, 0);
  const H = tiles[0].H;
  const px = new Uint8Array(W * H * 4).fill(255);
  for (let i = 0; i < px.length; i += 4) px.set([247, 245, 255, 255], i);
  let x0 = 0;
  for (const t of tiles) {
    for (let y = 0; y < t.H; y++)
      for (let x = 0; x < t.W; x++) {
        const s = (y * t.W + x) * 4;
        if (t.px[s + 3]) px.set(t.px.subarray(s, s + 4), (y * W + x0 + x) * 4);
      }
    x0 += t.W;
  }
  writeFileSync(process.argv[sheetArg + 1], png({ W, H, px }));
}
console.log('icons written');

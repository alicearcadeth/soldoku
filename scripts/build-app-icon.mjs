import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PAPER = [0xf3, 0xef, 0xe6, 0xff];
const INK = [0x1c, 0x24, 0x30, 0xff];

function paint(size) {
  const pixels = new Uint8Array(size * size * 4);
  const margin = Math.max(1, Math.round(size * 0.14));
  const grid = size - margin * 2;
  const cell = Math.floor(grid / 3);
  const span = cell * 3;
  const line = Math.max(1, Math.round(size / 32));
  const filled = new Set(["0,1", "1,0", "2,2"]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let color = PAPER;
      const gx = x - margin;
      const gy = y - margin;
      if (gx >= 0 && gy >= 0 && gx < span && gy < span) {
        const col = Math.min(2, Math.floor(gx / cell));
        const row = Math.min(2, Math.floor(gy / cell));
        const onLine =
          gx % cell < line ||
          gy % cell < line ||
          span - gx <= line ||
          span - gy <= line;
        if (onLine || filled.has(`${col},${row}`)) color = INK;
      }
      pixels.set(color, (y * size + x) * 4);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([head, name, data, crc]);
}

function png(size) {
  const pixels = paint(size);
  const stride = size * 4;
  const raw = Buffer.alloc(size * (1 + stride));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + stride);
    raw[row] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  const parts = [header, entries];
  images.forEach((image, index) => {
    const at = index * 16;
    entries[at] = image.size === 256 ? 0 : image.size;
    entries[at + 1] = image.size === 256 ? 0 : image.size;
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(image.png.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += image.png.length;
    parts.push(image.png);
  });
  return Buffer.concat(parts);
}

const root = join(import.meta.dirname, "..", "public");
mkdirSync(root, { recursive: true });
const icon32 = png(32);
const icon16 = png(16);
writeFileSync(join(root, "icon-32.png"), icon32);
writeFileSync(join(root, "apple-touch-icon.png"), png(180));
writeFileSync(join(root, "favicon.ico"), ico([
  { size: 16, png: icon16 },
  { size: 32, png: icon32 },
]));
console.log("wrote public/favicon.ico public/icon-32.png public/apple-touch-icon.png");

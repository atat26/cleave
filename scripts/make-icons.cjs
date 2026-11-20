// Makes the Windows icon file (assets/icon.ico) from the brand's transparent icon (the bubble and globe, no background square).
// Run it with Electron itself (it has the image tools we need, so no extra package):
//   node_modules\electron\dist\electron.exe scripts\make-icons.cjs
// An .ico is a small index followed by PNG pictures, one per size.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const assets = path.join(__dirname, '..', 'assets');
const source = nativeImage.createFromPath(
  path.join(assets, 'icon-transparent-512.png'),
);
if (source.isEmpty())
  throw new Error('assets/icon-transparent-512.png is missing');

const pictures = SIZES.map((size) =>
  source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(SIZES.length, 4);
const entries = [];
let offset = 6 + 16 * SIZES.length;
SIZES.forEach((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // 0 means 256
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pictures[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pictures[i].length;
  entries.push(entry);
});
fs.writeFileSync(
  path.join(assets, 'icon.ico'),
  Buffer.concat([header, ...entries, ...pictures]),
);
// A 256 px picture, for places that want a PNG.
fs.writeFileSync(path.join(assets, 'icon-256.png'), pictures[SIZES.length - 1]);
console.log('wrote assets/icon.ico and assets/icon-256.png');
app.quit();

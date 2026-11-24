// Renders Cairn's icon (one pebble with a face) to the PNG and ICO files browsers and phones ask
// for. Run with `node scripts/make-icons.mjs` after changing the logo; needs Playwright.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

// One pebble from the site: a green stone with a face (no arms or legs), as in the rock people.
const PEBBLE = `<path d="M3.5 27.5c-2.2-9 3.8-18.6 16-19.6 12.3-1 19.4 5.4 19.2 13.6-.2 8.8-6.6 13.1-16.6 13.1-9.4 0-16.6-2.1-18.6-7.1z" fill="#44cf6c"/>
  <circle cx="15" cy="21.6" r="2.5" fill="#0a100d"/><circle cx="25.4" cy="20.8" r="2.5" fill="#0a100d"/>
  <path d="M16.8 27c2.8 2.3 6.3 2.3 8.9 0" fill="none" stroke="#0a100d" stroke-width="2.2" stroke-linecap="round"/>`;
const stones = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  ${bg ? `<rect width="40" height="40" rx="9" fill="${bg}"/>` : ""}
  <g ${bg ? 'transform="translate(5 4.6) scale(0.75)"' : 'transform="translate(0 -1.5)"'}>${PEBBLE}</g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (svg, size, file) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  if (file) writeFileSync(file, png);
  return png;
};

// Tab icons: the pebble on its own. Home-screen icons: the pebble on an ink tile.
const p32 = await render(stones(null), 32, "public/favicon-32.png");
const p16 = await render(stones(null), 16);
await render(stones("#0a100d"), 180, "public/apple-touch-icon.png");
await render(stones("#0a100d"), 192, "public/icon-192.png");
await render(stones("#0a100d"), 512, "public/icon-512.png");
await browser.close();

// favicon.ico holding 16px and 32px PNGs (the ICO format allows embedded PNG).
const images = [
  [16, p16],
  [32, p32],
];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const dir = [];
for (const [size, png] of images) {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  dir.push(e);
}
writeFileSync("public/favicon.ico", Buffer.concat([header, ...dir, ...images.map(([, p]) => p)]));
console.log("icons written");

// The SVG tab icon itself.
writeFileSync("public/cairn-icon.svg", `${stones(null)}\n`);

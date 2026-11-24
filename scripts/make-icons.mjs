// Renders Cairn's icon (three stacked stones) to the PNG and ICO files browsers and phones ask
// for. Run with `node scripts/make-icons.mjs` after changing the logo; needs Playwright.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const stones = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  ${bg ? `<rect width="40" height="40" rx="9" fill="${bg}"/>` : ""}
  <g ${bg ? 'transform="translate(5.2 5.6) scale(0.74)"' : ""}>
    <ellipse cx="20" cy="32.5" rx="15" ry="6" fill="#0a100d"/>
    <ellipse cx="18.5" cy="22.5" rx="11" ry="5.2" fill="#5eb1bf"/>
    <ellipse cx="21.5" cy="13.5" rx="7.4" ry="4.4" fill="#44cf6c"/>
  </g>
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

// Tab icons: transparent stones. Home-screen icons: stones on a mint tile.
const p32 = await render(stones(null), 32, "public/favicon-32.png");
const p16 = await render(stones(null), 16);
await render(stones("#a9fdac"), 180, "public/apple-touch-icon.png");
await render(stones("#a9fdac"), 192, "public/icon-192.png");
await render(stones("#a9fdac"), 512, "public/icon-512.png");
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

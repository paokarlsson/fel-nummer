// Ritar PNG-ikonerna från public/icons/icon.svg med Playwright (Chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg', 'utf8');
const targets = [
  ['public/icons/192.png', 192, 1],
  ['public/icons/512.png', 512, 1],
  ['public/icons/apple-touch-icon.png', 180, 1],
  ['public/icons/maskable-512.png', 512, 0.8],
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, scale] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale);
  // Maskerbar ikon: motivet inom säkerhetszonen och utfylld bakgrund.
  const html = `<html><body style="margin:0;background:#0b1114;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(scale < 1 ? 'rx="112"' : '__', 'rx="0"')}</div></body></html>`;
  await page.setContent(html);
  await page.screenshot({ path: file, omitBackground: scale === 1 && size !== 180 });
}
await browser.close();
console.log('ikoner klara');

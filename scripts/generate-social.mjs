import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  const svg = await readFile(new URL('../assets/social.svg', import.meta.url), 'utf8');
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await mkdir(new URL('../public/', import.meta.url), { recursive: true });
  await page.screenshot({ path: new URL('../public/social.png', import.meta.url).pathname });
  console.log('Created public/social.png (1200 × 630) from assets/social.svg');
} finally { await browser.close(); }

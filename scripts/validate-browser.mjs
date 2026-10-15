import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = resolve(new URL('..', import.meta.url).pathname);
const exportRoot = join(root, 'dist');
const out = join(root, 'test/scratch/validation');
await mkdir(out, { recursive: true });
const snapshots = JSON.parse(await readFile(join(root, 'src/data/snapshot.json'), 'utf8'));
const addresses = {
  imd: '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7',
  simd: '0x9efa934d9fad4ae28c998a40195646b965a97247',
  imdusd: '0x61aaf8a992a3143e2b0c9cb0030b9fe702854a25',
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/preview/')) { res.writeHead(404); res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice('/preview/'.length)) || 'index.html';
    const path = resolve(exportRoot, relative);
    if (!path.startsWith(exportRoot + '/')) throw new Error('Invalid path');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const results = [];
const check = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, passed: true, ...(detail ? { detail } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); throw error; }
};

let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.clock.install();
  const scriptErrors = [], localFailures = [];
  page.on('pageerror', error => scriptErrors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) localFailures.push(`${response.status()} ${response.url()}`); });
  let apiMode = 'success';
  let apiDelay = 0;
  await page.route('https://eth.blockscout.com/api/v2/**', async route => {
    if (apiDelay) await new Promise(resolve => setTimeout(resolve, apiDelay));
    if (apiMode === 'offline') { await route.abort('internetdisconnected'); return; }
    const request = new URL(route.request().url());
    const id = Object.entries(addresses).find(([, address]) => request.pathname.includes(address))?.[0];
    if (!id) { await route.fulfill({ status: 404, body: '{}' }); return; }
    if (apiMode === 'failure' || apiMode === 'partial' && request.pathname.endsWith('/transfers')) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return; }
    const data = snapshots[id];
    let response;
    if (request.pathname.endsWith('/holders')) response = { items: data.holders.map(h => ({ value: h.balance, address: { hash: h.address, name: h.name, is_contract: h.isContract } })), next_page_params: null };
    else if (request.pathname.endsWith('/transfers')) {
      const index = Number(request.searchParams.get('index') || 0);
      response = { items: data.transfers.slice(index * 50, (index + 1) * 50).map(t => ({ from: { hash: t.from }, to: { hash: t.to }, total: { value: t.value }, transaction_hash: t.hash, timestamp: t.timestamp, block_number: t.block, log_index: t.logIndex })), next_page_params: (index + 1) * 50 < data.transfers.length ? { index: index + 1, block_number: 1 } : data.transfersComplete ? null : { index: index + 1, block_number: 1 } };
    } else response = apiMode === 'malformed' ? { items: [] } : { address_hash: addresses[id], type: 'ERC-20', decimals: String(data.decimals), holders_count: String(data.holderCount), total_supply: data.totalSupply };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(response) });
  });
  const settle = () => page.waitForFunction(() => !document.querySelector('.refresh-button').disabled);
  const bubbles = () => page.locator('.bubble').count();
  const openFilters = async () => { if (!await page.locator('.filter-box').getAttribute('open').then(v => v !== null)) await page.locator('.filter-box > summary').click(); };
  const tokenButton = id => page.locator('.token-choice').filter({ has: page.locator(`.token-${id}`) });

  await check('Static export works at /preview/ with local fonts, favicon and share image', async () => {
    await page.goto(url); await settle();
    assert.equal(await page.title(), 'IMD Atlas · Explore the ecosystem');
    assert.equal(await bubbles(), 50);
    assert.ok(await page.evaluate(() => document.fonts.check('400 16px "DM Sans Variable"')));
    for (const selector of ['link[rel="icon"]', 'meta[property="og:image"]']) {
      const ref = await page.locator(selector).getAttribute(selector.startsWith('link') ? 'href' : 'content');
      assert.ok(ref.startsWith('./'));
      assert.equal((await page.request.get(new URL(ref, url).href)).status(), 200);
    }
    assert.deepEqual(scriptErrors, []); assert.deepEqual(localFailures, []);
  });
  await check('No horizontal overflow at 320, 390, 768, 1024 and 1440; product visible on first phone screen', async () => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(120);
      const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, bubble: document.querySelector('.bubble').getBoundingClientRect().top, filter: document.querySelector('.filter-box > summary').getBoundingClientRect().top }));
      assert.ok(layout.scroll <= layout.width, JSON.stringify(layout));
      if (width === 390) { assert.ok(layout.bubble < 800 && layout.filter < 500); }
      await page.screenshot({ path: join(out, `chromium-${width}.png`), fullPage: false });
    }
  });
  await check('Every token has separated, bounded bubbles with reachable centers across responsive breakpoints', async () => {
    apiMode = 'offline';
    const measurements = [];
    for (const width of [280, 320, 390, 599, 600, 768, 999, 1000, 1199, 1200, 1250, 1251, 1440, 1600]) {
      await page.setViewportSize({ width, height: 844 });
      for (const id of ['imd', 'simd', 'imdusd']) {
        await tokenButton(id).click(); await settle();
        await page.keyboard.press('Escape'); await page.mouse.move(0, 0);
        await page.waitForTimeout(100);
        const geometry = await page.evaluate(() => {
          const stage = document.querySelector('.map-stage').getBoundingClientRect();
          const nodes = [...document.querySelectorAll('.bubble')].map(el => {
            const r = el.getBoundingClientRect();
            return { el, address: el.dataset.holderAddress, x: r.x + r.width / 2, y: r.y + r.height / 2, radius: r.width / 2 };
          });
          let minGap = Infinity;
          for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius);
          }
          const outside = nodes.filter(n => n.x - n.radius < stage.left + 8.9 || n.x + n.radius > stage.right - 8.9 || n.y - n.radius < stage.top + 19.9 || n.y + n.radius > stage.bottom - 47.9).map(n => n.address);
          const covered = nodes.filter(n => {
            n.el.scrollIntoView({ block: 'center', behavior: 'instant' });
            const r = n.el.getBoundingClientRect();
            return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.bubble') !== n.el;
          }).map(n => n.address);
          scrollTo(0, 0);
          return { count: nodes.length, minGap, minRadius: Math.min(...nodes.map(n => n.radius)), maxRadius: Math.max(...nodes.map(n => n.radius)), outside, covered, stageHeight: stage.height, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(geometry.count, snapshots[id].holders.length);
        assert.ok(geometry.minGap >= 9.85, `${id} at ${width}: ${JSON.stringify(geometry)}`);
        assert.ok(geometry.minRadius >= 15);
        assert.deepEqual(geometry.outside, []); assert.deepEqual(geometry.covered, []);
        assert.equal(geometry.overflow, false);
        measurements.push({ width, token: id, ...geometry });
        if (id === 'simd' && [320, 390, 768, 1200, 1440].includes(width)) {
          await page.screenshot({ path: join(out, `simd-${width}-first-screen.png`) });
          await page.locator('.map-stage').screenshot({ path: join(out, `simd-${width}-map.png`) });
        }
      }
    }
    await writeFile(join(out, 'bubble-geometry.json'), JSON.stringify(measurements, null, 2));
    apiMode = 'success';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await tokenButton('imd').click(); await settle();
    return { tokenViewportStates: measurements.length, minimumMeasuredGap: Math.min(...measurements.map(m => m.minGap)), coveredCenters: 0 };
  });
  await check('Clicking every sIMD bubble center selects that exact holder at 390, 768 and 1200', async () => {
    apiMode = 'offline';
    let clicks = 0;
    for (const width of [390, 768, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      await tokenButton('simd').click(); await settle();
      for (const address of await page.locator('.bubble').evaluateAll(elements => elements.map(e => e.dataset.holderAddress))) {
        // Scroll from a neutral pointer position so an unrelated hover tooltip
        // does not cover the next target during this geometry regression.
        await page.mouse.move(0, 0);
        await page.keyboard.press('Escape');
        const bubble = page.locator(`.bubble[data-holder-address="${address}"]`);
        await bubble.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        const box = await bubble.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        assert.equal((await page.locator('.full-address').textContent()).toLowerCase(), address);
        await page.getByRole('button', { name: 'Close holder details' }).click();
        await page.waitForFunction(address => document.activeElement.dataset.holderAddress === address, address);
        clicks++;
      }
    }
    apiMode = 'success';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await tokenButton('imd').click(); await settle();
    return { centerClicks: clicks };
  });
  await check('Token-type changes preserve holder size, connection and address filters', async () => {
    await openFilters();
    await page.selectOption('#holder-size', 'small');
    await page.selectOption('#token-type', 'mintable'); await settle();
    assert.equal(await page.locator('#holder-size').inputValue(), 'small');
    assert.equal(await bubbles(), 0);
    await page.selectOption('#token-type', 'fixed'); await settle();
    assert.equal(await page.locator('#holder-size').inputValue(), 'small');
    await page.selectOption('#holder-size', 'large');
    await page.selectOption('#connections', 'connected');
    await page.getByRole('searchbox').fill(snapshots.simd.holders[0].address);
    await page.selectOption('#token-type', 'mintable'); await settle();
    assert.equal(await page.locator('#holder-size').inputValue(), 'large');
    assert.equal(await page.locator('#connections').inputValue(), 'connected');
    assert.equal(await page.getByRole('searchbox').inputValue(), snapshots.simd.holders[0].address);
    assert.equal(await bubbles(), 1);
    await page.locator('.bubble').click();
    assert.equal(await page.locator('.full-address').textContent(), snapshots.simd.holders[0].address);
    await page.selectOption('#token-type', 'fixed'); await settle();
    assert.equal(await page.locator('.holder-details').count(), 0);
    assert.equal(await page.locator('#holder-size').inputValue(), 'large');
    assert.equal(await page.locator('#connections').inputValue(), 'connected');
    assert.equal(await page.getByRole('searchbox').inputValue(), snapshots.simd.holders[0].address);
    await page.getByRole('button', { name: 'Reset filters' }).click();
  });
  await check('Closing a connected holder excluded by search returns keyboard focus to search in map and list views', async () => {
    await tokenButton('imdusd').click(); await settle();
    const address = '0xabe0cdd036456fcc1b64d1ddb7aa3bdf7d5b98b1';
    const peer = '0x000000000004444c5dc75cb358380d2e3de08a90';
    for (const view of ['map', 'list']) {
      await page.getByRole('searchbox').fill(address);
      await page.getByRole('button', { name: view === 'map' ? 'Show bubble map' : 'Show holder list' }).click();
      await page.locator(view === 'map' ? '.bubble' : '.full-list .holder-row').focus();
      await page.keyboard.press('Enter');
      await page.locator('.connection-person').filter({ hasText: '0x0000…8a90' }).focus();
      await page.keyboard.press('Enter');
      assert.equal((await page.locator('.full-address').textContent()).toLowerCase(), peer);
      await page.getByRole('button', { name: 'Close holder details' }).focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement === document.querySelector('input[type="search"]'));
      assert.equal(await page.locator(`[data-holder-address="${peer}"]`).count(), 0);
      assert.equal(await page.getByRole('searchbox').inputValue(), address);
      assert.equal(await page.getByRole('searchbox').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    }
    await page.screenshot({ path: join(out, 'search-focus-return.png') });
    await page.getByRole('button', { name: 'Show bubble map' }).click();
    await tokenButton('imd').click(); await settle();
  });
  await check('Dashboard headings identify the map, token directory and ecosystem introduction', async () => {
    assert.deepEqual(await page.locator('h1, #ecosystem-title, #about-title').allTextContents(), ['Explore IMD holders', 'Ecosystem tokens', 'About the IMD ecosystem']);
  });
  await check('Holder-size and connection filters work, including empty-state recovery', async () => {
    await openFilters();
    await page.selectOption('#holder-size', 'large');
    const largeCount = await bubbles(); assert.ok(largeCount > 0 && largeCount < 50);
    await page.selectOption('#connections', 'connected');
    assert.equal(await bubbles(), 0);
    assert.ok(await page.getByRole('heading', { name: 'No matching holders' }).isVisible());
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await bubbles(), 50);
  });
  await check('Address search and clear control update map and list results', async () => {
    const search = page.getByRole('searchbox');
    await search.fill(snapshots.imd.holders[0].address);
    assert.equal(await bubbles(), 1);
    await search.fill('no-such-holder'); assert.equal(await bubbles(), 0);
    await page.getByRole('button', { name: 'Show holder list' }).click();
    assert.equal(await page.locator('.full-list .holder-row').count(), 0);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    assert.equal(await page.locator('.full-list .holder-row').count(), 50);
    await page.getByRole('button', { name: 'Show bubble map' }).click();
  });
  await check('Mintability filter switches to an eligible token and preserves correct decimals', async () => {
    await page.selectOption('#token-type', 'mintable'); await settle();
    assert.equal(await page.locator('.token-choice').count(), 2);
    assert.match(await page.locator('#map-title').textContent(), /sIMD/);
    await page.locator('.bubble').first().click();
    await page.locator('.exact-balance summary').click();
    assert.ok((await page.locator('.exact-balance code').textContent()).endsWith(' sIMD'));
    assert.equal(await page.locator('.full-address').textContent(), snapshots.simd.holders[0].address);
    await page.getByRole('button', { name: 'Close holder details' }).click();
    await page.selectOption('#token-type', 'fixed'); await settle();
    assert.equal(await page.locator('.token-choice').count(), 1);
    assert.match(await page.locator('#map-title').textContent(), /^IMD/);
    await page.selectOption('#token-type', 'all');
  });
  await check('Real imdUSD transfer links, connection presence filter and show-lines toggle', async () => {
    await tokenButton('imdusd').click(); await settle();
    assert.equal(await page.locator('.connection-line').count(), 9);
    await page.selectOption('#connections', 'connected');
    const count = await bubbles(); assert.ok(count > 0 && count < snapshots.imdusd.holders.length);
    await page.getByRole('checkbox', { name: 'Show connection lines' }).uncheck();
    assert.equal(await page.locator('.connection-line').count(), 0);
    await page.getByRole('checkbox', { name: 'Show connection lines' }).check();
    assert.equal(await page.locator('.connection-line').count(), 9);
    await page.selectOption('#connections', 'all');
  });
  await check('Hover tooltip is hoverable and dismissible; keyboard selection opens full holder details', async () => {
    const bubble = page.locator('.bubble-connected').first();
    await bubble.hover();
    await page.getByRole('tooltip').waitFor();
    await page.getByRole('tooltip').hover(); await page.waitForTimeout(250);
    assert.ok(await page.getByRole('tooltip').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await bubble.hover();
    await bubble.focus(); await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('.full-address').isVisible());
    await page.waitForFunction(() => document.activeElement.id === 'holder-details-title');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'holder-details-title');
    await page.screenshot({ path: join(out, 'holder-details-desktop.png') });
  });
  await check('Copy address, exact balance, transaction evidence and peer selection work', async () => {
    const address = await page.locator('.full-address').textContent();
    await page.getByRole('button', { name: 'Copy address', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), address);
    assert.ok(await page.getByRole('button', { name: 'Copied', exact: true }).isVisible());
    await page.locator('.exact-balance summary').click();
    assert.ok((await page.locator('.exact-balance code').textContent()).includes('imdUSD'));
    const href = await page.locator('.connection-item a').first().getAttribute('href');
    assert.match(href, /^https:\/\/eth.blockscout.com\/tx\/0x[\da-f]{64}$/i);
    await page.locator('.connection-person').first().click();
    assert.notEqual(await page.locator('.full-address').textContent(), address);
    const targetAddress = (await page.locator('.full-address').textContent()).toLowerCase();
    await page.getByRole('button', { name: 'Close holder details' }).click();
    await page.waitForFunction(address => document.activeElement.dataset.holderAddress === address, targetAddress);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.holderAddress), targetAddress);
  });
  await check('Map zoom, reset, list mode and expanded holder list are functional', async () => {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.match(await page.locator('.map-plane').getAttribute('style'), /scale\(1.25\)/);
    await page.getByRole('button', { name: 'Reset map view' }).click();
    assert.ok(await page.getByRole('button', { name: 'Zoom out', exact: true }).isDisabled());
    await page.getByRole('button', { name: 'Show holder list' }).click();
    assert.equal(await page.locator('.full-list .holder-row').count(), snapshots.imdusd.holders.length);
    await page.locator('.full-list .holder-row').first().click();
    await page.getByRole('button', { name: 'Close holder details' }).click();
    await page.getByRole('button', { name: 'Show bubble map' }).click();
    await page.getByRole('button', { name: `View all ${snapshots.imdusd.holders.length} holders` }).click();
    assert.equal(await page.locator('.holders-panel .holder-row').count(), snapshots.imdusd.holders.length);
    await page.getByRole('button', { name: 'Show top 8 holders' }).click();
    assert.equal(await page.locator('.holders-panel .holder-row').count(), 8);
  });
  await check('Phone token/filter/tap flows work and focus returns after closing details', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await tokenButton('simd').click(); await settle();
    await openFilters(); await page.selectOption('#holder-size', 'large');
    await page.locator('.filter-box > summary').click();
    await page.locator('.bubble').first().click();
    assert.ok(await page.locator('.full-address').isVisible());
    const closeBounds = await page.getByRole('button', { name: 'Close holder details' }).boundingBox();
    assert.ok(closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= 844);
    await page.getByRole('button', { name: 'Close holder details' }).click();
    await page.locator('.bubble:focus').waitFor();
    await openFilters(); await page.getByRole('button', { name: 'Reset filters' }).click();
    await page.locator('.filter-box > summary').click();
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const phone = await touchContext.newPage();
      await phone.route('https://eth.blockscout.com/**', route => route.abort());
      await phone.goto(url);
      await phone.locator('.token-choice').last().tap();
      await phone.locator('.bubble').first().tap();
      assert.ok(await phone.locator('.full-address').isVisible());
      await phone.getByRole('button', { name: 'Close holder details' }).tap();
      await phone.locator('.bubble:focus').waitFor();
      await phone.locator('.filter-box > summary').tap();
      assert.ok(await phone.locator('#holder-size').isVisible());
    } finally { await touchContext.close(); }
  });
  await check('Loading state retains a labeled snapshot and respects reduced motion', async () => {
    apiDelay = 200;
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Refresh live data' }).click();
    await page.locator('.refresh-button:disabled').waitFor();
    assert.ok(await page.getByRole('button', { name: 'Refresh live data' }).isDisabled());
    assert.match(await page.locator('.data-status').textContent(), /Updating · previous data/);
    assert.equal(await page.locator('.refreshing').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.ok(await bubbles() > 0);
    await settle(); apiDelay = 0;
  });
  await check('Provider failure and retry retain real data and recover to live status', async () => {
    apiMode = 'failure';
    await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
    assert.match(await page.locator('.data-status').textContent(), /Snapshot · Live update unavailable/);
    assert.ok(await bubbles() > 0);
    assert.ok(await page.locator('.error-notice').isVisible());
    apiMode = 'success';
    await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
    assert.match(await page.locator('.data-status').textContent(), /Live data · Blockscout/);
    assert.equal(await page.locator('.error-notice').count(), 0);
  });
  await check('Partial transfer failure is explicit and disables misleading connection filtering', async () => {
    await openFilters(); await page.selectOption('#connections', 'connected');
    apiMode = 'partial';
    await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
    assert.ok(await page.locator('#connections').isDisabled());
    assert.equal(await page.locator('#connections').inputValue(), 'all');
    assert.ok(await page.getByText('Transfer history is incomplete.', { exact: false }).isVisible());
    apiMode = 'success';
    await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
    assert.ok(await page.locator('#connections').isEnabled());
  });
  await check('Malformed data and offline reload fall back without blanking the map', async () => {
    apiMode = 'malformed'; await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
    assert.match(await page.locator('.data-status').textContent(), /Snapshot/);
    assert.ok(await bubbles() > 0);
    apiMode = 'offline'; await page.reload(); await settle();
    assert.equal(await bubbles(), 50);
    assert.match(await page.locator('.data-status').textContent(), /Snapshot/);
    await page.screenshot({ path: join(out, 'offline-mobile.png'), fullPage: true });
    apiMode = 'success'; await page.getByRole('button', { name: 'Refresh live data' }).click(); await settle();
  });
  await check('Rapid token changes cannot show a stale response for a different contract', async () => {
    apiDelay = 100;
    await tokenButton('simd').click(); await tokenButton('imdusd').click(); await settle(); apiDelay = 0;
    assert.match(await page.locator('#map-title').textContent(), /imdUSD/);
    assert.equal(await bubbles(), snapshots.imdusd.holders.length);
    assert.ok((await page.locator('.token-contract').getAttribute('href')).toLowerCase().includes(addresses.imdusd));
  });
  await check('Successful data ages into snapshot status after five minutes', async () => {
    await page.clock.fastForward(6 * 60_000);
    assert.match(await page.locator('.data-status').textContent(), /Snapshot · Blockscout/);
    await page.clock.resume();
  });
  await check('Automated accessibility audit at phone and desktop, including selected holder', async () => {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const audits = [];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const audit = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }));
      audits.push({ width, violations: audit.violations, incomplete: audit.incomplete.map(r => r.id) });
      assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), []);
    }
    await page.locator('.bubble').first().click();
    const detailsAudit = await page.evaluate(() => window.axe.run('.holder-details'));
    assert.deepEqual(detailsAudit.violations, []);
    await writeFile(join(out, 'accessibility.json'), JSON.stringify({ audits, details: detailsAudit.violations }, null, 2));
    await page.getByRole('button', { name: 'Close holder details' }).click();
    return audits.map(a => ({ width: a.width, violations: a.violations.length, incomplete: a.incomplete }));
  });
  await check('Navigation, 200% text enlargement and final console/resource checks', async () => {
    await page.getByRole('link', { name: 'Ecosystem', exact: true }).click(); assert.ok(page.url().endsWith('#ecosystem'));
    await page.getByRole('link', { name: 'About', exact: true }).click(); assert.ok(page.url().endsWith('#about'));
    await page.getByRole('link', { name: 'Back to top', exact: false }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.style.fontSize = '32px');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(out, 'text-200-mobile.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    assert.deepEqual(scriptErrors, []); assert.deepEqual(localFailures, []);
  });
  await context.close();
  // This is a separate engine smoke check. An unavailable system runtime is recorded, never a pass.
  try {
    const safari = await webkit.launch();
    try {
      const page = await safari.newPage({ viewport: { width: 390, height: 844 } });
      await page.route('https://eth.blockscout.com/**', route => route.abort());
      await page.goto(url);
      await page.locator('.token-choice').last().click();
      await page.locator('.bubble').first().click();
      assert.ok(await page.locator('.full-address').isVisible());
      await page.screenshot({ path: join(out, 'webkit-mobile.png') });
      results.push({ name: 'WebKit mobile token switch and holder selection', passed: true });
    } finally { await safari.close(); }
  } catch (error) {
    results.push({ name: 'WebKit mobile validation', passed: null, limitation: error.message });
    console.log('UNPERFORMED WebKit: runtime unavailable (see results.json)');
  }
} catch (error) { process.exitCode = 1; console.error(error); }
finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(join(out, 'results.json'), JSON.stringify({ recordedAt: new Date().toISOString(), dataMode: 'Deterministic real snapshot responses; failures deliberately simulated. Live network checked separately.', results }, null, 2));
  console.log(`${results.filter(r => r.passed === true).length} passed, ${results.filter(r => r.passed === false).length} failed, ${results.filter(r => r.passed === null).length} unperformed.`);
}

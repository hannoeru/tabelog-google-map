import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(__dirname, '../tabelog-google-map.user.js');
const userscript = await readFile(scriptPath, 'utf8');
const url = process.env.TABELOG_E2E_URL ?? 'https://tabelog.com/tokyo/A1314/A131401/13034212/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('.rdheader-action-wrap, h2.display-name, h1', { timeout: 15_000 });

  await page.evaluate(() => {
    window.__tgmOpenedUrl = '';
    window.GM_openInTab = (targetUrl) => {
      window.__tgmOpenedUrl = targetUrl;
    };
  });
  await page.evaluate(userscript);

  const result = await page.evaluate(() => {
    const button = document.querySelector('#tgm-open-by-name');
    const actionPanel = button?.closest('.p-btn-bkm-actionpanel__action');
    const actionItem = button?.closest('.p-btn-bkm-actionpanel__item');
    const title = button?.getAttribute('title');
    const text = button?.textContent?.trim();
    const actionButtons = [...document.querySelectorAll('.p-btn-bkm-actionpanel__action button')]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent.trim(),
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
        };
      });
    const actionPanelRect = actionPanel?.getBoundingClientRect();
    const restaurantJsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((node) => {
        try {
          return JSON.parse(node.textContent);
        } catch {
          return null;
        }
      })
      .flat()
      .find((item) => item?.['@type'] === 'Restaurant');

    return {
      hasButton: Boolean(button),
      isInActionPanel: Boolean(actionPanel),
      isInActionPanelItem: Boolean(actionItem),
      isFirstActionItem: actionPanel?.firstElementChild === actionItem,
      title,
      text,
      actionButtons,
      actionPanelRight: actionPanelRect?.right ?? 0,
      restaurantName: restaurantJsonLd?.name ?? '',
    };
  });

  assert.equal(result.hasButton, true, 'button should be added');
  assert.equal(result.isInActionPanel, true, 'button should be placed in the Tabelog action panel');
  assert.equal(result.isInActionPanelItem, true, 'button should use the Tabelog action item wrapper');
  assert.equal(result.isFirstActionItem, true, 'button should be the first action item');
  assert.equal(result.text, '地図', 'button should use a compact label matching the action panel');
  assert.equal(new Set(result.actionButtons.map((button) => button.top)).size, 1, 'action buttons should stay on one row');
  assert.equal(result.actionButtons.every((button) => button.height === 31), true, 'action buttons should use the native action panel height');
  assert.equal(result.actionButtons[0].width, 62, 'map button should use compact width');
  assert.equal(result.actionButtons.every((button) => button.right <= result.actionPanelRight), true, 'action buttons should stay inside the action panel');
  assert.equal(result.actionButtons.slice(1).every((button, index) => button.left - result.actionButtons[index].right <= 4), true, 'action buttons should not be spread apart');
  assert.ok(result.restaurantName, 'fixture page should expose a restaurant name');
  assert.match(result.title, new RegExp(result.restaurantName), 'button title should use the restaurant name');

  await page.evaluate(() => {
    document.querySelectorAll('.js-lang-change-section-overlay, .c-overlay')
      .forEach((node) => node.remove());
  });
  await page.click('#tgm-open-by-name');
  const mapsUrl = await page.waitForFunction(() => window.__tgmOpenedUrl, null, { timeout: 5_000 })
    .then((handle) => handle.jsonValue());
  assert.equal(new URL(mapsUrl).hostname, 'www.google.com');
  assert.equal(new URL(mapsUrl).pathname, '/maps/search/');
  assert.equal(new URL(mapsUrl).searchParams.get('api'), '1');
  assert.equal(new URL(mapsUrl).searchParams.get('query'), result.restaurantName);

  console.log(JSON.stringify({ ok: true, url, mapsUrl, placement: 'p-btn-bkm-actionpanel__action' }, null, 2));
} finally {
  await browser.close();
}

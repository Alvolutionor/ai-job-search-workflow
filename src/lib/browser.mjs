// Based directly on geekgeekrun/packages/geek-auto-start-chat-with-boss/index.mjs:91-114, 1697-1723.
// Uses the same puppeteer-extra plugin stack (stealth + laodeng + anonymize-ua) and the same
// cookie + localStorage loading pattern.

import { loadCookieFile } from './cookies.mjs';
import { loadLocalStorageFile } from './local-storage.mjs';
import { normalizeString, sleep } from './utils.mjs';

const localStorageSeedUrl = 'https://www.zhipin.com/desktop/';

export function isPotentialBlockUrl(url) {
  return /(captcha|verify|security|geetest|_security_check)/i.test(url ?? '');
}

let puppeteer;
let pluginsRegistered = false;

async function ensurePuppeteer() {
  if (puppeteer && pluginsRegistered) {
    return puppeteer;
  }
  const [
    { default: puppeteerExtra },
    { default: StealthPlugin },
    { default: LaodengPlugin },
    { default: AnonymizeUaPlugin },
  ] = await Promise.all([
    import('puppeteer-extra'),
    import('puppeteer-extra-plugin-stealth'),
    import('@geekgeekrun/puppeteer-extra-plugin-laodeng'),
    import('puppeteer-extra-plugin-anonymize-ua'),
  ]);
  puppeteer = puppeteerExtra;
  if (!pluginsRegistered) {
    puppeteer.use(StealthPlugin());
    puppeteer.use(LaodengPlugin());
    puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }));
    pluginsRegistered = true;
  }
  return puppeteer;
}

// Mirrors @geekgeekrun/utils/puppeteer/local-storage.mjs `setDomainLocalStorage`.
async function seedBossLocalStorage(browser, kv) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      request.respond({
        status: 200,
        contentType: 'text/plain',
        body: ':)',
      });
    });
    await page.goto(localStorageSeedUrl);
    await page.evaluate((entries) => {
      for (const key of Object.keys(entries)) {
        window.localStorage.setItem(key, entries[key]);
      }
    }, kv);
  } finally {
    await page.close().catch(() => void 0);
  }
}

export async function launchBossSession({ headless = false } = {}) {
  const pptr = await ensurePuppeteer();
  const browser = await pptr.launch({
    headless,
    ignoreHTTPSErrors: true,
    defaultViewport: {
      width: 1440,
      height: 760,
    },
    args: [
      // Keep JS timers, rAF, and network active when the window is backgrounded
      // or occluded. Without these flags BOSS's infinite-scroll handler stops
      // firing as soon as the user alt-tabs away.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion,TranslateUI',
      '--disable-hang-monitor',
    ],
  });

  const page = (await browser.pages())[0] ?? await browser.newPage();

  const cookies = loadCookieFile();
  for (const raw of cookies) {
    const cookie = { ...raw };
    if (Object.hasOwn(cookie, 'sameSite')) {
      cookie.sameSite = 'unspecified';
    }
    await page.setCookie(cookie);
  }

  try {
    const localStorageState = loadLocalStorageFile();
    await seedBossLocalStorage(browser, localStorageState);
  } catch (error) {
    // localStorage file may be absent on first run; cookies alone are usually enough.
    console.warn(`Skipping localStorage seed: ${error.message}`);
  }

  await page.bringToFront();

  return {
    browser,
    page,
    close: async () => {
      await browser.close().catch(() => void 0);
    },
  };
}

export async function collectPageDiagnostic(page) {
  if (!page || page.isClosed()) {
    return { url: 'page-closed', title: '', bodySnippet: '' };
  }
  const bodyText = normalizeString(
    await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''),
  );
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    bodySnippet: bodyText.slice(0, 180),
  };
}

export async function detectBlockReason(page) {
  if (!page || page.isClosed()) {
    return 'page closed unexpectedly';
  }
  const currentUrl = page.url();
  if (currentUrl === 'about:blank') {
    return 'page unexpectedly navigated to about:blank';
  }
  if (isPotentialBlockUrl(currentUrl)) {
    return `possible anti-bot verification page: ${currentUrl}`;
  }
  const bodyText = normalizeString(
    await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''),
  );
  if (/(安全验证|访问受限|异常访问)/.test(bodyText)) {
    return bodyText.slice(0, 120);
  }
  return null;
}

export { sleep };

import { sleep } from './utils.mjs';
import { isPotentialBlockUrl } from './browser.mjs';

function withTimeout(promise, timeoutMs, operation) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs} ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

// DOM selectors BOSS has used for the JD body on job_detail/<id>.html pages.
const descriptionSelectors = [
  '.job-sec-text',
  '.job-detail-section .text',
  '.detail-content .text',
  '[class*="job-sec"] .text',
  '.job-detail .desc',
];

const emptyPageMarkers = [
  /加载中/,
  /loading/i,
  /系统繁忙/,
  /稍后再试/,
  /请稍候/,
];

function looksLikeEmptyShell(text) {
  if (!text) return true;
  const normalized = text.trim();
  if (normalized.length < 20) return true;
  return emptyPageMarkers.some((re) => re.test(normalized));
}

const TRANSIENT_ERROR_PATTERNS = [
  /Protocol error/i,
  /No data found for resource/i,
  /Target closed/i,
  /Session closed/i,
  /frame was detached/i,
  /Execution context was destroyed/i,
];

function isTransientError(error) {
  const message = String(error?.message ?? error ?? '');
  return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(message));
}

export async function extractJobDescription(page) {
  return await page.evaluate((selectors) => {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText?.trim();
        if (text && text.length > 20) return text;
      }
    }
    return null;
  }, descriptionSelectors);
}

// Extract boss "最近活跃/刚刚活跃" and any job-update/publish label visible on
// the detail page. BOSS doesn't expose an absolute publish timestamp, but these
// labels give a relative freshness signal ("今日活跃", "X 天前更新", etc.).
export async function extractJobActivity(page) {
  return await page.evaluate(() => {
    const result = { bossActiveLabel: null, publishLabelDetail: null };

    const activeSelectors = [
      '[class*="gray"][class*="time"]',
      '.boss-online-tag',
      '.online-status',
      '.boss-info-attr',
      '[class*="active-time"]',
      '[class*="boss-active"]',
    ];
    for (const sel of activeSelectors) {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim();
      if (text && /刚刚|今日|本月|小时|分钟|天|周|月|在线|活跃/.test(text) && text.length < 30) {
        result.bossActiveLabel = text;
        break;
      }
    }
    // Fallback: scan small elements for activity phrasing near the boss row.
    if (!result.bossActiveLabel) {
      const candidates = Array.from(document.querySelectorAll('.job-boss-info span, .job-boss-info div, .boss-info span, .detail-op span'));
      for (const el of candidates) {
        const text = (el.innerText || '').trim();
        if (text && /刚刚|今日|本月|小时前|分钟前|天前|活跃|在线/.test(text) && text.length < 30) {
          result.bossActiveLabel = text;
          break;
        }
      }
    }

    const publishSelectors = [
      '[class*="publish-time"]',
      '[class*="update-time"]',
      '.sub-li[class*="update"]',
      '.detail-update-time',
    ];
    for (const sel of publishSelectors) {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim();
      if (text && /发布|更新|前|今日|昨日/.test(text) && text.length < 30) {
        result.publishLabelDetail = text;
        break;
      }
    }
    // Scan for publish phrasing in small spans.
    if (!result.publishLabelDetail) {
      const candidates = Array.from(document.querySelectorAll('.job-sec span, .detail-op span, .job-primary span, .job-banner span'));
      for (const el of candidates) {
        const text = (el.innerText || '').trim();
        if (text && /(\d+[分钟小时天周月]前|今日发布|刚刚发布|更新于)/.test(text) && text.length < 30) {
          result.publishLabelDetail = text;
          break;
        }
      }
    }

    return result;
  });
}

// Click-in-list JD fetch: scroll card into view on the list page, click it with
// a real anchor.click() (BOSS opens detail in new tab). If the card is virtualized
// out of the DOM or the click doesn't produce a new tab, fall back to `window.open(url)`
// which deterministically opens a new tab that we capture.
export async function fetchJobDetailViaClick({
  listPage,
  browser,
  jobId,
  jobUrl,
  timeoutMs = 30_000,
}) {
  // Register the new-tab listener BEFORE doing anything to avoid missing fast targets.
  let capturedPage = null;
  const expectedFragment = `job_detail/${jobId}.html`;
  const onTarget = async (target) => {
    if (capturedPage) return;
    if (target.type() !== 'page') return;
    try {
      capturedPage = await withTimeout(target.page(), Math.min(timeoutMs, 10_000), 'target.page');
    } catch {
      // ignore; we'll keep listening for next target
    }
  };
  browser.on('targetcreated', onTarget);

  try {
    // Optional "engagement" gesture: if the card is in the list DOM, scroll it
    // into view and hover it briefly so BOSS sees mouse activity near this job
    // before we open it. We do NOT click the card — some BOSS layouts don't use
    // target="_blank" and a click would navigate the list page itself, detaching
    // its frame and breaking subsequent iterations.
    const anchor = await withTimeout(listPage.$(`a[href*="${expectedFragment}"]`), Math.min(timeoutMs, 10_000), 'list anchor lookup');
    if (anchor) {
      await withTimeout(anchor.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })), Math.min(timeoutMs, 5_000), 'scroll to job').catch(() => void 0);
      await sleep(300 + Math.floor(Math.random() * 400));
      await withTimeout(listPage.mouse.wheel({ deltaY: 40 + Math.floor(Math.random() * 80) }), Math.min(timeoutMs, 5_000), 'mouse wheel').catch(() => void 0);
      try {
        const box = await withTimeout(anchor.boundingBox(), Math.min(timeoutMs, 5_000), 'anchor bounds');
        if (box) {
          const cx = box.x + box.width / 2 + (Math.random() * 20 - 10);
          const cy = box.y + box.height / 2 + (Math.random() * 10 - 5);
          await withTimeout(listPage.mouse.move(cx, cy, { steps: 4 + Math.floor(Math.random() * 4) }), Math.min(timeoutMs, 5_000), 'mouse move');
          await sleep(120 + Math.floor(Math.random() * 220));
        }
      } catch {
        // hover best-effort
      }
    }

    // Deterministically open the detail in a new tab — doesn't touch list nav state.
    await withTimeout(listPage.evaluate((url) => window.open(url, '_blank'), jobUrl), Math.min(timeoutMs, 10_000), 'open job tab').catch(() => void 0);
    const openDeadline = Date.now() + Math.min(timeoutMs, 15_000);
    while (!capturedPage && Date.now() < openDeadline) await sleep(150);
  } finally {
    browser.off('targetcreated', onTarget);
  }

  if (!capturedPage) {
    return { status: 'error', error: new Error(`no new tab produced for ${jobId}`) };
  }

  const detailPage = capturedPage;
  try {
    // Wait for URL to resolve past about:blank.
    const urlDeadline = Date.now() + Math.min(timeoutMs, 15_000);
    while (detailPage.url() === 'about:blank' && Date.now() < urlDeadline) {
      await sleep(200);
    }

    await detailPage.waitForSelector(
      descriptionSelectors.join(','),
      { timeout: Math.min(timeoutMs, 10_000) },
    ).catch(() => void 0);
    await sleep(300 + Math.floor(Math.random() * 500));

    let description = await withTimeout(extractJobDescription(detailPage), Math.min(timeoutMs, 10_000), 'read job description');
    if (!description || looksLikeEmptyShell(description)) {
      await sleep(900 + Math.floor(Math.random() * 1_000));
      description = await withTimeout(extractJobDescription(detailPage), Math.min(timeoutMs, 10_000), 'retry job description');
    }

    // Also try to capture boss activity + job publish/update labels while we're here.
    const activity = await withTimeout(extractJobActivity(detailPage), Math.min(timeoutMs, 10_000), 'read job activity').catch(() => ({}));

    if (description && !looksLikeEmptyShell(description)) {
      return {
        status: 'ok',
        description,
        bossActiveLabel: activity?.bossActiveLabel ?? null,
        publishLabelDetail: activity?.publishLabelDetail ?? null,
      };
    }
    if (isPotentialBlockUrl(detailPage.url())) {
      return { status: 'blocked', error: new Error(`security check page: ${detailPage.url()}`) };
    }
    return {
      status: 'empty',
      bossActiveLabel: activity?.bossActiveLabel ?? null,
      publishLabelDetail: activity?.publishLabelDetail ?? null,
    };
  } catch (error) {
    return { status: 'error', error };
  } finally {
    await withTimeout(detailPage.close(), Math.min(timeoutMs, 5_000), 'close job tab').catch(() => void 0);
    await withTimeout(listPage.bringToFront(), Math.min(timeoutMs, 5_000), 'return to list').catch(() => void 0);
  }
}

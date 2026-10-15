import fs from 'node:fs';
import path from 'node:path';

import { collectPageDiagnostic, detectBlockReason, launchBossSession } from './browser.mjs';
import { humanSleep, humanizeInteraction, interCityPause } from './humanize.mjs';
import { fetchJobDetailViaClick } from './job-detail.mjs';
import { normalizeJobRecord } from './normalize-job.mjs';
import { debugDir } from './paths.mjs';
import { clipText, sleep, sleepRandom } from './utils.mjs';

// Landing URL for a search. We do NOT put a `page` param here — BOSS's SPA appears
// to ignore URL page param and only advance via its internal click handler. The list
// page's own `下一页` button is what actually fetches fresh content for page 2+.
function buildLandingUrl({ keyword, cityCode }) {
  const params = new URLSearchParams({
    query: keyword,
    city: String(cityCode),
  });
  return `https://www.zhipin.com/web/geek/jobs?${params.toString()}`;
}

function extractJobList(payload) {
  const root = payload?.zpData ?? payload?.data ?? payload ?? {};
  const listCandidates = [
    root.jobList,
    root.list,
    root.rows,
    root.jobCardList,
    root.searchResult?.jobList,
  ];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate)) {
      return {
        jobs: candidate,
        hasMore: Boolean(root.hasMore ?? root.hasMoreData ?? (candidate.length > 0)),
        envelope: {
          hasMore: root.hasMore,
          hasMoreData: root.hasMoreData,
          totalCount: root.totalCount ?? root.total,
          pageNum: root.pageNum ?? root.page,
          pageSize: root.pageSize,
          jobCount: candidate.length,
        },
        payloadRoot: root,
      };
    }
  }
  return { jobs: [], hasMore: false, envelope: null, payloadRoot: root };
}

function saveDebugResponse(fileName, payload) {
  const absolutePath = path.join(debugDir, fileName);
  fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
  return absolutePath;
}

function formatPageDiagnostic(diagnostic) {
  if (!diagnostic) {
    return '';
  }
  const parts = [];
  if (diagnostic.url) parts.push(`url=${diagnostic.url}`);
  if (diagnostic.title) parts.push(`title=${diagnostic.title}`);
  if (diagnostic.bodySnippet) parts.push(`body=${clipText(diagnostic.bodySnippet, 120)}`);
  return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
}

function responseMatchesTask(response, task, pageNumber) {
  const url = response.url();
  if (!url.startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')) {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const cityParam = parsed.searchParams.get('city');
  const pageParam = parsed.searchParams.get('page');
  const queryParam = parsed.searchParams.get('query');
  if (cityParam && cityParam !== String(task.searchCity.code)) return false;
  if (pageParam && String(pageNumber) !== pageParam) return false;
  if (queryParam && queryParam.trim() && queryParam !== task.keyword) return false;
  return true;
}

// Known-transient Puppeteer errors — mostly races between response arrival and GC of
// the underlying network resource. Retrying after a brief wait almost always works.
const TRANSIENT_ERROR_PATTERNS = [
  /Protocol error/i,
  /No data found for resource/i,
  /Target closed/i,
  /Session closed/i,
  /frame was detached/i,
  /Execution context was destroyed/i,
  /Navigation failed because browser has disconnected/i,
];

function isTransientError(error) {
  const message = String(error?.message ?? error ?? '');
  return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(message));
}

async function landOnSearchPage(page, task, config) {
  const url = buildLandingUrl({
    keyword: task.keyword,
    cityCode: task.searchCity.code,
  });

  // Match the first joblist.json response fired by the landing (page 1).
  const responsePromise = page.waitForResponse(
    (res) => res.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json'),
    { timeout: config.requestTimeoutMs },
  );
  responsePromise.catch(() => void 0);

  const navigationPromise = page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.requestTimeoutMs,
  }).catch((error) => ({ navigationError: error }));

  try {
    const response = await responsePromise;
    const payload = await response.json();
    await navigationPromise.catch(() => void 0);
    if (payload?.code !== 0) {
      const debugPath = saveDebugResponse(
        `boss-landing-error-${task.searchCity.code}-${Date.now()}.json`,
        payload,
      );
      throw new Error(`BOSS returned code=${payload?.code ?? 'unknown'} on landing for ${task.keyword}/${task.searchCity.name}. Debug saved to ${debugPath}`);
    }
    return payload;
  } catch (error) {
    const diagnostic = await collectPageDiagnostic(page).catch(() => null);
    const wrapped = new Error(
      `Failed to land on search page ${task.searchCity.name}/${task.keyword}: ${error.message}${formatPageDiagnostic(diagnostic)}`,
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

// BOSS is infinite-scroll. The UI loads more jobs when the user scrolls to the
// bottom using real wheel events. `window.scrollTo()` injected via page.evaluate
// doesn't fire the same events — BOSS's scroll listener ignores it. So we use
// `page.mouse.wheel()`, which Chromium dispatches as an OS-level wheel event.
async function advanceToNextPage(page, task, config) {
  const responsePromise = page.waitForResponse(
    (res) => res.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json'),
    { timeout: config.requestTimeoutMs },
  );
  responsePromise.catch(() => void 0);

  // Make sure the mouse is inside the viewport so wheel events have a target.
  const viewport = page.viewport?.() ?? { width: 1440, height: 760 };
  await page.mouse.move(
    Math.floor(viewport.width * 0.5),
    Math.floor(viewport.height * 0.5),
  ).catch(() => void 0);

  // Several wheel bursts with small pauses, mimicking a user dragging the scrollbar.
  const bursts = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < bursts; i += 1) {
    const delta = 700 + Math.floor(Math.random() * 600);
    await page.mouse.wheel({ deltaY: delta }).catch(() => void 0);
    await sleep(150 + Math.floor(Math.random() * 300));
  }

  try {
    const response = await responsePromise;
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(`BOSS code=${payload?.code}`);
    return { status: 'ok', payload, via: 'wheel' };
  } catch (error) {
    // Wheel didn't trigger a fresh load — BOSS stopped serving or the listener fired
    // too early. Dump what the page looks like so we can refine.
    const diag = await page.evaluate(() => ({
      url: location.href,
      height: document.body.scrollHeight,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      bodyTail: (document.body.innerHTML || '').slice(-1200),
    })).catch(() => null);
    if (diag) {
      const debugPath = saveDebugResponse(
        `pagination-debug-${task.searchCity.code}-${Date.now()}.json`,
        diag,
      );
      console.log(`  [debug] scroll-stop dump saved to ${debugPath}`);
    }
    return { status: 'no-more' };
  }
}

async function fetchSearchPage(page, task, config, pageNumber, isFirstOfTask) {
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      if (isFirstOfTask) {
        return { status: 'ok', payload: await landOnSearchPage(page, task, config) };
      }
      return await advanceToNextPage(page, task, config);
    } catch (error) {
      lastError = error;
      const transient = isTransientError(error) || isTransientError(error?.cause);
      if (!transient || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      const waitMs = 2_500 * attempt + Math.floor(Math.random() * 2_000);
      console.warn(
        `  [retry] ${task.searchCity.name} page ${pageNumber} transient error, attempt ${attempt}/${MAX_ATTEMPTS - 1} after ${waitMs}ms: ${clipText(String(error.message), 100)}`,
      );
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function reloadSearchTab(page, task, config) {
  console.log(`  [reload] refreshing tab to try to reset BOSS session counter`);
  const responsePromise = page.waitForResponse(
    (res) => res.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json'),
    { timeout: Math.min(config.requestTimeoutMs, 20_000) },
  );
  responsePromise.catch(() => void 0);

  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs });
  } catch (error) {
    console.warn(`  [reload] nav error: ${clipText(error.message, 100)}`);
  }

  try {
    const response = await responsePromise;
    const payload = await response.json();
    const env = extractJobList(payload).envelope;
    if (env) console.log(`  [post-reload envelope] ${JSON.stringify(env)}`);
  } catch (error) {
    console.warn(`  [reload] no joblist response after reload: ${clipText(error.message, 100)}`);
  }

  await sleep(3_000 + Math.floor(Math.random() * 4_000));
}

async function wanderThenReturn(page, task, config) {
  const landingUrl = buildLandingUrl({
    keyword: task.keyword,
    cityCode: task.searchCity.code,
  });
  console.log(`  [wander] navigating away to break linear-scroll pattern`);
  try {
    await page.goto('https://www.zhipin.com/', { waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs });
    await sleep(2_500 + Math.floor(Math.random() * 3_500));
    await page.evaluate(() => window.scrollBy(0, 400 + Math.random() * 800)).catch(() => void 0);
    await sleep(1_500 + Math.floor(Math.random() * 2_000));

    const responsePromise = page.waitForResponse(
      (res) => res.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json'),
      { timeout: config.requestTimeoutMs },
    );
    responsePromise.catch(() => void 0);
    await page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs });
    try {
      const response = await responsePromise;
      const payload = await response.json();
      const env = extractJobList(payload).envelope;
      if (env) console.log(`  [post-wander envelope] ${JSON.stringify(env)}`);
    } catch (error) {
      console.warn(`  [wander] no joblist after return: ${clipText(error.message, 100)}`);
    }
    await sleep(2_000 + Math.floor(Math.random() * 3_000));
  } catch (error) {
    console.warn(`  [wander] failed: ${clipText(error.message, 100)}`);
  }
}

async function processTask({ db, page, task, taskState, config, session, skipJd = false }) {
  // Infinite-scroll pagination via page.mouse.wheel(). On resume we always
  // replay from page 1 since the SPA can't jump — upsert makes replay cheap.
  let jobsSeen = 0;
  let pagesCompleted = 0;

  const seenJobIdsThisTask = new Set();
  const allCollectedJobs = []; // deduped by jobId across pages; used for JD phase
  // Rolling window: if the last WINDOW pages produced fewer than MIN_NEW fresh
  // job_ids combined, BOSS's result pool is exhausted. Legit end-of-results.
  const WINDOW = 3;
  const MIN_NEW_IN_WINDOW = 5;
  const recentNewCounts = [];

  // Exit-reason flags — we only mark the task `done` on a legitimate end
  // signal. BOSS silently serving empty responses ≠ done; it's throttling.
  let legitEnd = false;
  let throttleReason = null;

  db.beginTask(task.keyword, task.searchCity);

  let pageNumber = 1;
  while (true) {
    await humanSleep({
      minMs: config.minDelayMs,
      maxMs: config.maxDelayMs,
      longPauseProbability: 0.04,
      longPauseMinMs: 45_000,
      longPauseMaxMs: 90_000,
      label: `${task.searchCity.name} p${pageNumber}`,
    });

    if (session.hasNavigated) {
      const blockReason = await detectBlockReason(page);
      if (blockReason) {
        throw new Error(`crawl blocked before page ${pageNumber}: ${blockReason}`);
      }
    }

    const fetchResult = await fetchSearchPage(page, task, config, pageNumber, pageNumber === 1);
    if (fetchResult.status === 'no-more') {
      throttleReason = `wheel scroll produced no joblist response at page ${pageNumber} — BOSS likely throttled the session`;
      console.log(`  [${task.searchCity.name}] ${throttleReason}`);
      break;
    }
    const payload = fetchResult.payload;
    session.hasNavigated = true;

    await humanizeInteraction(page);
    const { jobs, envelope } = extractJobList(payload);
    if (envelope) {
      console.log(`  [envelope] ${JSON.stringify(envelope)}`);
    }

    if (jobs.length === 0) {
      // BOSS's own signals distinguish "real end" from "throttled empty response".
      if (envelope && envelope.hasMore === false && (envelope.totalCount ?? 0) > 0) {
        legitEnd = true;
      } else {
        throttleReason = `page ${pageNumber} returned 0 jobs (envelope=${JSON.stringify(envelope)}) — likely throttled`;
        console.log(`  [${task.searchCity.name}] ${throttleReason}`);
      }
      break;
    }

    const collectedAtMs = Date.now();
    let savedCount = 0;
    let newOnThisPage = 0;
    const normalizedJobs = [];
    for (const rawJob of jobs) {
      const normalizedJob = normalizeJobRecord(rawJob, {
        keyword: task.keyword,
        searchCity: task.searchCity,
        pageNumber,
        collectedAtMs,
      });
      if (!normalizedJob) continue;
      normalizedJobs.push(normalizedJob);
      savedCount += 1;
      if (!seenJobIdsThisTask.has(normalizedJob.jobId)) {
        seenJobIdsThisTask.add(normalizedJob.jobId);
        newOnThisPage += 1;
      }
    }

    if (normalizedJobs.length > 0) {
      db.saveNormalizedJobs(normalizedJobs);
      allCollectedJobs.push(...normalizedJobs);
    }

    jobsSeen += savedCount;
    pagesCompleted = pageNumber;

    console.log(
      `[${task.searchCity.name}] ${task.keyword} page ${pageNumber}: saved ${savedCount} jobs (${newOnThisPage} new, total ${jobsSeen})`,
    );

    db.updateTaskProgress(task.keyword, task.searchCity, {
      pageCursor: pageNumber,
      pagesCompleted,
      jobsSeen,
    });

    recentNewCounts.push(newOnThisPage);
    if (recentNewCounts.length > WINDOW) recentNewCounts.shift();

    if (recentNewCounts.length === WINDOW) {
      const windowSum = recentNewCounts.reduce((a, b) => a + b, 0);
      if (windowSum < MIN_NEW_IN_WINDOW) {
        console.log(`  [early-stop] ${task.searchCity.name} — last ${WINDOW} pages combined: ${windowSum} new jobs (< ${MIN_NEW_IN_WINDOW})`);
        legitEnd = true;
        break;
      }
    }

    if (envelope && envelope.hasMore === false && (envelope.totalCount ?? 0) > 0) {
      console.log(`  [${task.searchCity.name}] envelope hasMore=false at page ${pageNumber} — natural end of results`);
      legitEnd = true;
      break;
    }

    pageNumber += 1;
  }

  // Phase 2: fetch JDs for every unique job we collected this task, post-scroll.
  // Doing this AFTER list scroll (instead of interleaved per-page) keeps the list-
  // phase behavior cleanly separated from detail-tab spam so BOSS has less reason
  // to merge the two into a single "suspicious session" signal.
  // NOTE: we intentionally run phase 2 even when list scrolling was throttled —
  // the jobs already persisted in this run deserve their activity/description
  // captured in the same session. Throttle is re-raised at the end of the task.
  if (!skipJd && allCollectedJobs.length > 0) {
    const uniqueJobs = Array.from(
      new Map(allCollectedJobs.map((j) => [j.jobId, j])).values(),
    );
    // Re-visit jobs that have description but no activity label — we used to only
    // fetch description, now we also capture boss activity + publish labels.
    const pending = uniqueJobs.filter((j) => !db.hasFullJobDetail(j.jobId));
    console.log(
      `  [jd-phase] ${task.searchCity.name}: ${pending.length} of ${uniqueJobs.length} jobs need description`,
    );
    let jdOk = 0;
    let jdEmpty = 0;
    let jdFailed = 0;
    for (const [idx, job] of pending.entries()) {
      await humanSleep({
        minMs: 2_000,
        maxMs: 5_500,
        longPauseProbability: 0.06,
        longPauseMinMs: 20_000,
        longPauseMaxMs: 60_000,
        label: `  jd ${idx + 1}/${pending.length}`,
      });
      try {
        const result = await fetchJobDetailViaClick({
          listPage: page,
          browser: session.browser,
          jobId: job.jobId,
          jobUrl: job.jobUrl,
          timeoutMs: config.requestTimeoutMs,
        });
        if (result.status === 'ok') {
          db.updateJobDetail(job.jobId, {
            description: result.description,
            bossActiveLabel: result.bossActiveLabel,
            publishLabelDetail: result.publishLabelDetail,
          });
          jdOk += 1;
        } else if (result.status === 'empty') {
          // Still save activity labels if we got them, even without description.
          if (result.bossActiveLabel || result.publishLabelDetail) {
            db.updateJobDetail(job.jobId, {
              bossActiveLabel: result.bossActiveLabel,
              publishLabelDetail: result.publishLabelDetail,
            });
          }
          jdEmpty += 1;
        } else {
          jdFailed += 1;
          console.warn(`  [jd-error] ${clipText(job.jobName, 30)}: ${clipText(result.error?.message ?? 'unknown', 100)}`);
        }
      } catch (error) {
        jdFailed += 1;
        console.warn(`  [jd-error] ${clipText(job.jobName, 30)}: ${clipText(error.message, 100)}`);
      }
    }
    console.log(`  [jd-phase] ${task.searchCity.name}: ok=${jdOk} empty=${jdEmpty} failed=${jdFailed}`);
  }

  // Throttle during list pagination surfaces as a task failure AFTER phase 2 has
  // had a chance to enrich whatever we already collected. The caller marks the
  // task failed; resume will re-run list from page 1 next time.
  if (throttleReason) {
    throw new Error(throttleReason);
  }

  if (legitEnd) {
    db.completeTask(task.keyword, task.searchCity);
  } else {
    // Loop exited without a legit signal — shouldn't happen given the checks
    // above, but keep the task open for resume if it does.
    throw new Error(`${task.searchCity.name} list loop exited without legit end signal`);
  }
}

export async function crawlJobs({ db, config, keywords, cities, force = false, skipJd = false, skipFailed = false }) {
  const taskEntries = keywords.flatMap((keyword) =>
    cities.map((searchCity) => ({ keyword, searchCity })),
  );

  db.ensureTasks(taskEntries, { force });

  const session = await launchBossSession({ headless: config.headless });
  session.hasNavigated = false;
  const page = session.page;
  page.setDefaultTimeout(config.requestTimeoutMs);

  try {
    let firstTask = true;
    for (const task of taskEntries) {
      const taskState = db.getTaskState(task.keyword, task.searchCity.code);
      if (!force && taskState?.status === 'done') {
        console.log(`[skip] ${task.searchCity.name} / ${task.keyword} already finished`);
        continue;
      }
      if (!force && skipFailed && taskState?.status === 'failed') {
        console.log(`[skip] ${task.searchCity.name} / ${task.keyword} previously failed`);
        continue;
      }
      if (!firstTask) {
        await interCityPause();
      }
      firstTask = false;

      let lastError = null;
      for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
        try {
          await processTask({
            db,
            page,
            task,
            taskState: db.getTaskState(task.keyword, task.searchCity.code),
            config,
            session,
            skipJd,
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          db.failTask(task.keyword, task.searchCity, error);
          console.error(`[error] ${task.searchCity.name} / ${task.keyword}: ${clipText(error.message, 220)}`);
          if (attempt < config.retryCount) {
            console.log(`[retry] ${task.searchCity.name} / ${task.keyword} (${attempt + 1}/${config.retryCount})`);
            await sleepRandom(config.minDelayMs, config.maxDelayMs + 2000);
            continue;
          }
        }
      }

      if (lastError) {
        console.warn(`[failed] ${task.searchCity.name} / ${task.keyword}`);
      }
    }
  } finally {
    await session.close();
  }
}

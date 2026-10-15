import { launchBossSession } from './browser.mjs';
import { humanSleep } from './humanize.mjs';
import { clipText } from './utils.mjs';
import { fetchJobDetailViaClick } from './job-detail.mjs';

export function selectBalancedJobs(jobs, keywords, limit) {
  const buckets = new Map(keywords.map((keyword) => [keyword, []]));
  for (const job of jobs) {
    const matched = new Set((job.matched_keywords ?? '').split(','));
    const keyword = keywords.find((candidate) => matched.has(candidate));
    if (keyword) buckets.get(keyword).push(job);
  }
  const selected = [];
  const cityCounts = new Map();
  while (selected.length < limit && [...buckets.values()].some((bucket) => bucket.length > 0)) {
    for (const bucket of buckets.values()) {
      if (bucket.length > 0 && selected.length < limit) {
        bucket.sort((a, b) => (cityCounts.get(a.city_name) ?? 0) - (cityCounts.get(b.city_name) ?? 0)
          || b.last_observed_at_ms - a.last_observed_at_ms);
        const job = bucket.shift();
        selected.push(job);
        cityCounts.set(job.city_name, (cityCounts.get(job.city_name) ?? 0) + 1);
      }
    }
  }
  return selected;
}

export async function enrichJobs({
  db,
  limit = 30,
  minDelayMs = 8_000,
  maxDelayMs = 20_000,
  timeoutMs = 30_000,
  headless = false,
  reuseSession = null,
  keywords = null,
  cityCodes = null,
  retryCooldownMs = 6 * 60 * 60 * 1000,
  longPauseProbability = 0.05,
  longPauseMinMs = 20_000,
  longPauseMaxMs = 60_000,
  maxConsecutiveEmpty = 5,
} = {}) {
  const jobs = keywords
    ? selectBalancedJobs(
      db.listJobsMissingDescriptionForKeywords(keywords, Date.now() - retryCooldownMs, cityCodes),
      keywords,
      limit,
    )
    : db.listJobsMissingFullDetail(limit);
  console.log(`[enrich] ${jobs.length} ${keywords ? 'targeted jobs missing descriptions' : 'jobs missing description or activity'} (cap: ${limit})`);
  if (jobs.length === 0) {
    return { ok: 0, empty: 0, failed: 0 };
  }

  const session = reuseSession ?? await launchBossSession({ headless });
  if (!('hasNavigated' in session)) session.hasNavigated = false;
  const page = session.page;
  page.setDefaultTimeout(timeoutMs);

  let ok = 0;
  let empty = 0;
  let failed = 0;
  let consecutiveEmpty = 0;

  try {
    for (const [idx, job] of jobs.entries()) {
      await humanSleep({
        minMs: minDelayMs,
        maxMs: maxDelayMs,
        longPauseProbability,
        longPauseMinMs,
        longPauseMaxMs,
        label: `enrich ${idx + 1}/${jobs.length}`,
      });

      try {
        const result = await fetchJobDetailViaClick({
          listPage: page,
          browser: session.browser,
          jobId: job.job_id,
          jobUrl: job.job_url,
          timeoutMs,
        });
        if (result.status === 'blocked') {
          failed += 1;
          console.error(`[blocked] ${clipText(job.job_name, 40)}: ${result.error.message}; stopping run`);
          break;
        }
        consecutiveEmpty = result.status === 'empty' ? consecutiveEmpty + 1 : 0;
        if (result.status === 'ok') {
          db.updateJobDetail(job.job_id, {
            description: result.description,
            bossActiveLabel: result.bossActiveLabel,
            publishLabelDetail: result.publishLabelDetail,
          });
          ok += 1;
          db.recordJobDetailAttempt(job.job_id, 'ok');
          const activity = result.bossActiveLabel || result.publishLabelDetail || '-';
          console.log(`[ok] ${clipText(job.job_name, 40)} — ${result.description.length} chars, activity=${activity}`);
        } else if (result.status === 'empty') {
          if (result.bossActiveLabel || result.publishLabelDetail) {
            db.updateJobDetail(job.job_id, {
              bossActiveLabel: result.bossActiveLabel,
              publishLabelDetail: result.publishLabelDetail,
            });
          }
          empty += 1;
          db.recordJobDetailAttempt(job.job_id, 'empty');
          console.warn(`[empty] ${clipText(job.job_name, 40)} — no description, activity=${result.bossActiveLabel || result.publishLabelDetail || '-'}`);
          if (consecutiveEmpty >= maxConsecutiveEmpty) {
            failed += 1;
            console.error(`[blocked] ${consecutiveEmpty} consecutive empty descriptions; stopping run`);
            break;
          }
        } else {
          failed += 1;
          db.recordJobDetailAttempt(job.job_id, 'error', result.error?.message ?? 'unknown');
          console.error(`[error] ${clipText(job.job_name, 40)}: ${clipText(result.error?.message ?? 'unknown', 140)}`);
        }
      } catch (error) {
        failed += 1;
        db.recordJobDetailAttempt(job.job_id, 'error', error.message);
        console.error(`[error] ${clipText(job.job_name, 40)}: ${clipText(error.message, 140)}`);
      }
    }
  } finally {
    if (!reuseSession) {
      await session.close();
    }
  }

  return { ok, empty, failed };
}

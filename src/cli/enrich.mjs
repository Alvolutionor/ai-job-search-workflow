#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import { JobDatabase } from '../lib/db.mjs';
import { enrichJobs, selectBalancedJobs } from '../lib/enrich.mjs';
import { loadConfig, resolveTargetCities } from '../lib/config.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('limit', { type: 'number', default: 30, describe: 'Max jobs to enrich this run' })
    .option('min-delay', { type: 'number', default: 8000 })
    .option('max-delay', { type: 'number', default: 20000 })
    .option('timeout', { type: 'number', default: 30000 })
    .option('headless', { type: 'boolean', default: false })
    .option('config', { type: 'string', describe: 'Select jobs matched by keywords in this crawl config' })
    .option('retry-cooldown-hours', { type: 'number', default: 6 })
    .option('long-pause-probability', { type: 'number', default: 0.05 })
    .option('long-pause-min', { type: 'number', default: 20000 })
    .option('long-pause-max', { type: 'number', default: 60000 })
    .option('dry-run', { type: 'boolean', default: false })
    .strict()
    .parse();

  if (argv.limit < 1 || argv.minDelay < 0 || argv.maxDelay < argv.minDelay || argv.retryCooldownHours < 0
      || argv.longPauseProbability < 0 || argv.longPauseProbability > 1
      || argv.longPauseMin < 0 || argv.longPauseMax < argv.longPauseMin) {
    throw new Error('Invalid enrichment limit or delay');
  }

  const config = argv.config ? loadConfig(argv.config) : null;
  const keywords = config?.keywords ?? null;
  const cityCodes = config?.cityMode === 'custom' ? resolveTargetCities(config).map((city) => city.code) : null;

  ensureAppDirectories();
  const db = new JobDatabase();
  try {
    if (argv.dryRun) {
      if (!keywords) throw new Error('--dry-run requires --config');
      const candidates = db.listJobsMissingDescriptionForKeywords(
        keywords,
        Date.now() - argv.retryCooldownHours * 60 * 60 * 1000,
        cityCodes,
      );
      const selected = selectBalancedJobs(candidates, keywords, argv.limit);
      console.log(`Candidates missing descriptions: ${candidates.length}; selected: ${selected.length}`);
      for (const job of selected) {
        console.log(`${job.job_id} | ${job.city_name} | ${job.job_name} | ${job.matched_keywords}`);
      }
      return;
    }
    const result = await enrichJobs({
      db,
      limit: argv.limit,
      minDelayMs: argv.minDelay,
      maxDelayMs: argv.maxDelay,
      timeoutMs: argv.timeout,
      headless: argv.headless,
      keywords,
      cityCodes,
      retryCooldownMs: argv.retryCooldownHours * 60 * 60 * 1000,
      longPauseProbability: argv.longPauseProbability,
      longPauseMinMs: argv.longPauseMin,
      longPauseMaxMs: argv.longPauseMax,
    });
    console.log(`Done. ok=${result.ok} empty=${result.empty} failed=${result.failed}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});

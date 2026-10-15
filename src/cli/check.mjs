#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { allCities } from '../lib/cities.mjs';
import { loadConfig, resolveRunPlan } from '../lib/config.mjs';
import { loadCookieFile } from '../lib/cookies.mjs';
import { JobDatabase } from '../lib/db.mjs';
import { loadLocalStorageFile } from '../lib/local-storage.mjs';
import { ensureAppDirectories } from '../lib/paths.mjs';

function main() {
  ensureAppDirectories();
  const db = new JobDatabase();
  try {
    console.log(`Cities loaded: ${allCities.length}`);
    console.log(`Jobs in database: ${db.countJobs()}`);
    console.log(`Task rows: ${db.countTasks()}`);

    const configPath = path.resolve('./config/search.config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = loadConfig(configPath);
        const plan = resolveRunPlan(config);
        console.log(`Config OK: ${plan.keywords.length} keywords, ${plan.cities.length} cities`);
      } catch (error) {
        console.log(`Config pending: ${error.message}`);
      }
    }

    try {
      const cookies = loadCookieFile();
      console.log(`Cookie OK: ${cookies.length} entries`);
    } catch (error) {
      console.log(`Cookie pending: ${error.message}`);
    }

    try {
      const localStorageState = loadLocalStorageFile();
      console.log(`Local storage OK: ${Object.keys(localStorageState).length} entries`);
    } catch (error) {
      console.log(`Local storage pending: ${error.message}`);
    }
  } finally {
    db.close();
  }
}

main();

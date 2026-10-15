import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './paths.mjs';

export function readUserConfig(name) {
  const configured = path.join(configDir, `${name}.json`);
  const fallback = path.join(configDir, `${name}.example.json`);
  return JSON.parse(fs.readFileSync(fs.existsSync(configured) ? configured : fallback, 'utf8'));
}

export function loadMatchingConfig() {
  const config = readUserConfig('matching.config');
  for (const key of ['cities', 'keywords', 'excludedKeywords', 'preferredContactTitles', 'priorityTerms']) {
    if (!Array.isArray(config[key]) || config[key].some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error(`matching.config.json: ${key} must be an array of nonempty strings.`);
    }
  }
  if (typeof config.prioritizeContacts !== 'boolean') throw new Error('prioritizeContacts must be a boolean.');
  return config;
}

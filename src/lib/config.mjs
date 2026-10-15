import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { allCities, getCityByCode, getCityByName } from './cities.mjs';

const configSchema = z.object({
  keywords: z.array(z.string().trim().min(1)).min(1),
  cityMode: z.enum(['all', 'custom', 'nationwide']).default('all'),
  cityCodes: z.array(z.number().int().positive()).default([]),
  cityNames: z.array(z.string().trim().min(1)).default([]),
  excludedCityCodes: z.array(z.number().int().positive()).default([]),
  excludedCityNames: z.array(z.string().trim().min(1)).default([]),
  pageSize: z.number().int().min(1).max(50).default(30),
  minDelayMs: z.number().int().min(0).default(1800),
  maxDelayMs: z.number().int().min(0).default(3200),
  requestTimeoutMs: z.number().int().min(5000).default(45000),
  retryCount: z.number().int().min(0).max(5).default(2),
  headless: z.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.minDelayMs > value.maxDelayMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'minDelayMs cannot be greater than maxDelayMs',
      path: ['minDelayMs']
    });
  }
  if (value.cityMode === 'custom' && value.cityCodes.length === 0 && value.cityNames.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cityMode=custom requires cityCodes or cityNames',
      path: ['cityMode']
    });
  }
});

function uniqueCities(cities) {
  const seen = new Set();
  const result = [];
  for (const city of cities) {
    if (!city || seen.has(city.code)) {
      continue;
    }
    seen.add(city.code);
    result.push(city);
  }
  return result;
}

export function loadConfig(configFilePath) {
  const absolutePath = path.resolve(configFilePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const config = configSchema.parse(raw);

  if (config.keywords.some((keyword) => keyword.includes('请替换') || keyword.includes('YOUR_JOB_KEYWORD'))) {
    throw new Error(`Edit ${absolutePath} and replace the placeholder keyword before crawling.`);
  }

  return {
    ...config,
    configFilePath: absolutePath
  };
}

export function resolveTargetCities(config, { cityLimit = null } = {}) {
  let cities = [];
  if (config.cityMode === 'nationwide') {
    cities = [{ code: 100010000, name: '全国' }];
  } else if (config.cityMode === 'all') {
    cities = [...allCities];
  } else {
    cities = uniqueCities([
      ...config.cityCodes.map((code) => getCityByCode(code)),
      ...config.cityNames.map((name) => getCityByName(name))
    ]);
  }

  const excludedCodes = new Set(config.excludedCityCodes ?? []);
  const excludedNames = new Set((config.excludedCityNames ?? []).map((name) => name.toLowerCase()));
  const filtered = cities.filter(
    (city) => city && !excludedCodes.has(city.code) && !excludedNames.has(city.name.toLowerCase()),
  );

  if (filtered.length === 0) {
    throw new Error('No target cities remain after applying cityMode and exclusions.');
  }

  if (cityLimit && cityLimit > 0) {
    return filtered.slice(0, cityLimit);
  }
  return filtered;
}

export function resolveRunPlan(config, { cityLimit = null, keywordLimit = null } = {}) {
  const keywords = keywordLimit && keywordLimit > 0
    ? config.keywords.slice(0, keywordLimit)
    : [...config.keywords];

  if (keywords.length === 0) {
    throw new Error('No keywords left after applying keywordLimit.');
  }

  return {
    keywords,
    cities: resolveTargetCities(config, { cityLimit })
  };
}

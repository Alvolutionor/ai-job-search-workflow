import fs from 'node:fs';
import path from 'node:path';

import { minReviewableDescriptionLength } from '../../config/robotics-review-policy.mjs';
import { roboticsSkillRules } from '../../config/robotics-skill-rules.mjs';
import { loadConfig, resolveTargetCities } from './config.mjs';
import { configDir, dataDir } from './paths.mjs';

export const liveScopeConfigPath = path.resolve(process.env.JOBTRENDING_RESEARCH_CONFIG || path.join(configDir, 'research.config.json'));
export const liveVerdictPath = path.join(dataDir, 'research', 'robotics-review-verdicts-live.json');
const legacyVerdictPath = path.join(dataDir, 'research', 'robotics-review-verdicts.json');

export function excerptFor(description, groups) {
  const lines = description.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const matching = lines
    .filter((window) => groups.every((pattern) => pattern.test(window)))
    .sort((left, right) => left.length - right.length);
  if (matching.length === 0) {
    return null;
  }
  const window = matching[0];
  const first = groups[0].exec(window);
  const start = Math.max(0, (first?.index ?? 0) - 45);
  const excerpt = window.slice(start, start + 180).trim();
  return `${start > 0 ? '…' : ''}${excerpt}${start + 180 < window.length ? '…' : ''}`;
}

function readVerdicts(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
}

export function loadVerdictsById() {
  return new Map([...readVerdicts(legacyVerdictPath), ...readVerdicts(liveVerdictPath)].map((row) => [row.id, row]));
}

export function listScopedJobs(sqlite) {
  const config = loadConfig(liveScopeConfigPath);
  const cityCodes = resolveTargetCities(config).map((city) => city.code);
  return sqlite.prepare(`
    SELECT j.job_id AS id, j.job_name AS title, j.company_name AS company, j.city_name AS city,
           j.job_url AS url, j.description
    FROM jobs j
    WHERE j.job_id IN (
      SELECT job_id FROM job_hits
      WHERE keyword IN (${config.keywords.map(() => '?').join(', ')})
        AND search_city_code IN (${cityCodes.map(() => '?').join(', ')})
    )
  `).all(...config.keywords, ...cityCodes);
}

export function computeLiveSkillCounts(sqlite) {
  const scoped = listScopedJobs(sqlite);
  const reviewable = scoped.filter((job) => job.description?.length >= minReviewableDescriptionLength);
  const verdicts = loadVerdictsById();
  const reviewed = reviewable.filter((job) => verdicts.has(job.id));
  const jobs = reviewed.filter((job) => verdicts.get(job.id).relevant);

  const skills = roboticsSkillRules.map((rule) => {
    const sources = jobs.flatMap((job) => {
      const excerpt = excerptFor(job.description, rule.groups);
      return excerpt ? [{ id: job.id, title: job.title, company: job.company, city: job.city, url: job.url, excerpt }] : [];
    });
    return { id: rule.id, name: rule.name, check: rule.check, count: sources.length, sources };
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'BOSS Zhipin',
    scope: (() => { const config=loadConfig(liveScopeConfigPath); return config.cityMode==='nationwide' ? 'Nationwide' : resolveTargetCities(config).map(city=>city.name).join(', '); })(),
    candidateJobs: scoped.length,
    capturedDescriptionJobs: scoped.filter((job) => job.description).length,
    reviewableDescriptionJobs: reviewable.length,
    reviewedDescriptionJobs: reviewed.length,
    pendingReviewJobs: reviewable.length - reviewed.length,
    excludedJobs: reviewed.length - jobs.length,
    reviewedRelevantJobs: jobs.length,
    skills,
  };
}

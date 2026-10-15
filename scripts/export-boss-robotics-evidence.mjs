import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { liveScopeConfigPath } from '../src/lib/robotics-skills.mjs';
import { minReviewableDescriptionLength } from '../config/robotics-review-policy.mjs';

const searchConfigPath = path.resolve(process.argv[2] ?? liveScopeConfigPath);
const outputPath = path.resolve(process.argv[3] ?? './data/research/boss-robotics-evidence.json');
const asOfDate = process.argv[4] ?? new Date().toISOString().slice(0, 10);
const asOf = new Date(`${asOfDate}T23:59:59.999Z`);
const since = new Date(`${asOfDate}T00:00:00.000Z`);
since.setUTCMonth(since.getUTCMonth() - 6);

if (Number.isNaN(asOf.getTime()) || Number.isNaN(since.getTime())) {
  throw new Error('Invalid as-of date');
}

const { keywords } = JSON.parse(fs.readFileSync(searchConfigPath, 'utf8'));
if (!Array.isArray(keywords) || keywords.length === 0) {
  throw new Error('The search configuration needs at least one keyword');
}

const db = new Database(path.resolve('./data/jobs.sqlite'), { readonly: true });
const placeholders = keywords.map(() => '?').join(', ');
const rows = db.prepare(`
  SELECT j.job_id, j.job_name, j.company_name, j.city_name, j.description,
         j.skills_json, j.job_url, j.published_at_ms, j.published_label,
         j.published_source, j.first_seen_at_ms,
         GROUP_CONCAT(DISTINCT h.keyword) AS matched_keywords,
         MAX(h.collected_at_ms) AS last_observed_at_ms
  FROM jobs j
  JOIN job_hits h ON h.job_id = j.job_id
  WHERE h.keyword IN (${placeholders})
  GROUP BY j.job_id
`).all(...keywords);
const taskRows = db.prepare(`
  SELECT keyword, search_city_name, status, pages_completed, jobs_seen, finished_at_ms, updated_at_ms
  FROM crawl_tasks
  WHERE keyword IN (${placeholders})
`).all(...keywords);
db.close();

const currentTasks = taskRows.filter((task) => (task.finished_at_ms ?? task.updated_at_ms) >= since.getTime()
  && (task.finished_at_ms ?? task.updated_at_ms) <= asOf.getTime());
const completedTasks = currentTasks.filter((task) => task.status === 'done');
const failedTasks = currentTasks.filter((task) => task.status === 'failed');

const jobs = rows
  .filter((row) => row.last_observed_at_ms >= since.getTime() && row.last_observed_at_ms <= asOf.getTime())
  .filter((row) => row.published_at_ms === null || (row.published_at_ms >= since.getTime() && row.published_at_ms <= asOf.getTime()))
  .map((row) => ({
    jobId: row.job_id,
    title: row.job_name,
    company: row.company_name,
    city: row.city_name,
    description: row.description,
    skills: JSON.parse(row.skills_json ?? '[]'),
    url: row.job_url,
    matchedKeywords: row.matched_keywords?.split(',') ?? [],
    publishedAt: row.published_at_ms ? new Date(row.published_at_ms).toISOString() : null,
    publishedLabel: row.published_label,
    publishedSource: row.published_source,
    firstSeenAt: new Date(row.first_seen_at_ms).toISOString(),
    lastObservedAt: new Date(row.last_observed_at_ms).toISOString(),
    dateBasis: row.published_at_ms ? 'published' : 'observed'
  }))
  .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt));

const evidence = {
  source: 'BOSS Zhipin local collector',
  asOf: asOfDate,
  since: since.toISOString().slice(0, 10),
  dateRule: 'Published dates are used only when present; otherwise lastObservedAt proves only that the listing was seen during the window.',
  keywords,
  completedSearchTasks: completedTasks.length,
  failedSearchTasks: failedTasks.length,
  completedSearchCities: [...new Set(completedTasks.map((task) => task.search_city_name))].sort(),
  failedSearchCities: [...new Set(failedTasks.map((task) => task.search_city_name))].sort(),
  completedSearchKeywords: [...new Set(completedTasks.map((task) => task.keyword))].sort(),
  totalJobs: jobs.length,
  jobsWithDescription: jobs.filter((job) => job.description).length,
  jobsWithPublishedDate: jobs.filter((job) => job.dateBasis === 'published').length,
  candidateJobs: jobs.length,
  capturedDescriptionJobs: jobs.filter((job) => job.description).length,
  reviewableDescriptionJobs: jobs.filter((job) => job.description?.length >= minReviewableDescriptionLength).length,
  descriptionCoverage: jobs.length > 0 ? jobs.filter((job) => job.description).length / jobs.length : 0,
  evidenceRule: `A list hit is a candidate. Descriptions under ${minReviewableDescriptionLength} characters need special review; no description alone proves a skill claim without checking its text.`,
  jobs
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Exported ${evidence.candidateJobs} BOSS candidates, ${evidence.capturedDescriptionJobs} with captured descriptions (${(evidence.descriptionCoverage * 100).toFixed(1)}%), ${evidence.reviewableDescriptionJobs} with at least ${minReviewableDescriptionLength} characters, ${evidence.jobsWithPublishedDate} with verified publication dates`);
console.log(outputPath);

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = path.resolve('.');
const databasePath = path.join(root, 'data', 'jobs.sqlite');
const configPath = path.join(root, 'config', 'robotics-shanghai-shenzhen.config.json');
const verdictPath = path.join(root, 'data', 'research', 'robotics-review-verdicts.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const keywords = [...new Set(config.keywords)];
const placeholders = keywords.map(() => '?').join(', ');
const rejectedIds = JSON.parse(fs.readFileSync(verdictPath, 'utf8'))
  .filter((verdict) => !verdict.relevant)
  .map((verdict) => verdict.id);
const rejectedPlaceholders = rejectedIds.map(() => '?').join(', ');
const apply = process.argv.includes('--apply');
const db = new Database(databasePath);

try {
  const before = {
    jobs: db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,
    hits: db.prepare('SELECT COUNT(*) AS count FROM job_hits').get().count,
    tasks: db.prepare('SELECT COUNT(*) AS count FROM crawl_tasks').get().count,
  };
  const matchingJobIds = db.prepare(`
    SELECT DISTINCT job_id
    FROM job_hits
    WHERE keyword IN (${placeholders})
  `).all(...keywords).map((row) => row.job_id);
  const rejectedInDatabase = rejectedIds.length === 0
    ? []
    : db.prepare(`
      SELECT job_id
      FROM jobs
      WHERE job_id IN (${rejectedPlaceholders})
    `).all(...rejectedIds).map((row) => row.job_id);
  const matchingSet = new Set(matchingJobIds);
  const rejectedSet = new Set(rejectedInDatabase);
  const keptJobIds = [...matchingSet].filter((id) => !rejectedSet.has(id));
  const jobsToRemove = before.jobs - keptJobIds.length;
  const hitsToKeep = keptJobIds.length === 0
    ? 0
    : db.prepare(`
      SELECT COUNT(*) AS count
      FROM job_hits
      WHERE keyword IN (${placeholders})
        AND job_id IN (${keptJobIds.map(() => '?').join(', ')})
    `).get(...keywords, ...keptJobIds).count;

  let backupPath = null;
  if (apply) {
    const archiveDirectory = path.join(root, 'archive');
    fs.mkdirSync(archiveDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    backupPath = path.join(archiveDirectory, `jobs-before-robotics-cleanup-${timestamp}.sqlite`);
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    db.transaction(() => {
      db.prepare(`DELETE FROM job_hits WHERE keyword NOT IN (${placeholders})`).run(...keywords);
      if (rejectedInDatabase.length > 0) {
        db.prepare(`
          DELETE FROM job_hits
          WHERE job_id IN (${rejectedPlaceholders})
        `).run(...rejectedInDatabase);
      }
      db.prepare(`
        DELETE FROM jobs
        WHERE job_id NOT IN (SELECT DISTINCT job_id FROM job_hits)
      `).run();
      db.prepare(`
        DELETE FROM job_detail_attempts
        WHERE job_id NOT IN (SELECT job_id FROM jobs)
      `).run();
      db.prepare(`DELETE FROM crawl_tasks WHERE keyword NOT IN (${placeholders})`).run(...keywords);
    })();
  }

  const after = apply ? {
    jobs: db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,
    hits: db.prepare('SELECT COUNT(*) AS count FROM job_hits').get().count,
    tasks: db.prepare('SELECT COUNT(*) AS count FROM crawl_tasks').get().count,
  } : null;
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    keywords,
    targetCities: config.cityNames,
    removedJobs: jobsToRemove,
    retainedJobs: keptJobIds.length,
    retainedHits: hitsToKeep,
    rejectedReviewedJobs: rejectedInDatabase.length,
    before,
    after,
    backupPath,
  }, null, 2));
} finally {
  db.close();
}

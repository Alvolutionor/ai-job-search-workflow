import Database from 'better-sqlite3';

import { dbPath } from './paths.mjs';
import { escapeLike } from './utils.mjs';

function safeJsonParse(value, fallback = []) {
  try {
    return JSON.parse(value ?? '[]');
  } catch {
    return fallback;
  }
}

export class JobDatabase {
  constructor(filePath = dbPath) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.init();
    this.prepareStatements();
  }

  // Idempotent ADD COLUMN migrations. SQLite has no `ADD COLUMN IF NOT EXISTS`,
  // so we check PRAGMA table_info first. Safe to call on an in-use DB; existing
  // rows get NULL for the new column.
  migrate() {
    // `jobs` table may not exist yet on first run; init() creates it just after.
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'",
    ).get();
    if (!tableExists) return;
    const cols = this.db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
    if (!cols.includes('boss_active_label')) {
      this.db.exec('ALTER TABLE jobs ADD COLUMN boss_active_label TEXT');
    }
    if (!cols.includes('publish_label_detail')) {
      this.db.exec('ALTER TABLE jobs ADD COLUMN publish_label_detail TEXT');
    }
  }

  init() {
    this.migrate();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        job_name TEXT NOT NULL,
        position_name TEXT,
        company_name TEXT,
        company_id TEXT,
        boss_id TEXT,
        boss_name TEXT,
        boss_title TEXT,
        city_name TEXT,
        district_name TEXT,
        address TEXT,
        experience_name TEXT,
        degree_name TEXT,
        industry_name TEXT,
        brand_stage_name TEXT,
        brand_scale_name TEXT,
        job_status_desc TEXT,
        active_time_desc TEXT,
        salary_desc TEXT,
        salary_min_k INTEGER,
        salary_max_k INTEGER,
        salary_months INTEGER,
        description TEXT,
        skills_json TEXT NOT NULL DEFAULT '[]',
        welfare_json TEXT NOT NULL DEFAULT '[]',
        published_at_ms INTEGER,
        published_label TEXT,
        published_source TEXT,
        source_page INTEGER,
        job_url TEXT,
        first_seen_at_ms INTEGER NOT NULL,
        last_seen_at_ms INTEGER NOT NULL,
        raw_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_hits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        search_city_code INTEGER NOT NULL,
        search_city_name TEXT NOT NULL,
        source_page INTEGER,
        collected_at_ms INTEGER NOT NULL,
        UNIQUE(job_id, keyword, search_city_code)
      );

      CREATE TABLE IF NOT EXISTS crawl_tasks (
        keyword TEXT NOT NULL,
        search_city_code INTEGER NOT NULL,
        search_city_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        page_cursor INTEGER NOT NULL DEFAULT 0,
        pages_completed INTEGER NOT NULL DEFAULT 0,
        jobs_seen INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        started_at_ms INTEGER,
        finished_at_ms INTEGER,
        updated_at_ms INTEGER NOT NULL,
        last_error TEXT,
        PRIMARY KEY(keyword, search_city_code)
      );

      CREATE TABLE IF NOT EXISTS job_detail_attempts (
        job_id TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_status TEXT NOT NULL,
        last_error TEXT,
        last_attempt_at_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_company_name ON jobs (company_name);
      CREATE INDEX IF NOT EXISTS idx_jobs_city_name ON jobs (city_name);
      CREATE INDEX IF NOT EXISTS idx_jobs_experience_name ON jobs (experience_name);
      CREATE INDEX IF NOT EXISTS idx_jobs_published_at_ms ON jobs (published_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_last_seen_at_ms ON jobs (last_seen_at_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_job_hits_keyword ON job_hits (keyword);
      CREATE INDEX IF NOT EXISTS idx_job_hits_search_city ON job_hits (search_city_code);
      CREATE INDEX IF NOT EXISTS idx_crawl_tasks_status ON crawl_tasks (status);
    `);
  }

  prepareStatements() {
    this.statements = {
      upsertJob: this.db.prepare(`
        INSERT INTO jobs (
          job_id,
          job_name,
          position_name,
          company_name,
          company_id,
          boss_id,
          boss_name,
          boss_title,
          city_name,
          district_name,
          address,
          experience_name,
          degree_name,
          industry_name,
          brand_stage_name,
          brand_scale_name,
          job_status_desc,
          active_time_desc,
          salary_desc,
          salary_min_k,
          salary_max_k,
          salary_months,
          description,
          skills_json,
          welfare_json,
          published_at_ms,
          published_label,
          published_source,
          source_page,
          job_url,
          first_seen_at_ms,
          last_seen_at_ms,
          raw_json
        ) VALUES (
          @jobId,
          @jobName,
          @positionName,
          @companyName,
          @companyId,
          @bossId,
          @bossName,
          @bossTitle,
          @cityName,
          @districtName,
          @address,
          @experienceName,
          @degreeName,
          @industryName,
          @brandStageName,
          @brandScaleName,
          @jobStatusDesc,
          @activeTimeDesc,
          @salaryDesc,
          @salaryMinK,
          @salaryMaxK,
          @salaryMonths,
          @description,
          @skillsJson,
          @welfareJson,
          @publishedAtMs,
          @publishedLabel,
          @publishedSource,
          @sourcePage,
          @jobUrl,
          @collectedAtMs,
          @collectedAtMs,
          @rawJson
        )
        ON CONFLICT(job_id) DO UPDATE SET
          job_name = excluded.job_name,
          position_name = COALESCE(excluded.position_name, jobs.position_name),
          company_name = COALESCE(excluded.company_name, jobs.company_name),
          company_id = COALESCE(excluded.company_id, jobs.company_id),
          boss_id = COALESCE(excluded.boss_id, jobs.boss_id),
          boss_name = COALESCE(excluded.boss_name, jobs.boss_name),
          boss_title = COALESCE(excluded.boss_title, jobs.boss_title),
          city_name = COALESCE(excluded.city_name, jobs.city_name),
          district_name = COALESCE(excluded.district_name, jobs.district_name),
          address = COALESCE(excluded.address, jobs.address),
          experience_name = COALESCE(excluded.experience_name, jobs.experience_name),
          degree_name = COALESCE(excluded.degree_name, jobs.degree_name),
          industry_name = COALESCE(excluded.industry_name, jobs.industry_name),
          brand_stage_name = COALESCE(excluded.brand_stage_name, jobs.brand_stage_name),
          brand_scale_name = COALESCE(excluded.brand_scale_name, jobs.brand_scale_name),
          job_status_desc = COALESCE(excluded.job_status_desc, jobs.job_status_desc),
          active_time_desc = COALESCE(excluded.active_time_desc, jobs.active_time_desc),
          salary_desc = COALESCE(excluded.salary_desc, jobs.salary_desc),
          salary_min_k = COALESCE(excluded.salary_min_k, jobs.salary_min_k),
          salary_max_k = COALESCE(excluded.salary_max_k, jobs.salary_max_k),
          salary_months = COALESCE(excluded.salary_months, jobs.salary_months),
          description = COALESCE(excluded.description, jobs.description),
          skills_json = CASE
            WHEN excluded.skills_json != '[]' THEN excluded.skills_json
            ELSE jobs.skills_json
          END,
          welfare_json = CASE
            WHEN excluded.welfare_json != '[]' THEN excluded.welfare_json
            ELSE jobs.welfare_json
          END,
          published_at_ms = COALESCE(excluded.published_at_ms, jobs.published_at_ms),
          published_label = COALESCE(excluded.published_label, jobs.published_label),
          published_source = COALESCE(excluded.published_source, jobs.published_source),
          source_page = COALESCE(excluded.source_page, jobs.source_page),
          job_url = COALESCE(excluded.job_url, jobs.job_url),
          last_seen_at_ms = excluded.last_seen_at_ms,
          raw_json = excluded.raw_json
      `),
      upsertHit: this.db.prepare(`
        INSERT INTO job_hits (
          job_id,
          keyword,
          search_city_code,
          search_city_name,
          source_page,
          collected_at_ms
        ) VALUES (
          @jobId,
          @keyword,
          @searchCityCode,
          @searchCityName,
          @sourcePage,
          @collectedAtMs
        )
        ON CONFLICT(job_id, keyword, search_city_code) DO UPDATE SET
          source_page = excluded.source_page,
          collected_at_ms = excluded.collected_at_ms
      `),
      ensureTask: this.db.prepare(`
        INSERT INTO crawl_tasks (
          keyword,
          search_city_code,
          search_city_name,
          status,
          updated_at_ms
        ) VALUES (
          @keyword,
          @searchCityCode,
          @searchCityName,
          'pending',
          @updatedAtMs
        )
        ON CONFLICT(keyword, search_city_code) DO NOTHING
      `),
      getTask: this.db.prepare(`
        SELECT *
        FROM crawl_tasks
        WHERE keyword = ? AND search_city_code = ?
      `),
      resetTask: this.db.prepare(`
        UPDATE crawl_tasks
        SET status = 'pending',
            page_cursor = 0,
            pages_completed = 0,
            jobs_seen = 0,
            started_at_ms = NULL,
            finished_at_ms = NULL,
            updated_at_ms = ?,
            last_error = NULL
        WHERE keyword = ? AND search_city_code = ?
      `),
      markTaskRunning: this.db.prepare(`
        UPDATE crawl_tasks
        SET status = 'running',
            attempts = attempts + 1,
            started_at_ms = ?,
            updated_at_ms = ?,
            last_error = NULL
        WHERE keyword = ? AND search_city_code = ?
      `),
      updateTaskProgress: this.db.prepare(`
        UPDATE crawl_tasks
        SET page_cursor = ?,
            pages_completed = ?,
            jobs_seen = ?,
            updated_at_ms = ?
        WHERE keyword = ? AND search_city_code = ?
      `),
      markTaskDone: this.db.prepare(`
        UPDATE crawl_tasks
        SET status = 'done',
            finished_at_ms = ?,
            updated_at_ms = ?,
            last_error = NULL
        WHERE keyword = ? AND search_city_code = ?
      `),
      markTaskFailed: this.db.prepare(`
        UPDATE crawl_tasks
        SET status = 'failed',
            finished_at_ms = ?,
            updated_at_ms = ?,
            last_error = ?
        WHERE keyword = ? AND search_city_code = ?
      `)
    };
  }

  close() {
    this.db.close();
  }

  countJobs() {
    return this.db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count;
  }

  countTasks() {
    return this.db.prepare('SELECT COUNT(*) AS count FROM crawl_tasks').get().count;
  }

  ensureTasks(taskEntries, { force = false } = {}) {
    const nowMs = Date.now();
    const transaction = this.db.transaction((entries) => {
      for (const entry of entries) {
        this.statements.ensureTask.run({
          keyword: entry.keyword,
          searchCityCode: entry.searchCity.code,
          searchCityName: entry.searchCity.name,
          updatedAtMs: nowMs
        });
        if (force) {
          this.statements.resetTask.run(nowMs, entry.keyword, entry.searchCity.code);
        }
      }
    });
    transaction(taskEntries);
  }

  getTaskState(keyword, searchCityCode) {
    return this.statements.getTask.get(keyword, searchCityCode) ?? null;
  }

  beginTask(keyword, searchCity) {
    const nowMs = Date.now();
    this.statements.markTaskRunning.run(nowMs, nowMs, keyword, searchCity.code);
  }

  updateTaskProgress(keyword, searchCity, { pageCursor, pagesCompleted, jobsSeen }) {
    this.statements.updateTaskProgress.run(
      pageCursor,
      pagesCompleted,
      jobsSeen,
      Date.now(),
      keyword,
      searchCity.code,
    );
  }

  completeTask(keyword, searchCity) {
    const nowMs = Date.now();
    this.statements.markTaskDone.run(nowMs, nowMs, keyword, searchCity.code);
  }

  failTask(keyword, searchCity, error) {
    const nowMs = Date.now();
    this.statements.markTaskFailed.run(
      nowMs,
      nowMs,
      String(error?.message ?? error ?? 'Unknown error'),
      keyword,
      searchCity.code,
    );
  }

  saveNormalizedJob(job) {
    const transaction = this.db.transaction((normalizedJob) => {
      this.statements.upsertJob.run({
        ...normalizedJob,
        skillsJson: JSON.stringify(normalizedJob.skills ?? []),
        welfareJson: JSON.stringify(normalizedJob.welfare ?? [])
      });
      this.statements.upsertHit.run(normalizedJob);
    });
    transaction(job);
  }

  hasJobDescription(jobId) {
    const row = this.db.prepare(`
      SELECT description FROM jobs WHERE job_id = ?
    `).get(jobId);
    return Boolean(row && row.description && row.description.length > 0);
  }

  // Return true only if ALL detail-page-derived fields are already stored, so a
  // re-scan can skip this job entirely. A job with description but no activity
  // label gets re-visited to pick up the activity text.
  hasFullJobDetail(jobId) {
    const row = this.db.prepare(`
      SELECT description, boss_active_label, publish_label_detail
      FROM jobs WHERE job_id = ?
    `).get(jobId);
    if (!row) return false;
    if (!row.description || row.description.length === 0) return false;
    // Either an activity or publish label counts as "activity captured".
    return Boolean(
      (row.boss_active_label && row.boss_active_label.length > 0) ||
      (row.publish_label_detail && row.publish_label_detail.length > 0),
    );
  }

  updateJobDetail(jobId, { description, bossActiveLabel, publishLabelDetail } = {}) {
    const sets = [];
    const params = [];
    if (description !== undefined) {
      sets.push('description = ?');
      params.push(description);
    }
    if (bossActiveLabel !== undefined) {
      sets.push('boss_active_label = ?');
      params.push(bossActiveLabel);
    }
    if (publishLabelDetail !== undefined) {
      sets.push('publish_label_detail = ?');
      params.push(publishLabelDetail);
    }
    if (sets.length === 0) return 0;
    sets.push('last_seen_at_ms = ?');
    params.push(Date.now());
    params.push(jobId);
    const sql = `UPDATE jobs SET ${sets.join(', ')} WHERE job_id = ?`;
    return this.db.prepare(sql).run(...params).changes;
  }

  listJobsMissingDescription(limit = 50) {
    return this.db.prepare(`
      SELECT job_id, job_name, job_url, company_name, city_name
      FROM jobs
      WHERE description IS NULL OR description = ''
      ORDER BY last_seen_at_ms DESC
      LIMIT ?
    `).all(limit);
  }

  listJobsMissingFullDetail(limit = 50) {
    return this.db.prepare(`
      SELECT job_id, job_name, job_url, company_name, city_name
      FROM jobs
      WHERE description IS NULL OR description = ''
         OR (
              (boss_active_label IS NULL OR boss_active_label = '')
              AND (publish_label_detail IS NULL OR publish_label_detail = '')
            )
      ORDER BY last_seen_at_ms DESC
      LIMIT ?
    `).all(limit);
  }

  listJobsMissingDescriptionForKeywords(keywords, retryAfterMs = 0, cityCodes = null) {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];
    const placeholders = keywords.map(() => '?').join(', ');
    const cityFilter = cityCodes?.length ? `AND h.search_city_code IN (${cityCodes.map(() => '?').join(', ')})` : '';
    return this.db.prepare(`
      SELECT j.job_id, j.job_name, j.job_url, j.company_name, j.city_name,
             GROUP_CONCAT(DISTINCT h.keyword) AS matched_keywords,
             MAX(h.collected_at_ms) AS last_observed_at_ms
      FROM jobs j
      JOIN job_hits h ON h.job_id = j.job_id
      LEFT JOIN job_detail_attempts a ON a.job_id = j.job_id
      WHERE h.keyword IN (${placeholders})
        ${cityFilter}
        AND (j.description IS NULL OR j.description = '')
        AND (a.last_attempt_at_ms IS NULL OR a.last_attempt_at_ms < ?)
      GROUP BY j.job_id
      ORDER BY last_observed_at_ms DESC
    `).all(...keywords, ...(cityCodes?.length ? cityCodes : []), retryAfterMs);
  }

  recordJobDetailAttempt(jobId, status, error = null) {
    this.db.prepare(`
      INSERT INTO job_detail_attempts (job_id, attempts, last_status, last_error, last_attempt_at_ms)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        attempts = attempts + 1,
        last_status = excluded.last_status,
        last_error = excluded.last_error,
        last_attempt_at_ms = excluded.last_attempt_at_ms
    `).run(jobId, status, error, Date.now());
  }

  updateJobDescription(jobId, description) {
    const result = this.db.prepare(`
      UPDATE jobs
      SET description = ?, last_seen_at_ms = ?
      WHERE job_id = ?
    `).run(description, Date.now(), jobId);
    return result.changes;
  }

  saveNormalizedJobs(jobs) {
    const transaction = this.db.transaction((items) => {
      for (const normalizedJob of items) {
        this.statements.upsertJob.run({
          ...normalizedJob,
          skillsJson: JSON.stringify(normalizedJob.skills ?? []),
          welfareJson: JSON.stringify(normalizedJob.welfare ?? [])
        });
        this.statements.upsertHit.run(normalizedJob);
      }
    });
    transaction(jobs);
  }

  getDashboardStats() {
    const jobStats = this.db.prepare(`
      SELECT
        COUNT(*) AS total_jobs,
        COUNT(DISTINCT company_name) AS company_count,
        COUNT(DISTINCT city_name) AS city_count,
        SUM(CASE WHEN published_at_ms IS NOT NULL THEN 1 ELSE 0 END) AS publish_coverage_count,
        MAX(last_seen_at_ms) AS latest_seen_at_ms,
        MAX(published_at_ms) AS latest_published_at_ms
      FROM jobs
    `).get();

    const hitStats = this.db.prepare(`
      SELECT
        COUNT(*) AS total_hits,
        COUNT(DISTINCT keyword) AS keyword_count,
        COUNT(DISTINCT search_city_code) AS search_city_count
      FROM job_hits
    `).get();

    return {
      totalJobs: jobStats.total_jobs ?? 0,
      totalHits: hitStats.total_hits ?? 0,
      companyCount: jobStats.company_count ?? 0,
      cityCount: jobStats.city_count ?? 0,
      searchCityCount: hitStats.search_city_count ?? 0,
      keywordCount: hitStats.keyword_count ?? 0,
      publishCoverageCount: jobStats.publish_coverage_count ?? 0,
      latestSeenAtMs: jobStats.latest_seen_at_ms ?? null,
      latestPublishedAtMs: jobStats.latest_published_at_ms ?? null
    };
  }

  getTaskSummary() {
    const rows = this.db.prepare(`
      SELECT status, COUNT(*) AS total
      FROM crawl_tasks
      GROUP BY status
    `).all();

    const summary = {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0
    };
    for (const row of rows) {
      summary[row.status] = row.total;
    }
    summary.total = summary.pending + summary.running + summary.done + summary.failed;
    return summary;
  }

  listRecentFailures(limit = 6) {
    return this.db.prepare(`
      SELECT keyword, search_city_name, last_error, updated_at_ms
      FROM crawl_tasks
      WHERE status = 'failed'
      ORDER BY updated_at_ms DESC
      LIMIT ?
    `).all(limit);
  }

  listKeywords() {
    return this.db.prepare(`
      SELECT DISTINCT keyword
      FROM job_hits
      ORDER BY keyword
    `).all().map((row) => row.keyword);
  }

  listExperiences() {
    return this.db.prepare(`
      SELECT DISTINCT experience_name
      FROM jobs
      WHERE experience_name IS NOT NULL AND experience_name != ''
      ORDER BY experience_name
    `).all().map((row) => row.experience_name);
  }

  buildJobQuery(filters) {
    const whereClauses = [];
    const params = [];

    if (filters.text) {
      const pattern = `%${escapeLike(filters.text)}%`;
      whereClauses.push(`(
        COALESCE(j.job_name, '') LIKE ? ESCAPE '\\'
        OR COALESCE(j.company_name, '') LIKE ? ESCAPE '\\'
        OR COALESCE(j.description, '') LIKE ? ESCAPE '\\'
        OR COALESCE(j.skills_json, '') LIKE ? ESCAPE '\\'
      )`);
      params.push(pattern, pattern, pattern, pattern);
    }

    if (filters.keyword) {
      whereClauses.push(`
        EXISTS (
          SELECT 1
          FROM job_hits h
          WHERE h.job_id = j.job_id
            AND h.keyword = ?
        )
      `);
      params.push(filters.keyword);
    }

    if (filters.company) {
      whereClauses.push(`COALESCE(j.company_name, '') LIKE ? ESCAPE '\\'`);
      params.push(`%${escapeLike(filters.company)}%`);
    }

    if (filters.city) {
      const pattern = `%${escapeLike(filters.city)}%`;
      whereClauses.push(`(
        COALESCE(j.city_name, '') LIKE ? ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM job_hits h
          WHERE h.job_id = j.job_id
            AND h.search_city_name LIKE ? ESCAPE '\\'
        )
      )`);
      params.push(pattern, pattern);
    }

    if (filters.experience) {
      whereClauses.push(`j.experience_name = ?`);
      params.push(filters.experience);
    }

    if (filters.days > 0) {
      const thresholdMs = Date.now() - filters.days * 24 * 60 * 60 * 1000;
      if (filters.includeUnknownPublish) {
        whereClauses.push(`(j.published_at_ms IS NULL OR j.published_at_ms >= ?)`);
      } else {
        whereClauses.push(`j.published_at_ms IS NOT NULL AND j.published_at_ms >= ?`);
      }
      params.push(thresholdMs);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    return { whereSql, params };
  }

  hydrateRows(rows) {
    return rows.map((row) => ({
      ...row,
      matched_keywords: row.matched_keywords ? row.matched_keywords.split(',') : [],
      matched_search_cities: row.matched_search_cities ? row.matched_search_cities.split(',') : [],
      skills: safeJsonParse(row.skills_json),
      welfare: safeJsonParse(row.welfare_json)
    }));
  }

  searchJobs(filters) {
    const safeFilters = {
      text: filters.text?.trim() ?? '',
      keyword: filters.keyword?.trim() ?? '',
      company: filters.company?.trim() ?? '',
      city: filters.city?.trim() ?? '',
      experience: filters.experience?.trim() ?? '',
      days: Math.max(Number(filters.days ?? 0), 0),
      includeUnknownPublish: Boolean(filters.includeUnknownPublish),
      page: Math.max(Number(filters.page ?? 1), 1),
      limit: Math.min(Math.max(Number(filters.limit ?? 50), 10), 200)
    };

    const { whereSql, params } = this.buildJobQuery(safeFilters);
    const total = this.db.prepare(`
      SELECT COUNT(*) AS total
      FROM jobs j
      ${whereSql}
    `).get(...params).total;

    const offset = (safeFilters.page - 1) * safeFilters.limit;
    const rows = this.db.prepare(`
      SELECT
        j.*,
        (
          SELECT GROUP_CONCAT(DISTINCT h.keyword)
          FROM job_hits h
          WHERE h.job_id = j.job_id
        ) AS matched_keywords,
        (
          SELECT GROUP_CONCAT(DISTINCT h.search_city_name)
          FROM job_hits h
          WHERE h.job_id = j.job_id
        ) AS matched_search_cities,
        (
          SELECT COUNT(*)
          FROM job_hits h
          WHERE h.job_id = j.job_id
        ) AS hit_count
      FROM jobs j
      ${whereSql}
      ORDER BY COALESCE(j.published_at_ms, j.first_seen_at_ms) DESC, j.last_seen_at_ms DESC
      LIMIT ? OFFSET ?
    `).all(...params, safeFilters.limit, offset);

    return {
      total,
      rows: this.hydrateRows(rows),
      page: safeFilters.page,
      limit: safeFilters.limit
    };
  }

  exportJobs(filters) {
    const { whereSql, params } = this.buildJobQuery({
      ...filters,
      page: 1,
      limit: 5000
    });

    const rows = this.db.prepare(`
      SELECT
        j.*,
        (
          SELECT GROUP_CONCAT(DISTINCT h.keyword)
          FROM job_hits h
          WHERE h.job_id = j.job_id
        ) AS matched_keywords,
        (
          SELECT GROUP_CONCAT(DISTINCT h.search_city_name)
          FROM job_hits h
          WHERE h.job_id = j.job_id
        ) AS matched_search_cities
      FROM jobs j
      ${whereSql}
      ORDER BY COALESCE(j.published_at_ms, j.first_seen_at_ms) DESC, j.last_seen_at_ms DESC
    `).all(...params);

    return this.hydrateRows(rows);
  }
}

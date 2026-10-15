import express from 'express';
import nunjucks from 'nunjucks';

import { JobDatabase } from '../lib/db.mjs';
import { formatTimestamp } from '../lib/date-utils.mjs';
import { publicDir, templatesDir } from '../lib/paths.mjs';
import { computeLiveSkillCounts } from '../lib/robotics-skills.mjs';
import { findStartupMatches } from '../lib/startup-matches.mjs';
import { draftRecruitingReply } from '../lib/recruiting-agent.mjs';
import { clipText, toCsv } from '../lib/utils.mjs';
import { allCities } from '../lib/cities.mjs';
import { createRecruitingRouter } from './recruiting-router.mjs';

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeFilters(query) {
  return {
    text: String(query.text ?? '').trim(),
    keyword: String(query.keyword ?? '').trim(),
    company: String(query.company ?? '').trim(),
    city: String(query.city ?? '').trim(),
    experience: String(query.experience ?? '').trim(),
    days: toPositiveInteger(query.days, 0),
    includeUnknownPublish: String(query.includeUnknownPublish ?? '') === '1',
    page: toPositiveInteger(query.page, 1),
    limit: toPositiveInteger(query.limit, 50)
  };
}

function compactQuery(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== '' && value !== false && value !== null && value !== undefined),
  );
}

function summarizeJobRow(row) {
  const activeDisplay = row.boss_active_label
    || row.publish_label_detail
    || '';
  return {
    ...row,
    publishedDisplay: row.published_at_ms
      ? formatTimestamp(row.published_at_ms)
      : (row.published_label || '未知'),
    activeDisplay,
    collectedDisplay: formatTimestamp(row.last_seen_at_ms),
    firstSeenDisplay: formatTimestamp(row.first_seen_at_ms),
    matchedKeywordsDisplay: row.matched_keywords.join(' / '),
    matchedCitiesDisplay: row.matched_search_cities.join(' / '),
    skillsPreview: row.skills.slice(0, 4).join(' · '),
    descriptionPreview: clipText(row.description, 120)
  };
}

export function createApp({ database = new JobDatabase() } = {}) {
  const app = express();

  nunjucks.configure(templatesDir, {
    autoescape: true,
    express: app,
    noCache: true
  });

  app.use(express.static(publicDir));
  const recruitingRouter = createRecruitingRouter(database);
  app.use('/api/recruiting', recruitingRouter);
  app.locals.close = () => recruitingRouter.close();
  app.get('/workbench', (request,response) => response.render('workbench.njk'));

  app.get('/agent', (request, response) => {
    const job = database.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(String(request.query.job || ''));
    response.render('agent.njk', { job });
  });

  let drafting = false;
  app.post('/api/agent/draft', (request, response, next) => {
    const origin = request.headers.origin;
    if (origin && ![ `http://127.0.0.1:${request.socket.localPort}`, `http://localhost:${request.socket.localPort}` ].includes(origin)) return response.status(403).json({ error: '仅允许本机浏览器请求。' });
    if (!request.is('application/json')) return response.status(415).json({ error: '请求数据格式不正确。' });
    next();
  }, express.json({ limit: '64kb' }), async (request, response) => {
    if (drafting) return response.status(409).json({ error: '正在生成草稿，请等待完成后再试。' });
    if (!request.body || typeof request.body.jobId !== 'string') return response.status(400).json({ error: '请先选择职位。' });
    if (['conversation', 'goal'].some(key => request.body[key] !== undefined && typeof request.body[key] !== 'string')) return response.status(400).json({ error: '对话和沟通目标须为文字。' });
    const job = database.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(request.body.jobId);
    if (!job) return response.status(404).json({ error: '本地职位库中未找到该职位。' });
    drafting = true;
    try {
      response.json(await draftRecruitingReply({ job, conversation: request.body.conversation, goal: request.body.goal }));
    } catch (error) {
      response.status(502).json({ error: error.message });
    } finally {
      drafting = false;
    }
  });

  const startupFilters = (query) => ({
    city: String(query.city || ''),
    scale: ['small', 'medium'].includes(query.scale) ? query.scale : 'all',
    directOnly: query.direct === '1'
  });

  app.get('/api/startups', (request, response) => {
    response.json(findStartupMatches(database.db, startupFilters(request.query)));
  });

  app.get('/startups', (request, response) => {
    const filters = startupFilters(request.query);
    response.render('startups.njk', {
      filters,
      cities: allCities,
      queryString: new URLSearchParams({ city: filters.city, scale: filters.scale, direct: filters.directOnly ? '1' : '0' }).toString(),
      result: findStartupMatches(database.db, filters)
    });
  });

  app.get('/', (request, response) => response.redirect('/workbench'));

  app.get('/robotics', (request, response) => {
    response.render('robotics.njk');
  });

  app.get('/api/robotics/skills', (request, response) => {
    response.json(computeLiveSkillCounts(database.db));
  });

  app.get('/jobs', (request, response) => {
    const filters = normalizeFilters(request.query);
    const result = database.searchJobs(filters);
    const stats = database.getDashboardStats();
    const taskSummary = database.getTaskSummary();
    const recentFailures = database.listRecentFailures();

    const totalPages = Math.max(Math.ceil(result.total / result.limit), 1);
    const queryState = compactQuery({
      text: filters.text,
      keyword: filters.keyword,
      company: filters.company,
      city: filters.city,
      experience: filters.experience,
      days: filters.days || '',
      includeUnknownPublish: filters.includeUnknownPublish ? '1' : '',
      limit: filters.limit
    });

    const buildQueryString = (overrides = {}) => {
      const merged = compactQuery({ ...queryState, ...overrides });
      const search = new URLSearchParams(merged).toString();
      return search ? `/jobs?${search}` : '/jobs';
    };

    const exportQuery = new URLSearchParams(queryState).toString();
    const publishCoveragePct = stats.totalJobs === 0
      ? 0
      : Math.round((stats.publishCoverageCount / stats.totalJobs) * 100);

    response.render('index.njk', {
      filters,
      jobs: result.rows.map(summarizeJobRow),
      total: result.total,
      stats,
      taskSummary,
      recentFailures,
      publishCoveragePct,
      keywordOptions: database.listKeywords(),
      experienceOptions: database.listExperiences(),
      pagination: {
        page: result.page,
        totalPages,
        prevUrl: result.page > 1 ? buildQueryString({ page: result.page - 1 }) : null,
        nextUrl: result.page < totalPages ? buildQueryString({ page: result.page + 1 }) : null
      },
      exportUrl: exportQuery ? `/export.csv?${exportQuery}` : '/export.csv',
      formatTimestamp
    });
  });

  app.get('/export.csv', (request, response) => {
    const filters = normalizeFilters(request.query);
    const rows = database.exportJobs(filters).map((row) => ({
      job_name: row.job_name,
      company_name: row.company_name ?? '',
      city_name: row.city_name ?? '',
      salary_desc: row.salary_desc ?? '',
      experience_name: row.experience_name ?? '',
      degree_name: row.degree_name ?? '',
      published_at: row.published_at_ms ? formatTimestamp(row.published_at_ms) : (row.published_label ?? ''),
      active_label: row.boss_active_label || row.publish_label_detail || '',
      matched_keywords: row.matched_keywords.join(' / '),
      matched_search_cities: row.matched_search_cities.join(' / '),
      job_url: row.job_url ?? '',
      collected_at: row.last_seen_at_ms ? formatTimestamp(row.last_seen_at_ms) : ''
    }));

    const csv = toCsv(rows, [
      { key: 'job_name', label: '职位' },
      { key: 'company_name', label: '公司' },
      { key: 'city_name', label: '职位城市' },
      { key: 'salary_desc', label: '薪资' },
      { key: 'experience_name', label: '经验' },
      { key: 'degree_name', label: '学历' },
      { key: 'published_at', label: '发布时间' },
      { key: 'active_label', label: '最近活跃' },
      { key: 'matched_keywords', label: '命中关键词' },
      { key: 'matched_search_cities', label: '命中搜索城市' },
      { key: 'job_url', label: '职位链接' },
      { key: 'collected_at', label: '最近采集时间' }
    ]);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="jobtrending-export.csv"');
    response.send(`\ufeff${csv}`);
  });

  return app;
}

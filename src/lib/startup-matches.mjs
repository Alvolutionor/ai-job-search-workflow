import { loadMatchingConfig } from './user-config.mjs';

const includesTerm = (text, term) => String(text || '').toLocaleLowerCase().includes(term.toLocaleLowerCase());

export function findStartupMatches(db, { city = '', scale = 'all', directOnly = false, config = loadMatchingConfig() } = {}) {
  const rows = db.prepare(`
    SELECT job_id, job_name, company_name, company_id, city_name, industry_name,
      brand_scale_name, brand_stage_name, boss_name, boss_title, salary_desc,
      description, skills_json, job_url, last_seen_at_ms
    FROM jobs
  `).all();
  const eligible = rows.filter(row => {
    if (city && row.city_name !== city) return false;
    if (config.cities.length && !config.cities.includes(row.city_name)) return false;
    if (scale === 'small' && !['0-20人', '20-99人'].includes(row.brand_scale_name)) return false;
    if (scale === 'medium' && !['0-20人', '20-99人', '100-499人'].includes(row.brand_scale_name)) return false;
    const text = [row.job_name, row.company_name, row.description, row.skills_json].join(' ');
    return (!config.keywords.length || config.keywords.some(term => includesTerm(text, term)))
      && !config.excludedKeywords.some(term => includesTerm(text, term));
  }).map(row => {
    const text = [row.job_name, row.company_name, row.description, row.skills_json].join(' ');
    const matchedTerms = config.priorityTerms.filter(term => includesTerm(text, term));
    const directContact = config.preferredContactTitles.some(term => includesTerm(row.boss_title, term));
    return {
      ...row,
      score: matchedTerms.length,
      reasons: matchedTerms.map(term => `Matches your priority term: ${term}`),
      gaps: row.description ? [] : ['Full description not collected.'],
      hasDescription: Boolean(row.description),
      directContact,
      contactCategory: row.boss_title || 'Contact title not supplied',
      lastObserved: row.last_seen_at_ms ? new Date(row.last_seen_at_ms).toISOString().slice(0, 10) : '',
      priority: matchedTerms.length ? 'Matches your priority terms' : 'Available listing'
    };
  }).filter(row => !directOnly || row.directContact);
  eligible.sort((a,b) => (config.prioritizeContacts ? Number(b.directContact) - Number(a.directContact) : 0)
    || b.score - a.score || b.last_seen_at_ms - a.last_seen_at_ms || a.job_id.localeCompare(b.job_id));
  const companies = new Map();
  for (const job of eligible) {
    const key = job.company_id || job.company_name;
    if (!companies.has(key)) companies.set(key, { name: job.company_name, jobs: [], score: job.score });
    companies.get(key).jobs.push(job);
  }
  return {
    generatedAt: new Date().toISOString(),
    source: 'Local job observations, filtered and ordered using your settings.',
    totalJobs: eligible.length,
    totalCompanies: companies.size,
    directContactCompanies: [...companies.values()].filter(company => company.jobs.some(job => job.directContact)).length,
    companies: [...companies.values()]
  };
}

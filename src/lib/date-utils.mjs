import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

import { getPath, normalizeString } from './utils.mjs';

dayjs.extend(customParseFormat);

const publishCandidatePaths = [
  'publishDate',
  'publishTime',
  'publish_time',
  'publishAt',
  'publish_at',
  'createdTime',
  'createTime',
  'refreshTime',
  'refreshDate',
  'publishDesc',
  'publishText',
  'statusDesc',
  'jobStatusDesc'
];

function parseRelativeChinese(text, baseMs) {
  const normalized = normalizeString(text).replace(/\s+/g, '');
  if (!normalized) {
    return null;
  }
  if (/^(刚刚|最新)$/.test(normalized)) {
    return baseMs;
  }
  if (/^(今天|今日)(发布)?$/.test(normalized)) {
    return dayjs(baseMs).startOf('day').valueOf();
  }
  if (/^昨天(发布)?$/.test(normalized)) {
    return dayjs(baseMs).subtract(1, 'day').startOf('day').valueOf();
  }

  const relativePatterns = [
    { regex: /^(\d+)分钟前(发布)?$/, unit: 'minute' },
    { regex: /^(\d+)小时前(发布)?$/, unit: 'hour' },
    { regex: /^(\d+)天前(发布)?$/, unit: 'day' },
    { regex: /^(\d+)周前(发布)?$/, unit: 'week' },
    { regex: /^(\d+)个月前(发布)?$/, unit: 'month' }
  ];

  for (const pattern of relativePatterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      return dayjs(baseMs).subtract(Number.parseInt(match[1], 10), pattern.unit).valueOf();
    }
  }

  return null;
}

export function parseTimestampCandidate(value, baseMs = Date.now()) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) {
      return value;
    }
    if (value > 1e9) {
      return value * 1000;
    }
  }

  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  if (/^\d{13}$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }
  if (/^\d{10}$/.test(normalized)) {
    return Number.parseInt(normalized, 10) * 1000;
  }

  const relativeTime = parseRelativeChinese(normalized, baseMs);
  if (relativeTime !== null) {
    return relativeTime;
  }

  const directFormats = [
    'YYYY-MM-DD HH:mm:ss',
    'YYYY-MM-DD HH:mm',
    'YYYY/MM/DD HH:mm:ss',
    'YYYY/MM/DD HH:mm',
    'YYYY-MM-DD',
    'YYYY/MM/DD'
  ];
  for (const format of directFormats) {
    const parsed = dayjs(normalized, format, true);
    if (parsed.isValid()) {
      return parsed.valueOf();
    }
  }

  if (/^\d{2}-\d{2}$/.test(normalized) || /^\d{2}\/\d{2}$/.test(normalized)) {
    const currentYear = dayjs(baseMs).year();
    const parsed = dayjs(`${currentYear}-${normalized.replace('/', '-')}`, 'YYYY-MM-DD', true);
    if (parsed.isValid()) {
      return parsed.valueOf();
    }
  }

  const looselyParsed = dayjs(normalized);
  if (looselyParsed.isValid()) {
    return looselyParsed.valueOf();
  }

  return null;
}

export function extractPublishInfo(rawJob, collectedAtMs = Date.now()) {
  let fallbackLabel = null;
  let fallbackSource = null;

  for (const candidatePath of publishCandidatePaths) {
    const value = getPath(rawJob, candidatePath);
    const parsed = parseTimestampCandidate(value, collectedAtMs);
    if (parsed !== null) {
      return {
        publishedAtMs: parsed,
        publishedLabel: normalizeString(value),
        publishedSource: candidatePath
      };
    }
    const normalized = normalizeString(value);
    if (normalized && !fallbackLabel) {
      fallbackLabel = normalized;
      fallbackSource = candidatePath;
    }
  }

  for (const [key, value] of Object.entries(rawJob ?? {})) {
    if (typeof value !== 'string') {
      continue;
    }
    const parsed = parseTimestampCandidate(value, collectedAtMs);
    if (parsed !== null) {
      return {
        publishedAtMs: parsed,
        publishedLabel: normalizeString(value),
        publishedSource: key
      };
    }
    const normalized = normalizeString(value);
    if (normalized && !fallbackLabel && /(发布|刚刚|今天|今日|昨天|\d+[分钟小时天周月]前)/.test(normalized)) {
      fallbackLabel = normalized;
      fallbackSource = key;
    }
  }

  return {
    publishedAtMs: null,
    publishedLabel: fallbackLabel,
    publishedSource: fallbackSource
  };
}

export function formatTimestamp(ms, format = 'YYYY-MM-DD HH:mm') {
  if (!ms) {
    return '';
  }
  return dayjs(ms).format(format);
}

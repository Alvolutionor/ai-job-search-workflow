export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min, max) {
  if (max <= min) {
    return min;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function sleepRandom(min, max) {
  await sleep(randomBetween(min, max));
}

export function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
}

export function getPath(input, pathExpression) {
  if (!input || !pathExpression) {
    return undefined;
  }
  return pathExpression.split('.').reduce((acc, key) => acc?.[key], input);
}

export function pickFirst(input, paths, fallback = null) {
  for (const pathExpression of paths) {
    const value = getPath(input, pathExpression);
    if (value !== undefined && value !== null && normalizeString(value) !== '') {
      return value;
    }
  }
  return fallback;
}

function flattenToStrings(value) {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenToStrings(item));
  }
  if (typeof value === 'object') {
    return ['name', 'label', 'text', 'content', 'desc', 'value']
      .flatMap((key) => flattenToStrings(value[key]));
  }
  const normalized = normalizeString(value);
  return normalized ? [normalized] : [];
}

export function pickStringArray(input, paths, fallback = []) {
  for (const pathExpression of paths) {
    const value = getPath(input, pathExpression);
    const flattened = Array.from(new Set(flattenToStrings(value)));
    if (flattened.length > 0) {
      return flattened;
    }
  }
  return fallback;
}

export function escapeLike(value) {
  return value.replace(/[\\%_]/g, (token) => `\\${token}`);
}

export function clipText(value, maxLength = 140) {
  const text = normalizeString(value);
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export function escapeCsvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function toCsv(rows, headers) {
  const headerLine = headers.map((header) => escapeCsvCell(header.label)).join(',');
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header.key])).join(','),
  );
  return [headerLine, ...dataLines].join('\n');
}

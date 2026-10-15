import fs from 'node:fs';
import path from 'node:path';

import { cookieFilePath } from './paths.mjs';

const editThisCookieKeys = [
  'name',
  'value',
  'domain',
  'path',
  'secure',
  'session',
  'httpOnly'
];

const minimalCookieKeys = [
  'name',
  'value',
  'domain',
  'path'
];

function hasOwnKeys(cookie, keys) {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(cookie, key));
}

function normalizeSameSite(value) {
  if (!value) {
    return undefined;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === 'lax') {
    return 'Lax';
  }
  if (normalized === 'strict') {
    return 'Strict';
  }
  if (normalized === 'none' || normalized === 'no_restriction' || normalized === 'unspecified') {
    return 'None';
  }
  return undefined;
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value);
}

export function checkCookieListFormat(cookies) {
  return Array.isArray(cookies)
    && cookies.length > 0
    && cookies.every((cookie) => hasOwnKeys(cookie, minimalCookieKeys));
}

export function detectCookieListFormat(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return null;
  }

  if (cookies.every((cookie) => hasOwnKeys(cookie, editThisCookieKeys))) {
    return 'edit-this-cookie';
  }

  if (cookies.every((cookie) => hasOwnKeys(cookie, minimalCookieKeys))) {
    return 'playwright-or-minimal';
  }

  return null;
}

export function parseCookieJson(rawText) {
  let cookies;
  try {
    cookies = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Cookie JSON parse failed: ${error.message}`);
  }

  const format = detectCookieListFormat(cookies);
  if (!format) {
    throw new Error(`Cookie format invalid. Expected an array containing at least: ${minimalCookieKeys.join(', ')}`);
  }

  return cookies;
}

export function loadCookieFile(filePath = cookieFilePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Cookie file not found: ${absolutePath}`);
  }
  const rawText = fs.readFileSync(absolutePath, 'utf8');
  return parseCookieJson(rawText);
}

export function saveCookieFile(cookies, filePath = cookieFilePath) {
  const absolutePath = path.resolve(filePath);
  fs.writeFileSync(absolutePath, JSON.stringify(cookies, null, 2), 'utf8');
  return absolutePath;
}

export function normalizeCookiesForPlaywright(cookies) {
  return cookies.map((cookie) => {
    const expiresCandidate = cookie.expires ?? cookie.expirationDate ?? cookie.expiry;
    let expires = undefined;
    if (expiresCandidate !== undefined && expiresCandidate !== null && expiresCandidate !== '' && Number(expiresCandidate) > 0) {
      expires = Number(expiresCandidate);
    }

    return {
      name: String(cookie.name),
      value: String(cookie.value),
      domain: String(cookie.domain),
      path: String(cookie.path || '/'),
      secure: coerceBoolean(cookie.secure),
      httpOnly: coerceBoolean(cookie.httpOnly),
      sameSite: normalizeSameSite(cookie.sameSite),
      expires
    };
  });
}

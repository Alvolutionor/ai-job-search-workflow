import fs from 'node:fs';
import path from 'node:path';

import { localStorageFilePath } from './paths.mjs';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseLocalStorageJson(rawText) {
  let storage;
  try {
    storage = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Local storage JSON parse failed: ${error.message}`);
  }

  if (!isPlainObject(storage)) {
    throw new Error('Local storage format invalid. Expected a JSON object of key/value pairs.');
  }

  return Object.fromEntries(
    Object.entries(storage).map(([key, value]) => [String(key), value === null || value === undefined ? '' : String(value)]),
  );
}

export function loadLocalStorageFile(filePath = localStorageFilePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Local storage file not found: ${absolutePath}`);
  }
  const rawText = fs.readFileSync(absolutePath, 'utf8');
  return parseLocalStorageJson(rawText);
}

export function saveLocalStorageFile(storage, filePath = localStorageFilePath) {
  const absolutePath = path.resolve(filePath);
  fs.writeFileSync(absolutePath, JSON.stringify(storage, null, 2), 'utf8');
  return absolutePath;
}

import { normalizeString } from './utils.mjs';

const obfuscatedDigits = new Map([
  [String.fromCharCode(0xe031), '0'],
  [String.fromCharCode(0xe032), '1'],
  [String.fromCharCode(0xe033), '2'],
  [String.fromCharCode(0xe034), '3'],
  [String.fromCharCode(0xe035), '4'],
  [String.fromCharCode(0xe036), '5'],
  [String.fromCharCode(0xe037), '6'],
  [String.fromCharCode(0xe038), '7'],
  [String.fromCharCode(0xe039), '8'],
  [String.fromCharCode(0xe03a), '9']
]);

export function decodeObfuscatedSalary(input) {
  const raw = String(input ?? '');
  return Array.from(raw)
    .map((char) => obfuscatedDigits.get(char) ?? char)
    .join('');
}

export function parseSalary(rawValue) {
  const salaryDesc = normalizeString(decodeObfuscatedSalary(rawValue));
  if (!salaryDesc) {
    return {
      salaryDesc: null,
      salaryMinK: null,
      salaryMaxK: null,
      salaryMonths: null
    };
  }

  const normalized = salaryDesc.replace(/\s+/g, '');
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)[kK](?:[·.]?(\d{1,2})薪)?/u);
  if (rangeMatch) {
    return {
      salaryDesc,
      salaryMinK: Math.round(Number.parseFloat(rangeMatch[1])),
      salaryMaxK: Math.round(Number.parseFloat(rangeMatch[2])),
      salaryMonths: rangeMatch[3] ? Number.parseInt(rangeMatch[3], 10) : null
    };
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)[kK](?:[·.]?(\d{1,2})薪)?/u);
  if (singleMatch) {
    const amount = Math.round(Number.parseFloat(singleMatch[1]));
    return {
      salaryDesc,
      salaryMinK: amount,
      salaryMaxK: amount,
      salaryMonths: singleMatch[2] ? Number.parseInt(singleMatch[2], 10) : null
    };
  }

  return {
    salaryDesc,
    salaryMinK: null,
    salaryMaxK: null,
    salaryMonths: null
  };
}

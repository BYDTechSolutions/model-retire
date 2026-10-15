#!/usr/bin/env node
// Validates data/models.json: JSON Schema, calendar dates, sort order,
// duplicate IDs and aliases, date order and status consistency.
// With --max-age <days>, also fails when "updated" is older than that,
// as a reminder to re-verify every entry against its source. It never edits data.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function days(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/**
 * Returns a list of problems (empty when the dataset is valid).
 * @param {unknown} data parsed models.json
 * @param {object} schema parsed schema.json
 * @param {{ today: string, maxAge?: number }} opts
 */
export function checkData(data, schema, opts) {
  const errors = [];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    for (const e of validate.errors ?? []) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    return errors;
  }
  if (!isDate(data.updated)) errors.push(`updated: not a calendar date: ${data.updated}`);
  // One day of slack: the dataset date is local to whoever verified it, the check runs in UTC.
  else if (days(opts.today, data.updated) > 1) errors.push(`updated: ${data.updated} is in the future`);

  const seenIds = new Map();
  let prev = null;
  data.models.forEach((m, i) => {
    const where = `models[${i}] ${m.provider}/${m.id}`;
    for (const k of ['deprecated_on', 'retires_on', 'checked']) {
      if (m[k] !== undefined && !isDate(m[k])) errors.push(`${where}: ${k} is not a calendar date: ${m[k]}`);
    }
    if (prev) {
      const order = prev.provider === m.provider ? (prev.id < m.id ? -1 : prev.id > m.id ? 1 : 0) : prev.provider < m.provider ? -1 : 1;
      if (order === 0) errors.push(`${where}: duplicate entry`);
      else if (order > 0) errors.push(`${where}: not sorted (must follow ${prev.provider}/${prev.id} by provider, then id)`);
    }
    prev = m;
    for (const s of [m.id, ...(m.aliases ?? [])]) {
      const k = `${m.provider}\u0000${s}`;
      const owner = seenIds.get(k);
      if (owner !== undefined && owner !== m.id) errors.push(`${where}: "${s}" is already used by ${m.provider}/${owner}`);
      seenIds.set(k, m.id);
    }
    if ((m.aliases ?? []).includes(m.id)) errors.push(`${where}: an alias repeats the id`);
    if (m.deprecated_on && m.retires_on && m.deprecated_on > m.retires_on) {
      errors.push(`${where}: deprecated_on ${m.deprecated_on} is after retires_on ${m.retires_on}`);
    }
    if (m.checked > data.updated) errors.push(`${where}: checked ${m.checked} is after updated ${data.updated}`);
    if (m.status === 'deprecated' && m.retires_on && m.retires_on <= m.checked) {
      errors.push(`${where}: retires_on ${m.retires_on} had passed on checked ${m.checked}; status must be "retired"`);
    }
    if (m.replacement === m.id) errors.push(`${where}: replacement is the model itself`);
  });

  if (opts.maxAge !== undefined && isDate(data.updated)) {
    const age = days(data.updated, opts.today);
    if (age > opts.maxAge) {
      errors.push(
        `updated ${data.updated} is ${age} days old (limit ${opts.maxAge}). Re-verify every entry against its source page, then bump "updated" and "checked".`,
      );
    }
  }
  return errors;
}

function main() {
  const { values } = parseArgs({
    options: {
      'max-age': { type: 'string' },
      today: { type: 'string' },
      data: { type: 'string' },
    },
  });
  const today = values.today ?? new Date().toISOString().slice(0, 10);
  const maxAge = values['max-age'] === undefined ? undefined : Number(values['max-age']);
  const dataFile = values.data ?? join(root, 'data/models.json');
  const data = JSON.parse(readFileSync(dataFile, 'utf8'));
  const schema = JSON.parse(readFileSync(join(root, 'data/schema.json'), 'utf8'));
  const errors = checkData(data, schema, { today, maxAge });
  if (errors.length > 0) {
    for (const e of errors) console.error(`check-data: ${e}`);
    process.exitCode = 1;
    return;
  }
  const providers = new Set(data.models.map((m) => m.provider));
  console.log(`check-data: ${data.models.length} models from ${providers.size} providers, updated ${data.updated}. OK.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();

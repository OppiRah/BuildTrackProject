// Query plans of the intake save batch (worker/public/store.ts) on SQLite, D1's engine: every
// statement must be a primary-key or single-index lookup, never a scan of earlier rows, so the
// cost of storing a request does not grow with history. (A scan of a year's requests to find
// the next reference number is what this guards against.) The measured cost on the real local
// runtime with a populated database is asserted by `npm run test:worker`.

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { saveStatements } from '../worker/public/store.ts';

const db = new DatabaseSync(':memory:');
const migrations = new URL('../migrations/', import.meta.url);
for (const file of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrations), 'utf8'));
const plan = (sql: string) => (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[]).map((row) => row.detail);

describe('intake save batch query plans', () => {
  it.each(saveStatements.map((sql, index) => [index + 1, sql] as const))('statement %i reads by key only', (_index, sql) => {
    const details = plan(sql);
    // The only scans allowed are of the constant one-row subquery used as an outer-join anchor.
    expect(details.filter((detail) => detail.startsWith('SCAN') && detail !== 'SCAN CONSTANT ROW' && detail !== 'SCAN one')).toEqual([]);
    // No range search over a year's requests (the old MAX(ref_seq) allocation).
    expect(details.some((detail) => detail.includes('ref_year'))).toBe(false);
    // Any search of quote_requests is by id, submission id or de-duplication key.
    for (const detail of details.filter((d) => /SEARCH (quote_requests|r) /.test(d))) {
      expect(detail).toMatch(/\((id=\?|submission_id=\?|dedupe_key=\? AND created_at>\?)\)/);
    }
  });
});

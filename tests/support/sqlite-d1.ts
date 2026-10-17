// Test-only stand-in for Cloudflare D1 on Node's built-in SQLite (node:sqlite, no dependency).
// It runs the real migration SQL and implements the subset in src/lib/quotation/d1.ts:
// ordered `?NNN` parameters, first/all/run, and batch() as one transaction that rolls back
// entirely if any statement fails, as D1 documents. It is not a full D1 emulation; the
// local Worker run (tests/worker/quotation-intake.ts) exercises real D1 under wrangler.

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/lib/quotation/d1.ts';

type Value = string | number | null;

class Statement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: Value[] = [],
  ) {}

  bind(...values: Value[]): D1PreparedStatement {
    return new Statement(this.db, this.sql, values);
  }

  execute<T>(): D1Result<T> {
    const statement = this.db.prepare(this.sql);
    if (statement.columns().length > 0) {
      const results = statement.all(...this.params) as T[];
      const changes = Number((this.db.prepare('SELECT changes() AS c').get() as { c: number }).c);
      return { results, success: true, meta: { changes: /^\s*select/i.test(this.sql) ? 0 : changes } };
    }
    const info = statement.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }

  async first<T>(): Promise<T | null> {
    return (this.execute<T>().results[0] as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return this.execute<T>();
  }

  async run(): Promise<D1Result> {
    return this.execute();
  }
}

export interface TestDatabase extends D1Database {
  raw: DatabaseSync;
  /** Makes every later statement throw, to test failure handling. */
  breakAll(): void;
}

export function createTestDatabase(): TestDatabase {
  const raw = new DatabaseSync(':memory:');
  const dir = new URL('../../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    raw.exec(readFileSync(new URL(file, dir), 'utf8'));
  }
  let broken = false;
  return {
    raw,
    breakAll: () => {
      broken = true;
    },
    prepare(query: string) {
      if (broken) throw new Error('database unavailable (test)');
      return new Statement(raw, query);
    },
    async batch<T>(statements: D1PreparedStatement[]) {
      raw.exec('BEGIN');
      try {
        const results = statements.map((statement) => (statement as Statement).execute<T>());
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

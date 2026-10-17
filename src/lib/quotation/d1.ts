// The subset of Cloudflare's D1 Worker API the quotation Workers use, declared here so
// the code type-checks without generated runtime types. The real binding satisfies it;
// tests run the same SQL through tests/support/sqlite-d1.ts (node:sqlite).
// Parameters use D1's ordered `?NNN` form. `batch()` is D1's documented transaction:
// statements run sequentially and the whole batch rolls back if one fails.

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

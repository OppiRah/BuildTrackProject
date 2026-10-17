// TEST-ONLY Worker used by tests/worker/quotation-intake.ts; never deployed or referenced by any
// wrangler config in the repository. It runs the real intake handler with a D1 wrapper that sums
// D1's own rows_read / rows_written metadata for every statement and batch, and returns the
// totals in an X-D1-Cost response header, so the test can assert bounded database costs.

import { handleIntake, type IntakeEnv } from '../../worker/public/intake.ts';
import type { D1Database, D1PreparedStatement, D1Result } from '../../src/lib/quotation/d1.ts';

type Meta = { rows_read?: number; rows_written?: number };
type Wrapped = D1PreparedStatement & { real: D1PreparedStatement };

export default {
  async fetch(request: Request, env: IntakeEnv & { DB: D1Database }): Promise<Response> {
    const cost = { read: 0, written: 0, statements: 0 };
    const add = (result: D1Result<unknown>) => {
      const meta = result.meta as Meta;
      cost.statements += 1;
      cost.read += meta.rows_read ?? 0;
      cost.written += meta.rows_written ?? 0;
    };
    const wrap = (real: D1PreparedStatement): Wrapped => ({
      real,
      bind: (...values) => wrap(real.bind(...values)),
      all: async <T>() => {
        const result = await real.all<T>();
        add(result);
        return result;
      },
      run: async () => {
        const result = await real.run();
        add(result);
        return result;
      },
      first: async <T>() => {
        const result = await real.all<T>();
        add(result);
        return (result.results[0] as T | undefined) ?? null;
      },
    });
    const db: D1Database = {
      prepare: (query) => wrap(env.DB.prepare(query)),
      batch: async <T>(statements: D1PreparedStatement[]) => {
        const results = await env.DB.batch<T>(statements.map((statement) => (statement as Wrapped).real));
        for (const result of results) add(result);
        return results;
      },
    };
    const response = await handleIntake(request, { ...env, DB: db });
    const headers = new Headers(response.headers);
    headers.set('X-D1-Cost', JSON.stringify(cost));
    return new Response(response.body, { status: response.status, headers });
  },
};

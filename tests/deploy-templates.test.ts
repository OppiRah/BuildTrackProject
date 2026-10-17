// The reviewed deployment templates (deploy/*.example.jsonc) stay safe: they parse, keep every
// switch off, carry no secret values, point at real entry files, and production wrangler.jsonc is
// still assets-only. Nothing here deploys anything. Paths are checked here against the repository
// root, where the runbook puts filled copies; that Wrangler itself resolves them from there (and
// not from deploy/) is checked by `npm run test:deploy:templates`.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
/** These templates use only whole-line // comments. */
const parse = (path: string) => JSON.parse(read(path).split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n')) as Record<string, any>;
const SECRETS = ['INTAKE_HMAC_KEY', 'TURNSTILE_SECRET_KEY', 'OWNER_FORM_KEY', 'QUOTE_LINK_KEY_V1', 'RESEND_API_KEY'];

describe('deployment templates', () => {
  it.each(['deploy/public.wrangler.example.jsonc', 'deploy/owner.wrangler.example.jsonc'])('%s is safe and off', (path) => {
    const config = parse(path);
    for (const path of [config.main, config.assets?.directory, config.d1_databases[0].migrations_dir].filter(Boolean)) expect(existsSync(new URL(path, root)), path).toBe(true);
    for (const secret of SECRETS) expect(Object.keys(config.vars)).not.toContain(secret);
    expect(config.vars.WORKFLOW_ENABLED).toBe('off');
    if ('SENDING_ENABLED' in config.vars) expect(config.vars.SENDING_ENABLED).toBe('off');
    if ('TURNSTILE_ENABLED' in config.vars) expect(config.vars.TURNSTILE_ENABLED).toBe('off');
    expect(config.d1_databases[0].database_id).toBe('<D1_DATABASE_ID>');
    expect(config.observability.logs.invocation_logs).toBe(false);
    for (const origin of [config.vars.PUBLIC_ORIGIN, config.vars.OWNER_ORIGIN].filter(Boolean)) expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(read(path)).not.toMatch(/re_[A-Za-z0-9]{8,}|[A-Za-z0-9+/]{40,}={0,2}/); // nothing that looks like a key
  });

  it('the public template routes only the API and the customer page through the Worker', () => {
    expect(parse('deploy/public.wrangler.example.jsonc').assets.run_worker_first).toEqual(['/api/*', '/quote/*']);
  });

  it('the owner template leaves Access values as placeholders to be filled from real resources', () => {
    const vars = parse('deploy/owner.wrangler.example.jsonc').vars;
    expect([vars.OWNER_EMAIL, vars.ACCESS_AUD].every((v: string) => v.startsWith('<'))).toBe(true);
    expect(vars.ACCESS_TEAM_DOMAIN).toBe('<TEAM_NAME>.cloudflareaccess.com');
  });

  it('the templates and the runbook name the same root-level files for filled copies', () => {
    const runbook = read('docs/QUOTATION_RUNBOOK.md');
    for (const [path, names] of [
      ['deploy/public.wrangler.example.jsonc', ['wrangler.preview.jsonc', 'wrangler.jsonc']],
      ['deploy/owner.wrangler.example.jsonc', ['wrangler.owner.preview.jsonc', 'wrangler.owner.jsonc']],
    ] as const) {
      const lines = read(path).split('\n');
      expect(read(path)).toContain('does not work in place');
      for (const name of names) {
        expect(lines.some((line) => line.startsWith(`//   ${name} `)), `${path} lists ${name}`).toBe(true);
        expect(runbook).toContain(`\`${name}\``);
      }
    }
  });

  it.each(['deploy/public.wrangler.example.jsonc', 'deploy/owner.wrangler.example.jsonc'])('%s is in manual email mode with no mail-provider settings', (path) => {
    const vars = parse(path).vars;
    expect(vars.EMAIL_MODE).toBe('manual');
    for (const name of ['MAIL_FROM', 'RESEND_API_KEY', 'SENDING_ENABLED']) expect(Object.keys(vars)).not.toContain(name);
    expect(read(path)).not.toMatch(/RESEND_API_KEY\s+a /);
  });

  it('production wrangler.jsonc is unchanged: assets only, no Worker script or bindings', () => {
    const production = read('wrangler.jsonc');
    expect(production).not.toMatch(/"main"|d1_databases|run_worker_first/);
  });
});

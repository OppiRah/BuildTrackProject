// Release gate: `npm run check:release`. Exits 1 while any required value is unresolved.
// Run with Node's built-in TypeScript type stripping (Node 24 LTS).

import { findReleaseIssues, manualReleaseGates, projectReleaseConfig } from '../src/lib/release-check.ts';

const issues = findReleaseIssues(projectReleaseConfig());

if (issues.length === 0) {
  console.log('Release check: all automated release requirements are met.');
} else {
  console.log(`Release check: ${issues.length} unmet release requirement(s) in src/config/:`);
  for (const issue of issues) console.log(`  - ${issue.field}: ${issue.problem}`);
}

console.log('\nManual release gates (verify separately):');
for (const gate of manualReleaseGates) console.log(`  - ${gate}`);

process.exitCode = issues.length === 0 ? 0 : 1;

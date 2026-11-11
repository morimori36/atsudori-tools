import { readFileSync } from 'node:fs';
import { git, scanHistory, scanUpdates } from './git.mjs';
import { assertSafeMetadata, PublicationFinding } from './rules.ts';

try {
  let inspected;
  if (process.argv.length === 3 && process.argv[2] === '--head') {
    assertSafeMetadata(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim());
    inspected = scanHistory([git(['rev-parse', 'HEAD']).trim()]);
  } else {
    if (process.argv.length !== 2) throw Error('Unexpected arguments');
    inspected = scanUpdates(readFileSync(0, 'utf8'));
  }
  console.log('Pre-push publication check passed: ' + inspected + ' immutable objects inspected locally. Content review is still required.');
} catch (error) {
  console.error(error instanceof PublicationFinding ? error.message : 'Pre-push publication check could not complete; push blocked. No input or Git diagnostics are printed.');
  process.exitCode = 1;
}

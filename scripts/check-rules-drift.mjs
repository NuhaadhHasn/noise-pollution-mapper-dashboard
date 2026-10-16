// Rules drift check (dashboard audit test-1).
//
// APP:firestore.rules (the sibling noise_pollution_mapper repo) is the
// canonical, deployed ruleset; this repo keeps a byte-identical mirror of it.
// The project has no Storage bucket, so neither repo keeps a storage.rules
// (build-2). The APP working tree is CRLF and this one is LF
// (core.autocrlf=true; both index blobs are LF), so the copies are compared
// after stripping every '\r'. A plain cmp would report drift forever.
//
// Usage:  node scripts/check-rules-drift.mjs <path-to-noise_pollution_mapper>
//         npm run check:rules
// Exit:   0 = the copies are identical modulo CR
//         1 = the copies differ, or a file is missing or unreadable
//         2 = bad usage (no APP path given)

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RULES_FILES = ['firestore.rules'];

function readWithoutCr(path) {
  return readFileSync(path, 'utf8').replace(/\r/g, '');
}

function main(appArg) {
  if (!appArg) {
    console.error(
      'Usage: node scripts/check-rules-drift.mjs <path-to-noise_pollution_mapper>',
    );
    return 2;
  }

  const dashRoot = fileURLToPath(new URL('..', import.meta.url));
  const appRoot = resolve(appArg);
  let drift = false;

  for (const name of RULES_FILES) {
    const appPath = join(appRoot, name);
    const dashPath = join(dashRoot, name);

    let appText;
    let dashText;
    try {
      appText = readWithoutCr(appPath);
      dashText = readWithoutCr(dashPath);
    } catch (error) {
      console.error(`ERROR ${name}: ${error.message}`);
      drift = true;
      continue;
    }

    if (appText === dashText) {
      console.log(`OK    ${name} (identical modulo CR)`);
      continue;
    }

    drift = true;
    const appLines = appText.split('\n');
    const dashLines = dashText.split('\n');
    let i = 0;
    while (appLines[i] === dashLines[i]) i += 1;
    console.error(`DRIFT ${name}: first difference at line ${i + 1}`);
    console.error(`  APP : ${appLines[i] ?? '<end of file>'}`);
    console.error(`  DASH: ${dashLines[i] ?? '<end of file>'}`);
  }

  if (drift) {
    console.error(
      'Rules copies differ. Edit APP:firestore.rules first, then mirror it ' +
        "from this repo with: tr -d '\\r' < ../noise_pollution_mapper/firestore.rules > firestore.rules",
    );
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv[2]);

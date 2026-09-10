#!/usr/bin/env node
// Turns test-results/results.json (from the Playwright JSON reporter) into
// the plain-language Hebrew summary format from TEST_PLAN.md section 6.
// Run after `npm test` via `npm run test:report`.

import { readFileSync } from 'node:fs';

const RESULTS_PATH = 'test-results/results.json';

function walkSpecs(suites, out = []) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) out.push(spec);
    walkSpecs(suite.suites, out);
  }
  return out;
}

function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
  } catch {
    console.error(`לא נמצא קובץ תוצאות ב-${RESULTS_PATH}. הרץ קודם: npm test`);
    process.exit(1);
  }

  const specs = walkSpecs(data.suites);
  let passed = 0;
  let failed = 0;
  const knownGaps = [];
  const unexpectedFailures = [];

  for (const spec of specs) {
    for (const test of spec.tests || []) {
      const isKnownGap = (test.annotations || []).some((a) => a.type === 'fail');
      const lastResult = test.results?.[test.results.length - 1];
      const ok = lastResult?.status === 'passed' || lastResult?.status === 'expected';

      if (isKnownGap) {
        knownGaps.push(spec.title);
        continue; // expected-to-fail tests are neither a pass nor a real failure
      }
      if (ok) passed++;
      else {
        failed++;
        unexpectedFailures.push(spec.title);
      }
    }
  }

  console.log(`✅ ${passed} תרחישים עברו`);
  if (failed > 0) {
    console.log(`❌ ${failed} נכשלו (לא צפוי - דורש תשומת לב מיידית):`);
    unexpectedFailures.forEach((t) => console.log(`   - ${t}`));
  }
  if (knownGaps.length > 0) {
    console.log(`⚠️  ${knownGaps.length} פערים ידועים (מתועדים במשימה #15, ממתינים לתיקון מרוכז):`);
    knownGaps.forEach((t) => console.log(`   - ${t}`));
  }
  console.log('⏸️  תמיד נשאר לבדיקה ידנית: מצלמה/גלריה במכשיר אמיתי, התקנה בפועל למסך הבית (ר\' TEST_PLAN.md סעיף 5)');

  if (failed > 0) process.exit(1);
}

main();

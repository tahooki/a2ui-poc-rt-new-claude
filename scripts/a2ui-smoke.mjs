#!/usr/bin/env node

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const args = new Set(process.argv.slice(2));
const scenarioIdArg =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'all';
const prepare = !args.has('--no-prepare');

async function main() {
  const res = await fetch(`${baseURL}/api/a2ui-smoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      scenarioId: scenarioIdArg,
      prepare,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const payload = await res.json();
  const scenarioResults = Array.isArray(payload.scenarios)
    ? payload.scenarios
    : [payload];

  for (const scenario of scenarioResults) {
    console.log('\n' + '─'.repeat(72));
    console.log(`[${scenario.scenarioId}] passed=${scenario.passed} failed=${scenario.failed} skipped=${scenario.skipped}`);
    console.log('─'.repeat(72));

    for (const result of scenario.results) {
      const icon =
        result.status === 'passed'
          ? '✓'
          : result.status === 'skipped'
            ? '•'
            : '✗';
      console.log(`${icon} ${result.page} :: ${result.question}`);
      if (result.reason) {
        console.log(`  reason: ${result.reason}`);
      }
    }
  }

  const failedCount = Array.isArray(payload.scenarios)
    ? payload.summary.failed
    : payload.failed;

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error('\nMake sure the dev server is running: npm run dev');
  process.exit(1);
});

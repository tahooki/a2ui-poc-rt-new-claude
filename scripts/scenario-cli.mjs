#!/usr/bin/env node
/**
 * Scenario CLI — load, verify, reset scenarios directly via DB
 *
 * Usage:
 *   node scripts/scenario-cli.mjs load checkout-5xx
 *   node scripts/scenario-cli.mjs load --all
 *   node scripts/scenario-cli.mjs verify checkout-5xx
 *   node scripts/scenario-cli.mjs verify --all
 *   node scripts/scenario-cli.mjs reset
 *   node scripts/scenario-cli.mjs list
 */

// We call the admin API, which handles DB operations.
// This avoids needing to import better-sqlite3 ESM/CJS issues.

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const [, , command, ...args] = process.argv;

async function apiCall(body) {
  const res = await fetch(`${baseURL}/api/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function verifyViaAPI(scenarioId) {
  const res = await fetch(`${baseURL}/api/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'verify', scenarioId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

const ALL_SCENARIOS = ['checkout-5xx', 'billing-backfill', 'healthy-rollout', 'incident-handover'];

try {
  switch (command) {
    case 'load': {
      if (args[0] === '--all') {
        console.log('Loading all scenarios...\n');
        for (const id of ALL_SCENARIOS) {
          await apiCall({ action: 'load', scenarioId: id });
          console.log(`  ✓ ${id} loaded`);
        }
        console.log('\nAll scenarios loaded.');
      } else if (args[0]) {
        await apiCall({ action: 'load', scenarioId: args[0] });
        console.log(`✓ Scenario "${args[0]}" loaded.`);
      } else {
        console.error('Usage: scenario-cli.mjs load <scenario-id|--all>');
        process.exit(1);
      }
      break;
    }

    case 'verify': {
      const ids = args[0] === '--all' ? ALL_SCENARIOS : args[0] ? [args[0]] : ALL_SCENARIOS;
      let allPassed = true;

      for (const id of ids) {
        const result = await verifyViaAPI(id);
        console.log('\n' + '─'.repeat(60));
        console.log(result.summary);
        console.log('─'.repeat(60));

        for (const check of result.checks) {
          const icon = check.passed ? '  ✓' : '  ✗';
          console.log(`${icon}  ${check.name}`);
          if (!check.passed) {
            console.log(`     └─ ${check.detail}`);
          }
        }

        if (!result.passed) allPassed = false;
      }

      const passedCount = ids.length; // Will be recalculated below
      console.log('\n' + '═'.repeat(60));
      console.log(`최종: ${allPassed ? '전체 통과' : '실패 있음'}`);
      console.log('═'.repeat(60) + '\n');

      if (!allPassed) process.exit(1);
      break;
    }

    case 'reset': {
      await apiCall({ action: 'reset' });
      console.log('✓ Database reset complete.');
      break;
    }

    case 'list': {
      console.log('Available scenarios:\n');
      for (const id of ALL_SCENARIOS) {
        console.log(`  • ${id}`);
      }
      break;
    }

    default: {
      console.log(`
Scenario CLI — manage DevOps Console demo scenarios

Commands:
  load <id|--all>     Load scenario seed data
  verify <id|--all>   Verify scenario state in DB
  reset               Clear all DB data
  list                List available scenarios

Scenarios:
  checkout-5xx        장애 조사 → 롤백 실행
  billing-backfill    배치 작업 실행
  healthy-rollout     정상 배포 확인
  incident-handover   보고서 작성
`);
      if (command) {
        console.error(`Unknown command: "${command}"`);
        process.exit(1);
      }
    }
  }
} catch (err) {
  console.error('Error:', err.message);
  console.error('\nMake sure the dev server is running: npm run dev');
  process.exit(1);
}

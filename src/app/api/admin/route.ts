import { NextRequest, NextResponse } from 'next/server';
import { getDb, resetDatabase } from '@/server/db';
import { seed as seedCheckout5xx } from '@/server/scenarios/checkout-5xx';
import { seed as seedBillingBackfill } from '@/server/scenarios/billing-backfill';
import { seed as seedHealthyRollout } from '@/server/scenarios/healthy-rollout';
import { seed as seedIncidentHandover } from '@/server/scenarios/incident-handover';

const SCENARIO_SEEDS: Record<string, (db: ReturnType<typeof getDb>) => void> = {
  'checkout-5xx': seedCheckout5xx,
  'billing-backfill': seedBillingBackfill,
  'healthy-rollout': seedHealthyRollout,
  'incident-handover': seedIncidentHandover,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, scenarioId } = body as {
      action: 'load' | 'reset';
      scenarioId?: string;
    };

    if (!action || !['load', 'reset'].includes(action)) {
      return NextResponse.json(
        { error: "Missing or invalid 'action'. Must be 'load' or 'reset'." },
        { status: 400 }
      );
    }

    if (action === 'reset') {
      resetDatabase();
      return NextResponse.json({ success: true, message: 'Database reset successfully.' });
    }

    if (!scenarioId) {
      return NextResponse.json(
        { error: "Missing 'scenarioId' for load action.", availableScenarios: Object.keys(SCENARIO_SEEDS) },
        { status: 400 }
      );
    }

    const seedFn = SCENARIO_SEEDS[scenarioId];
    if (!seedFn) {
      return NextResponse.json(
        { error: `Unknown scenario '${scenarioId}'.`, availableScenarios: Object.keys(SCENARIO_SEEDS) },
        { status: 404 }
      );
    }

    const db = getDb();
    seedFn(db);

    return NextResponse.json({ success: true, message: `Scenario '${scenarioId}' loaded successfully.` });
  } catch (err) {
    console.error('[POST /api/admin]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to execute admin action: ${message}` }, { status: 500 });
  }
}

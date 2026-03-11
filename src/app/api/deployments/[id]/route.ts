import { NextRequest, NextResponse } from 'next/server';
import {
  getDeployment,
  getDeploymentDiffs,
  getDeploymentRiskChecks,
  getRollbackPlan,
  getRollbackSteps,
} from '@/server/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deployment = getDeployment(id);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const diffs = getDeploymentDiffs(id);
    const riskChecks = getDeploymentRiskChecks(id);
    const rollbackPlan = getRollbackPlan(id) as { id: string } | undefined;
    const rollbackSteps = rollbackPlan ? getRollbackSteps(rollbackPlan.id) : [];

    return NextResponse.json({
      ...deployment,
      diffs,
      riskChecks,
      rollbackPlan: rollbackPlan ? { ...rollbackPlan, steps: rollbackSteps } : null,
    });
  } catch (err) {
    console.error('[GET /api/deployments/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch deployment' }, { status: 500 });
  }
}

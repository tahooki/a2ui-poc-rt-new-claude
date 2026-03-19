import { NextRequest, NextResponse } from 'next/server';
import { getDeploymentRun, getDeploymentRunEvents } from '@/server/db';

type DeploymentRunEventRecord = Record<string, unknown>;

function mapDeploymentRunEvent(record: DeploymentRunEventRecord) {
  return {
    id: String(record.id ?? ''),
    deploymentRunId: String(record.deployment_run_id ?? ''),
    stage: String(record.stage ?? 'pending'),
    detail: String(record.detail ?? ''),
    progressPercent: Number(record.progress_percent ?? 0),
    createdAt: String(record.created_at ?? ''),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const run = getDeploymentRun(id);
    if (!run) {
      return NextResponse.json({ error: 'Deployment run not found' }, { status: 404 });
    }

    const events = (getDeploymentRunEvents(id) as DeploymentRunEventRecord[]).map(mapDeploymentRunEvent);
    return NextResponse.json(events);
  } catch (err) {
    console.error('[GET /api/deployment-runs/[id]/events]', err);
    return NextResponse.json({ error: 'Failed to fetch deployment run events' }, { status: 500 });
  }
}

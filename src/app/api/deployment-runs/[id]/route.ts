import { NextRequest, NextResponse } from 'next/server';
import { getDeploymentRun } from '@/server/db';

type DeploymentRunRecord = Record<string, unknown>;

function mapDeploymentRun(record: DeploymentRunRecord) {
  return {
    id: String(record.id ?? ''),
    artifactId: String(record.artifact_id ?? ''),
    serviceId: String(record.service_id ?? ''),
    environment: String(record.environment ?? ''),
    strategy: String(record.strategy ?? 'canary_10_50_100'),
    status: String(record.status ?? 'pending'),
    progressPercent: Number(record.progress_percent ?? 0),
    currentStage: String(record.current_stage ?? 'pending'),
    startedBy: String(record.started_by ?? ''),
    resultDeploymentId: record.result_deployment_id === null ? null : String(record.result_deployment_id ?? ''),
    createdAt: String(record.created_at ?? ''),
    updatedAt: String(record.updated_at ?? ''),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const run = getDeploymentRun(id) as DeploymentRunRecord | undefined;
    if (!run) {
      return NextResponse.json({ error: 'Deployment run not found' }, { status: 404 });
    }

    return NextResponse.json(mapDeploymentRun(run));
  } catch (err) {
    console.error('[GET /api/deployment-runs/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch deployment run' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  createDeploymentRun,
  createDeploymentRunEvent,
  getDb,
  getDeploymentArtifact,
  getOperator,
  updateDeploymentArtifact,
} from '@/server/db';

type DeploymentArtifactRecord = Record<string, unknown>;
type DeploymentRunRecord = Record<string, unknown>;

const VALID_ENVIRONMENTS = ['production', 'staging', 'development'] as const;

function quickDeployServiceSlug(serviceId: string, serviceName: string) {
  const base = serviceId.replace(/^svc_/, '') || serviceName;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'service'
  );
}

function mapDeploymentRun(record: DeploymentRunRecord, deploymentId: string | null) {
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
    deploymentId,
    createdAt: String(record.created_at ?? ''),
    updatedAt: String(record.updated_at ?? ''),
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = (await req.json()) as {
      artifactId?: string;
      environment?: (typeof VALID_ENVIRONMENTS)[number];
      strategy?: string;
      actorId?: string;
    };

    if (!body.artifactId?.trim() || !body.environment?.trim() || !body.actorId?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: artifactId, environment, actorId' },
        { status: 400 },
      );
    }

    if (!VALID_ENVIRONMENTS.includes(body.environment)) {
      return NextResponse.json(
        { error: `Invalid environment: ${body.environment}. Valid: ${VALID_ENVIRONMENTS.join(', ')}` },
        { status: 400 },
      );
    }

    const actorId = body.actorId;
    const environment = body.environment as (typeof VALID_ENVIRONMENTS)[number];
    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }

    const artifactId = body.artifactId;
    const artifact = getDeploymentArtifact(artifactId) as DeploymentArtifactRecord | undefined;
    if (!artifact) {
      return NextResponse.json({ error: 'Deployment artifact not found' }, { status: 404 });
    }

    const serviceId = String(artifact.service_id ?? '');
    const serviceName = serviceId.replace(/^svc_/, '') || serviceId;
    const sourceVersion = String(artifact.source_version ?? '');
    const imageTag = String(artifact.image_tag ?? '');
    const imageVersion = imageTag || sourceVersion;
    const deploymentId = `dep_${quickDeployServiceSlug(serviceId, serviceName)}_${body.environment}_${Date.now()}`;
    const now = new Date().toISOString();
    const db = getDb();
    let createdRun: DeploymentRunRecord | undefined;

    db.transaction(() => {
      if (String(artifact.status ?? '') !== 'ready') {
        updateDeploymentArtifact(body.artifactId as string, {
          status: 'ready',
          updatedAt: now,
        });
      }

      db.prepare(
        `INSERT INTO deployments
          (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'running', 10, ?, ?, ?)`,
      ).run(
        deploymentId,
        serviceId,
        environment,
        imageVersion,
        sourceVersion,
        actorId,
        now,
        now,
      );

      createdRun = createDeploymentRun({
        artifactId,
        serviceId,
        environment,
        strategy: body.strategy ?? 'canary_10_50_100',
        status: 'deploying',
        progressPercent: 10,
        currentStage: 'canary_10',
        startedBy: actorId,
        resultDeploymentId: deploymentId,
        createdAt: now,
        updatedAt: now,
      }) as DeploymentRunRecord | undefined;

      createDeploymentRunEvent({
        deploymentRunId: String(createdRun?.id ?? ''),
        stage: 'canary_10',
        detail: `배포가 시작되었습니다. ${imageVersion} 이미지가 ${environment} 환경으로 롤아웃됩니다.`,
        progressPercent: 10,
        createdAt: now,
      });

      db.prepare(
        `INSERT INTO audit_logs
          (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'deployment_run', ?, ?, 'success', ?)`,
      ).run(
        crypto.randomUUID(),
        requestId,
        actorId,
        actor.role,
        'deployment_run_create',
        String(createdRun?.id ?? ''),
        `Quick deploy run started for ${artifactId}`,
        now,
      );
    })();

    if (!createdRun) {
      return NextResponse.json({ error: 'Failed to create deployment run' }, { status: 500 });
    }

    return NextResponse.json(mapDeploymentRun(createdRun, deploymentId), { status: 201 });
  } catch (err) {
    console.error('[POST /api/deployment-runs]', err);
    return NextResponse.json({ error: 'Failed to create deployment run' }, { status: 500 });
  }
}

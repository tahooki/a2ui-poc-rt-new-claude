import { NextRequest, NextResponse } from 'next/server';
import {
  createDeploymentArtifact,
  getAllDeploymentArtifacts,
  getDb,
  getDeployment,
  getOperator,
  getService,
} from '@/server/db';

type DeploymentArtifactRecord = Record<string, unknown>;

function quickDeployServiceSlug(serviceId: string, serviceName: string) {
  const base = serviceId.replace(/^svc_/, '') || serviceName;
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'service'
  );
}

function quickDeployImageTag(
  serviceId: string,
  serviceName: string,
  sourceVersion: string,
  revision: number,
) {
  const version = sourceVersion.replace(/^v/, '') || 'latest';
  return `${quickDeployServiceSlug(serviceId, serviceName)}:${version}-r${revision}`;
}

function mapDeploymentArtifact(record: DeploymentArtifactRecord) {
  return {
    id: String(record.id ?? ''),
    serviceId: String(record.service_id ?? ''),
    sourceDeploymentId: String(record.source_deployment_id ?? ''),
    sourceVersion: String(record.source_version ?? ''),
    imageUri: String(record.image_uri ?? ''),
    imageTag: String(record.image_tag ?? ''),
    gitSha: String(record.git_sha ?? ''),
    status: String(record.status ?? 'pending'),
    createdBy: String(record.created_by ?? ''),
    createdAt: String(record.created_at ?? ''),
    updatedAt: String(record.updated_at ?? ''),
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = (await req.json()) as {
      sourceDeploymentId?: string;
      actorId?: string;
      gitSha?: string;
    };

    if (!body.sourceDeploymentId?.trim() || !body.actorId?.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceDeploymentId, actorId' },
        { status: 400 },
      );
    }

    const actorId = body.actorId;
    const sourceDeploymentId = body.sourceDeploymentId;
    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }

    const sourceDeployment = getDeployment(sourceDeploymentId) as
      | DeploymentArtifactRecord
      | undefined;
    if (!sourceDeployment) {
      return NextResponse.json({ error: 'Source deployment not found' }, { status: 404 });
    }

    const serviceId = String(sourceDeployment.service_id ?? '');
    const service = getService(serviceId) as DeploymentArtifactRecord | undefined;
    const serviceName = String(service?.name ?? serviceId);
    const sourceVersion = String(sourceDeployment.version ?? '');
    const revision =
      ((getAllDeploymentArtifacts({ sourceDeploymentId }) as DeploymentArtifactRecord[]).length || 0) + 1;
    const imageTag = quickDeployImageTag(serviceId, serviceName, sourceVersion, revision);
    const imageUri = `registry.local/${imageTag}`;
    const now = new Date().toISOString();

    const db = getDb();
    let createdArtifact: DeploymentArtifactRecord | undefined;

    db.transaction(() => {
      createdArtifact = createDeploymentArtifact({
        serviceId,
        sourceDeploymentId,
        sourceVersion,
        imageUri,
        imageTag,
        gitSha: body.gitSha ?? '',
        status: 'ready',
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      }) as DeploymentArtifactRecord | undefined;

      db.prepare(
        `INSERT INTO audit_logs
          (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'deployment_artifact', ?, ?, 'success', ?)`,
      ).run(
        crypto.randomUUID(),
        requestId,
        actorId,
        actor.role,
        'deployment_artifact_create',
        String(createdArtifact?.id ?? ''),
        `Quick deploy artifact created from ${sourceDeploymentId}`,
        now,
      );
    })();

    if (!createdArtifact) {
      return NextResponse.json({ error: 'Failed to create deployment artifact' }, { status: 500 });
    }

    return NextResponse.json(mapDeploymentArtifact(createdArtifact), { status: 201 });
  } catch (err) {
    console.error('[POST /api/deployment-artifacts]', err);
    return NextResponse.json({ error: 'Failed to create deployment artifact' }, { status: 500 });
  }
}

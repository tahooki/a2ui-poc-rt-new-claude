import { NextRequest, NextResponse } from 'next/server';
import {
  createDeploymentArtifact,
  createDeploymentRun,
  createDeploymentRunEvent,
  getAllDeployments,
  getAllDeploymentArtifacts,
  getAllDeploymentRuns,
  getDb,
  getDeployment,
  getDeploymentArtifact,
  getDeploymentRequest,
  getDeploymentRun,
  getLatestDeploymentArtifactForDeployment,
  getLatestDeploymentRunForDeployment,
  getOperator,
  getRollbackPlan,
  getService,
  updateDeploymentArtifact,
  updateDeploymentRun,
} from '@/server/db';
import { renderTemplatePreview } from '@/server/a2ui';

/**
 * A2UI Action Handler
 *
 * Receives button clicks from A2UI cards in the chat and routes them
 * to the appropriate domain mutation API internally.
 *
 * POST /api/a2ui-action
 * Body: { actionName: string, context: Record<string, string>, actorId: string }
 */

interface ActionRequest {
  actionName: string;
  context: Record<string, string>;
  actorId: string;
}

function createDeploymentRecordFromRequest(input: {
  request: Record<string, unknown>;
  actorId: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const requestId = String(input.request['id'] ?? '');
  const baselineDeploymentId = String(input.request['baseline_deployment_id'] ?? '');
  const baseline = getDeployment(baselineDeploymentId) as Record<string, unknown> | undefined;
  if (!baseline) {
    throw new Error(`기준 배포를 찾을 수 없습니다: ${baselineDeploymentId}`);
  }

  const serviceId = String(input.request['service_id'] ?? baseline['service_id'] ?? '');
  const environment = String(input.request['environment'] ?? baseline['environment'] ?? 'production');
  const targetVersion = String(input.request['target_version'] ?? baseline['version'] ?? '');
  const deploymentId = `dep_${serviceId.replace(/^svc_/, '')}_${environment}_${Date.now()}`;

  db.prepare(
    `INSERT INTO deployments
      (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'running', 10, ?, ?, ?)`,
  ).run(
    deploymentId,
    serviceId,
    environment,
    targetVersion,
    String(baseline['version'] ?? targetVersion),
    input.actorId,
    now,
    now,
  );

  db.prepare(
    `UPDATE deployment_requests
      SET status = 'started', approved_by = ?, result_deployment_id = ?, updated_at = ?
     WHERE id = ?`,
  ).run(input.actorId, deploymentId, now, requestId);

  return {
    deploymentId,
    serviceId,
    environment,
    targetVersion,
  };
}

function createDeploymentRequest(input: {
  serviceId: string;
  environment: string;
  baselineDeploymentId: string;
  targetVersion: string;
  strategy: string;
  status: 'draft' | 'approval_requested' | 'started';
  requestedBy: string;
  note: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO deployment_requests
      (id, service_id, environment, baseline_deployment_id, target_version, strategy, status, requested_by, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    requestId,
    input.serviceId,
    input.environment,
    input.baselineDeploymentId,
    input.targetVersion,
    input.strategy,
    input.status,
    input.requestedBy,
    input.note,
    now,
    now,
  );
  return getDeploymentRequest(requestId) as Record<string, unknown> | undefined;
}

function quickDeployServiceSlug(serviceId: string, serviceName: string) {
  const base = serviceId.replace(/^svc_/, '') || serviceName;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'service';
}

function quickDeployImageTag(serviceId: string, serviceName: string, sourceVersion: string, revision: number) {
  const version = sourceVersion.replace(/^v/, '') || 'latest';
  return `${quickDeployServiceSlug(serviceId, serviceName)}:${version}-r${revision}`;
}

function quickDeployProgressStep(progress: number) {
  if (progress < 40) return { progress: 40, stage: 'canary_10', status: 'deploying' as const, detail: 'canary 10% 구간을 통과했습니다.' };
  if (progress < 70) return { progress: 70, stage: 'canary_50', status: 'deploying' as const, detail: 'canary 50% 구간으로 확장했습니다.' };
  if (progress < 85) return { progress: 85, stage: 'verifying', status: 'verifying' as const, detail: '배포 검증 단계로 이동했습니다.' };
  return { progress: 100, stage: 'completed', status: 'succeeded' as const, detail: '배포가 성공적으로 완료되었습니다.' };
}

function resolveQuickDeployDeploymentContext(input: {
  deploymentId?: string;
  baselineDeploymentId?: string;
  artifactId?: string;
  deployRunId?: string;
}) {
  const deploymentId = input.deploymentId ?? input.baselineDeploymentId ?? '';
  const baseline = deploymentId ? (getDeployment(deploymentId) as Record<string, unknown> | undefined) : undefined;
  const artifact =
    input.artifactId
      ? (getDeploymentArtifact(input.artifactId) as Record<string, unknown> | undefined)
      : deploymentId
        ? (getLatestDeploymentArtifactForDeployment(deploymentId) as Record<string, unknown> | undefined)
        : undefined;
  const run =
    input.deployRunId
      ? (getDeploymentRun(input.deployRunId) as Record<string, unknown> | undefined)
      : deploymentId
        ? (getLatestDeploymentRunForDeployment(deploymentId) as Record<string, unknown> | undefined)
        : undefined;

  return { baseline, artifact, run, deploymentId };
}

// Internal fetch helper to call sibling API routes
async function internalFetch(
  path: string,
  method: string,
  body: Record<string, unknown>,
  req: NextRequest,
): Promise<{ status: number; data: unknown }> {
  const origin = req.nextUrl.origin;
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// Action handlers
const handlers: Record<
  string,
  (ctx: Record<string, string>, actorId: string, req: NextRequest) => Promise<{ message: string; data?: unknown }>
> = {
  // ── Rollback actions ──
  async execute_dry_run(ctx, actorId, req) {
    const { deploymentId } = ctx;
    const res = await internalFetch(
      `/api/deployments/${deploymentId}/rollback`,
      'PATCH',
      { action: 'dry-run', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`Dry-run 실행 실패: ${JSON.stringify(res.data)}`);
    return { message: 'Dry-run이 성공적으로 실행되었습니다.', data: res.data };
  },

  async request_approval(ctx, actorId, req) {
    const { deploymentId } = ctx;
    const res = await internalFetch(
      `/api/deployments/${deploymentId}/rollback`,
      'PATCH',
      { action: 'approve', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`승인 요청 실패: ${JSON.stringify(res.data)}`);
    return { message: '롤백이 승인되었습니다.', data: res.data };
  },

  async execute_rollback(ctx, actorId, req) {
    const { deploymentId } = ctx;
    if (!deploymentId) {
      throw new Error('롤백 실행에는 deploymentId가 필요합니다.');
    }

    const deployment = getDeployment(deploymentId) as Record<string, unknown> | undefined;
    if (!deployment) {
      throw new Error(`배포를 찾을 수 없습니다: ${deploymentId}`);
    }

    const targetVersion = String(deployment['previous_version'] ?? '').trim();
    if (!targetVersion) {
      throw new Error('이전 버전 정보가 없어 롤백을 실행할 수 없습니다.');
    }

    let plan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    let lastResponse: { status: number; data: unknown } | null = null;

    if (!plan) {
      lastResponse = await internalFetch(
        `/api/deployments/${deploymentId}/rollback`,
        'POST',
        { targetVersion, actorId },
        req,
      );
      if (lastResponse.status >= 400) {
        throw new Error(`롤백 계획 생성 실패: ${JSON.stringify(lastResponse.data)}`);
      }
      plan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    }

    const currentStatus = String(plan?.['status'] ?? '');
    if (currentStatus === 'executed') {
      return { message: '이미 롤백이 완료된 배포입니다.', data: plan };
    }

    if (currentStatus === 'draft') {
      lastResponse = await internalFetch(
        `/api/deployments/${deploymentId}/rollback`,
        'PATCH',
        { action: 'dry-run', actorId },
        req,
      );
      if (lastResponse.status >= 400) {
        throw new Error(`롤백 dry-run 실패: ${JSON.stringify(lastResponse.data)}`);
      }
      plan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    }

    if (String(plan?.['status'] ?? '') === 'dry_run_ready') {
      lastResponse = await internalFetch(
        `/api/deployments/${deploymentId}/rollback`,
        'PATCH',
        { action: 'approve', actorId },
        req,
      );
      if (lastResponse.status >= 400) {
        throw new Error(`롤백 승인 실패: ${JSON.stringify(lastResponse.data)}`);
      }
      plan = getRollbackPlan(deploymentId) as Record<string, unknown> | undefined;
    }

    lastResponse = await internalFetch(
      `/api/deployments/${deploymentId}/rollback`,
      'PATCH',
      { action: 'execute', actorId },
      req,
    );
    if (lastResponse.status >= 400) {
      throw new Error(`롤백 실행 실패: ${JSON.stringify(lastResponse.data)}`);
    }
    return { message: '롤백이 성공적으로 실행되었습니다.', data: lastResponse.data };
  },

  async view_rollback_candidate(ctx, _actorId, req) {
    const deploymentId = ctx.deploymentId ?? ctx.candidateId;
    if (!deploymentId) {
      throw new Error('롤백 후보를 열람하려면 deploymentId 또는 candidateId가 필요합니다.');
    }

    const res = await internalFetch(
      `/api/deployments/${deploymentId}`,
      'GET',
      {},
      req,
    );
    if (res.status >= 400) throw new Error(`롤백 후보 열람 실패: ${JSON.stringify(res.data)}`);
    return { message: '롤백 후보 상세를 열람했습니다.', data: res.data };
  },

  async quick_deploy_create_draft(ctx, actorId, _req) {
    const baselineDeploymentId = ctx.baselineDeploymentId ?? ctx.deploymentId;
    if (!baselineDeploymentId) {
      throw new Error('배포 초안 생성을 위해 기준 배포 ID가 필요합니다.');
    }
    const baseline = getDeployment(baselineDeploymentId) as Record<string, unknown> | undefined;
    if (!baseline) {
      throw new Error(`기준 배포를 찾을 수 없습니다: ${baselineDeploymentId}`);
    }

    const request = createDeploymentRequest({
      serviceId: String(ctx.serviceId ?? baseline['service_id'] ?? ''),
      environment: String(ctx.environment ?? baseline['environment'] ?? 'production'),
      baselineDeploymentId,
      targetVersion: String(ctx.targetVersion ?? baseline['version'] ?? ''),
      strategy: String(ctx.strategy ?? 'canary_10_50_100'),
      status: 'draft',
      requestedBy: actorId,
      note: String(ctx.note ?? ''),
    });

    return { message: '배포 초안을 생성했습니다.', data: request };
  },

  async create_deploy_draft(ctx, actorId, req) {
    return handlers.quick_deploy_create_draft(ctx, actorId, req);
  },

  async quick_deploy_request_approval(ctx, actorId, req) {
    const draftResult = await handlers.quick_deploy_create_draft(ctx, actorId, req);
    const request = draftResult.data as Record<string, unknown> | undefined;
    if (!request?.id) {
      throw new Error('승인 요청을 위한 초안 생성에 실패했습니다.');
    }

    getDb().prepare(
      `UPDATE deployment_requests SET status = 'approval_requested', updated_at = ? WHERE id = ?`,
    ).run(new Date().toISOString(), String(request.id));

    const updated = getDeploymentRequest(String(request.id));
    return { message: '배포 승인 요청을 생성했습니다.', data: updated };
  },

  async request_deploy_approval(ctx, actorId, req) {
    return handlers.quick_deploy_request_approval(ctx, actorId, req);
  },

  async quick_deploy_start_now(ctx, actorId, req) {
    const draftResult = await handlers.quick_deploy_create_draft(ctx, actorId, req);
    const request = draftResult.data as Record<string, unknown> | undefined;
    if (!request) {
      throw new Error('즉시 시작할 배포 초안을 생성하지 못했습니다.');
    }

    const started = createDeploymentRecordFromRequest({ request, actorId });
    return { message: '새 배포를 시작했습니다.', data: { requestId: request.id, ...started } };
  },

  async start_quick_deploy(ctx, actorId, req) {
    return handlers.quick_deploy_start_now(ctx, actorId, req);
  },

  async build_deploy_artifact(ctx, actorId, _req) {
    const baselineDeploymentId = ctx.baselineDeploymentId ?? ctx.deploymentId;
    if (!baselineDeploymentId) {
      throw new Error('이미지 생성에는 baselineDeploymentId가 필요합니다.');
    }

    const baseline = getDeployment(baselineDeploymentId) as Record<string, unknown> | undefined;
    if (!baseline) {
      throw new Error(`기준 배포를 찾을 수 없습니다: ${baselineDeploymentId}`);
    }

    const serviceId = String(ctx.serviceId ?? baseline['service_id'] ?? '');
    const service = getService(serviceId) as Record<string, unknown> | undefined;
    const serviceName = String(service?.['name'] ?? serviceId);
    const sourceVersion = String(ctx.sourceVersion ?? baseline['version'] ?? '');
    const existingArtifacts = getAllDeploymentArtifacts({ sourceDeploymentId: baselineDeploymentId }) as Array<Record<string, unknown>>;
    const revision = existingArtifacts.length + 1;
    const imageTag = quickDeployImageTag(serviceId, serviceName, sourceVersion, revision);
    const imageUri = `registry.local/${imageTag}`;
    const artifact = createDeploymentArtifact({
      serviceId,
      sourceDeploymentId: baselineDeploymentId,
      sourceVersion,
      imageTag,
      imageUri,
      gitSha: String(ctx.gitSha ?? ''),
      status: 'ready',
      createdBy: actorId,
    }) as Record<string, unknown> | undefined;

    return {
      message: '이미지 생성이 완료되었습니다.',
      data: {
        baselineDeploymentId,
        artifact,
      },
    };
  },

  async start_deploy_run(ctx, actorId, _req) {
    const baselineDeploymentId = ctx.baselineDeploymentId ?? ctx.deploymentId;
    if (!baselineDeploymentId) {
      throw new Error('배포 실행에는 baselineDeploymentId가 필요합니다.');
    }

    const baseline = getDeployment(baselineDeploymentId) as Record<string, unknown> | undefined;
    if (!baseline) {
      throw new Error(`기준 배포를 찾을 수 없습니다: ${baselineDeploymentId}`);
    }

    const serviceId = String(ctx.serviceId ?? baseline['service_id'] ?? '');
    const service = getService(serviceId) as Record<string, unknown> | undefined;
    const serviceName = String(service?.['name'] ?? serviceId);
    const environment = String(ctx.environment ?? baseline['environment'] ?? 'production') as
      | 'production'
      | 'staging'
      | 'development';
    const strategy = String(ctx.strategy ?? 'canary_10_50_100');
    const sourceVersion = String(ctx.sourceVersion ?? baseline['version'] ?? '');
    let artifact = ctx.artifactId
      ? (getDeploymentArtifact(ctx.artifactId) as Record<string, unknown> | undefined)
      : (getLatestDeploymentArtifactForDeployment(baselineDeploymentId) as Record<string, unknown> | undefined);

    if (!artifact) {
      const imageTag = quickDeployImageTag(serviceId, serviceName, sourceVersion, 1);
      artifact = createDeploymentArtifact({
        serviceId,
        sourceDeploymentId: baselineDeploymentId,
        sourceVersion,
        imageTag,
        imageUri: `registry.local/${imageTag}`,
        status: 'ready',
        createdBy: actorId,
      }) as Record<string, unknown> | undefined;
    } else if (String(artifact['status'] ?? '') !== 'ready') {
      artifact = updateDeploymentArtifact(String(artifact['id'] ?? ''), {
        status: 'ready',
      }) as Record<string, unknown> | undefined;
    }

    if (!artifact?.['id']) {
      throw new Error('배포 이미지를 준비하지 못했습니다.');
    }

    const deploymentId = `dep_${serviceId.replace(/^svc_/, '') || 'service'}_${environment}_${Date.now()}`;
    const version = String(artifact['image_tag'] ?? artifact['imageTag'] ?? sourceVersion);
    getDb().prepare(
      `INSERT INTO deployments
        (id, service_id, environment, version, previous_version, status, rollout_percent, deployed_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', 10, ?, ?, ?)`,
    ).run(
      deploymentId,
      serviceId,
      environment,
      version,
      sourceVersion,
      actorId,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const run = createDeploymentRun({
      artifactId: String(artifact['id']),
      serviceId,
      environment,
      strategy,
      status: 'deploying',
      progressPercent: 10,
      currentStage: 'canary_10',
      startedBy: actorId,
      resultDeploymentId: deploymentId,
    }) as Record<string, unknown> | undefined;

    createDeploymentRunEvent({
      deploymentRunId: String(run?.['id'] ?? ''),
      stage: 'canary_10',
      detail: `배포가 시작되었습니다. ${version} 이미지가 ${environment} 환경으로 롤아웃됩니다.`,
      progressPercent: 10,
    });

    return {
      message: '배포가 시작되었습니다.',
      data: {
        artifact,
        deployRun: run,
        deploymentId,
      },
    };
  },

  async refresh_deploy_status(ctx, _actorId, _req) {
    const resolved = resolveQuickDeployDeploymentContext({
      deploymentId: ctx.deploymentId,
      baselineDeploymentId: ctx.baselineDeploymentId,
      artifactId: ctx.artifactId,
      deployRunId: ctx.deployRunId,
    });
    if (!resolved.run?.['id']) {
      throw new Error('갱신할 배포 실행을 찾을 수 없습니다.');
    }

    const runId = String(resolved.run['id']);
    const currentProgress = Number(resolved.run['progress_percent'] ?? 0);
    const currentStatus = String(resolved.run['status'] ?? 'pending');
    if (['failed', 'rolled_back', 'succeeded'].includes(currentStatus)) {
      return {
        message: '이미 종료된 배포입니다.',
        data: {
          deployRun: resolved.run,
          artifact: resolved.artifact,
        },
      };
    }

    const step = quickDeployProgressStep(currentProgress);
    const updatedRun = updateDeploymentRun(runId, {
      status: step.status,
      progressPercent: step.progress,
      currentStage: step.stage,
    }) as Record<string, unknown> | undefined;

    const deploymentId =
      String(updatedRun?.['result_deployment_id'] ?? resolved.run['result_deployment_id'] ?? ctx.deploymentId ?? '');
    if (deploymentId) {
      getDb().prepare(
        `UPDATE deployments
         SET status = ?, rollout_percent = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        step.status === 'succeeded' ? 'succeeded' : 'running',
        step.progress,
        new Date().toISOString(),
        deploymentId,
      );
    }

    createDeploymentRunEvent({
      deploymentRunId: runId,
      stage: step.stage,
      detail: step.detail,
      progressPercent: step.progress,
    });

    return {
      message: '배포 상태를 갱신했습니다.',
      data: {
        deployRun: updatedRun,
        artifact: resolved.artifact,
        deploymentId,
      },
    };
  },

  async open_rollback_candidates(ctx, actorId, _req) {
    const resolved = resolveQuickDeployDeploymentContext({
      deploymentId: ctx.deploymentId,
      baselineDeploymentId: ctx.baselineDeploymentId,
      artifactId: ctx.artifactId,
      deployRunId: ctx.deployRunId,
    });

    const targetDeploymentId =
      String(resolved.run?.['result_deployment_id'] ?? resolved.deploymentId ?? ctx.deploymentId ?? '');
    if (!targetDeploymentId) {
      return {
        message: '롤백 후보를 찾지 못했습니다.',
        data: {
          type: 'a2ui_render',
          cardType: 'rollback_action',
          cardData: {
            deploymentId: '',
            serviceId: '',
            environment: '',
            candidates: [],
          },
        },
      };
    }

    const deployment = getDeployment(targetDeploymentId) as Record<string, unknown> | undefined;
    if (!deployment) {
      return {
        message: '롤백 후보를 찾지 못했습니다.',
        data: {
          type: 'a2ui_render',
          cardType: 'rollback_action',
          cardData: {
            deploymentId: targetDeploymentId,
            serviceId: '',
            environment: '',
            candidates: [],
          },
        },
      };
    }

    const preview = await renderTemplatePreview({
      templateId: 'tpl_rollback_action',
      args: {
        deploymentId: targetDeploymentId,
      },
      // Reuse the seeded rollback candidate source and preserve the current operator context.
      context: (() => {
        const operator = getOperator(actorId) as Record<string, unknown> | undefined;
        return {
          actorId,
          actorRole: String(operator?.['role'] ?? 'ops_engineer'),
          page: 'deployments',
        };
      })(),
      missingLabel: '롤백 실행',
    });

    return {
      message: '롤백 후보를 확인했습니다. 롤백 실행 카드를 열었습니다.',
      data: preview.output,
    };
  },

  async approve_deploy_request(ctx, actorId, _req) {
    const requestId =
      ctx.requestId ?? ctx.deployRequestId ?? ctx.candidateId ?? ctx.deploymentId;
    if (!requestId) {
      throw new Error('배포 승인에는 requestId가 필요합니다.');
    }
    const request = getDeploymentRequest(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      throw new Error(`배포 요청을 찾을 수 없습니다: ${requestId}`);
    }

    const started = createDeploymentRecordFromRequest({ request, actorId });
    return { message: '배포를 승인하고 즉시 시작했습니다.', data: { requestId, ...started } };
  },

  async approve_deployment_request(ctx, actorId, req) {
    return handlers.approve_deploy_request(ctx, actorId, req);
  },

  async hold_deploy_request(ctx, actorId, _req) {
    const requestId =
      ctx.requestId ?? ctx.deployRequestId ?? ctx.candidateId ?? ctx.deploymentId;
    if (!requestId) {
      throw new Error('배포 보류에는 requestId가 필요합니다.');
    }
    const request = getDeploymentRequest(requestId) as Record<string, unknown> | undefined;
    if (!request) {
      throw new Error(`배포 요청을 찾을 수 없습니다: ${requestId}`);
    }

    getDb().prepare(
      `UPDATE deployment_requests SET status = 'held', approved_by = ?, updated_at = ? WHERE id = ?`,
    ).run(actorId, new Date().toISOString(), requestId);

    return { message: '배포 요청을 보류했습니다.', data: getDeploymentRequest(requestId) };
  },

  async view_deploy_request(ctx, _actorId, _req) {
    const requestId =
      ctx.requestId ?? ctx.deployRequestId ?? ctx.candidateId ?? ctx.deploymentId;
    if (!requestId) {
      throw new Error('배포 요청을 열람하려면 requestId가 필요합니다.');
    }
    const request = getDeploymentRequest(requestId);
    if (!request) {
      throw new Error(`배포 요청을 찾을 수 없습니다: ${requestId}`);
    }
    return { message: '배포 요청 상세를 열람했습니다.', data: request };
  },

  async view_deployment_request(ctx, actorId, req) {
    return handlers.view_deploy_request(ctx, actorId, req);
  },

  async open_deployments_page(_ctx, _actorId, _req) {
    return { message: '배포 페이지에서 추가 설정을 진행할 수 있습니다.' };
  },

  async select_deploy_baseline(_ctx, _actorId, _req) {
    return { message: '이 기준 배포를 선택했습니다. 카드가 새 기준으로 갱신되도록 설계된 액션입니다.' };
  },

  async confirm_rollback(ctx, actorId, req) {
    return handlers.execute_rollback(ctx, actorId, req);
  },

  // ── Dry-run stepper actions ──
  async dry_run_next_step(ctx, _actorId, _req) {
    // Progress to next step in dry-run (simulated — steps are updated on dry-run completion)
    const { planId } = ctx;
    const db = getDb();
    const pendingStep = db
      .prepare(
        `SELECT id FROM rollback_steps WHERE rollback_plan_id = ? AND status = 'pending' ORDER BY step_order LIMIT 1`,
      )
      .get(planId) as { id: string } | undefined;

    if (!pendingStep) {
      return { message: 'Dry-run의 모든 단계가 이미 완료되었습니다.' };
    }

    db.prepare(`UPDATE rollback_steps SET status = 'completed' WHERE id = ?`).run(pendingStep.id);
    return { message: '다음 단계로 진행했습니다.' };
  },

  async dry_run_confirm(ctx, actorId, req) {
    return handlers.execute_dry_run(ctx, actorId, req);
  },

  // ── Job actions ──
  async execute_job_dryrun(ctx, actorId, req) {
    const { jobRunId } = ctx;
    const res = await internalFetch(
      `/api/jobs/${jobRunId}`,
      'PATCH',
      { action: 'dry-run', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`Job dry-run 실패: ${JSON.stringify(res.data)}`);
    return { message: 'Job dry-run이 실행되었습니다.', data: res.data };
  },

  async approve_job(ctx, actorId, req) {
    const { jobRunId } = ctx;
    const res = await internalFetch(
      `/api/jobs/${jobRunId}`,
      'PATCH',
      { action: 'approve', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`Job 승인 실패: ${JSON.stringify(res.data)}`);
    return { message: 'Job이 승인되었습니다.', data: res.data };
  },

  async execute_job(ctx, actorId, req) {
    const { jobRunId } = ctx;
    const res = await internalFetch(
      `/api/jobs/${jobRunId}`,
      'PATCH',
      { action: 'execute', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`Job 실행 실패: ${JSON.stringify(res.data)}`);
    return { message: 'Job이 실행을 시작했습니다.', data: res.data };
  },

  async confirm_job_execute(ctx, actorId, req) {
    return handlers.execute_job(ctx, actorId, req);
  },

  // ── Incident actions ──
  async confirm_incident_close(ctx, actorId, req) {
    const { incidentId } = ctx;
    const res = await internalFetch(
      `/api/incidents/${incidentId}/status`,
      'PATCH',
      { status: 'closed', reason: 'A2UI 카드를 통한 인시던트 종료', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`인시던트 종료 실패: ${JSON.stringify(res.data)}`);
    return { message: '인시던트가 종료되었습니다.', data: res.data };
  },

  // ── Report actions ──
  async generate_report(ctx, actorId, req) {
    const { incidentId, reportType } = ctx;
    const res = await internalFetch(
      '/api/reports',
      'POST',
      {
        type: reportType === 'incident_postmortem' ? 'postmortem' : reportType === 'weekly_ops' ? 'handover' : 'incident_update',
        title: `[${reportType}] 자동 생성 보고서`,
        incidentId,
        actorId,
      },
      req,
    );
    if (res.status >= 400) throw new Error(`보고서 생성 실패: ${JSON.stringify(res.data)}`);
    return { message: '보고서가 생성되었습니다.', data: res.data };
  },

  // ── Cancel ──
  async cancel_action(_ctx, _actorId, _req) {
    return { message: '작업이 취소되었습니다.' };
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActionRequest;
    const { actionName, context, actorId } = body;

    if (!actionName || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: actionName, actorId' },
        { status: 400 },
      );
    }

    // Validate actor
    const actor = getOperator(actorId);
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }

    const handler = handlers[actionName];
    if (!handler) {
      return NextResponse.json(
        { error: `Unknown action: "${actionName}"`, availableActions: Object.keys(handlers) },
        { status: 400 },
      );
    }

    const result = await handler(context ?? {}, actorId, req);

    // Log the action execution
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result)
       VALUES (?, ?, ?, ?, ?, 'a2ui_action', ?, ?, 'success')`,
    ).run(
      crypto.randomUUID(),
      crypto.randomUUID(),
      actorId,
      (actor as Record<string, unknown>)['role'] ?? 'unknown',
      `a2ui_${actionName}`,
      context?.deploymentId ??
        context?.candidateId ??
        context?.requestId ??
        context?.deployRequestId ??
        context?.jobRunId ??
        context?.incidentId ??
        actionName,
      `A2UI card action: ${actionName}`,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/a2ui-action]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

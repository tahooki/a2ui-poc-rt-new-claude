import { NextRequest, NextResponse } from 'next/server';
import { getDb, getOperator } from '@/server/db';

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
    body: JSON.stringify(body),
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
    const res = await internalFetch(
      `/api/deployments/${deploymentId}/rollback`,
      'PATCH',
      { action: 'execute', actorId },
      req,
    );
    if (res.status >= 400) throw new Error(`롤백 실행 실패: ${JSON.stringify(res.data)}`);
    return { message: '롤백이 성공적으로 실행되었습니다.', data: res.data };
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
      context?.deploymentId ?? context?.jobRunId ?? context?.incidentId ?? actionName,
      `A2UI card action: ${actionName}`,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/a2ui-action]', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

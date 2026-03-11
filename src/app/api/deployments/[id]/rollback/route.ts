import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDeployment, getOperator, getRollbackPlan, getRollbackSteps } from '@/server/db';
import type { RollbackPlanStatus } from '@/types/domain';

// Valid status transitions for rollback plans
const ROLLBACK_TRANSITIONS: Record<RollbackPlanStatus, RollbackPlanStatus[]> = {
  draft: ['dry_run_ready'],
  dry_run_ready: ['approved'],
  approved: ['executed', 'failed'],
  executed: [],
  failed: [],
};

// Roles allowed to manage rollbacks
const RELEASE_ROLES = ['release_manager', 'ops_engineer'] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const { id: deploymentId } = await params;
    const body = await req.json();
    const { targetVersion, actorId, steps: providedSteps } = body as {
      targetVersion: string;
      actorId: string;
      steps?: { action: string; detail?: string }[];
    };

    if (!targetVersion?.trim() || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: targetVersion, actorId' },
        { status: 400 }
      );
    }

    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(RELEASE_ROLES as readonly string[]).includes(actor.role)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to create rollback plans` },
        { status: 403 }
      );
    }

    const deployment = getDeployment(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const planId = crypto.randomUUID();

    // Default rollback steps if none provided
    const steps = providedSteps ?? [
      { action: 'Pause traffic routing', detail: 'Redirect traffic to stable instances' },
      { action: `Revert image to ${targetVersion}`, detail: 'Update deployment manifest' },
      { action: 'Run health checks', detail: 'Verify all pods are healthy' },
      { action: 'Restore traffic routing', detail: 'Resume normal traffic flow' },
    ];

    db.transaction(() => {
      db.prepare(
        `INSERT INTO rollback_plans (id, deployment_id, target_version, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, 'draft', ?, ?, ?)`
      ).run(planId, deploymentId, targetVersion, actorId, now, now);

      steps.forEach((step, idx) => {
        db.prepare(
          `INSERT INTO rollback_steps (id, rollback_plan_id, step_order, action, status, detail)
           VALUES (?, ?, ?, ?, 'pending', ?)`
        ).run(crypto.randomUUID(), planId, idx + 1, step.action, step.detail ?? '');
      });

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, 'rollback_plan_create', 'rollback_plan', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        planId, `Rollback plan created targeting ${targetVersion}`, now
      );
    })();

    const plan = getRollbackPlan(deploymentId) as { id: string };
    const planSteps = getRollbackSteps(plan.id);
    return NextResponse.json({ ...plan, steps: planSteps }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/deployments/[id]/rollback]', err);
    return NextResponse.json({ error: 'Failed to create rollback plan' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const { id: deploymentId } = await params;
    const body = await req.json();
    const { action, actorId, reason } = body as {
      action: 'dry-run' | 'approve' | 'execute';
      actorId: string;
      reason?: string;
    };

    if (!action || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, actorId' },
        { status: 400 }
      );
    }

    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(RELEASE_ROLES as readonly string[]).includes(actor.role)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to manage rollback plans` },
        { status: 403 }
      );
    }

    const plan = getRollbackPlan(deploymentId) as {
      id: string;
      status: RollbackPlanStatus;
      deployment_id: string;
    } | undefined;
    if (!plan) {
      return NextResponse.json({ error: 'Rollback plan not found for this deployment' }, { status: 404 });
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Map action to new status and audit action type
    const ACTION_MAP: Record<string, { newStatus: RollbackPlanStatus; auditAction: string }> = {
      'dry-run': { newStatus: 'dry_run_ready', auditAction: 'rollback_dry_run' },
      approve: { newStatus: 'approved', auditAction: 'rollback_approve' },
      execute: { newStatus: 'executed', auditAction: 'rollback_execute' },
    };

    const mapped = ACTION_MAP[action];
    if (!mapped) {
      return NextResponse.json(
        { error: `Unknown action '${action}'. Valid: dry-run, approve, execute` },
        { status: 400 }
      );
    }

    const allowed = ROLLBACK_TRANSITIONS[plan.status];
    if (!allowed.includes(mapped.newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid transition for rollback plan: '${plan.status}' → '${mapped.newStatus}'`,
          allowedTransitions: allowed,
        },
        { status: 422 }
      );
    }

    db.transaction(() => {
      const updates: Record<string, string | null> = { status: mapped.newStatus, updated_at: now };

      if (action === 'dry-run') {
        updates['dry_run_result'] = JSON.stringify({
          simulatedAt: now,
          stepsChecked: getRollbackSteps(plan.id).length,
          result: 'pass',
          notes: 'Dry run completed successfully. No issues detected.',
        });
      }

      if (action === 'approve') {
        updates['approved_by'] = actorId;
      }

      if (action === 'execute') {
        // Mark all steps as done
        db.prepare(`UPDATE rollback_steps SET status = 'done' WHERE rollback_plan_id = ?`).run(plan.id);
        // Mark deployment as rolled back
        db.prepare(`UPDATE deployments SET status = 'rolled_back', updated_at = ? WHERE id = ?`).run(now, deploymentId);
      }

      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE rollback_plans SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), plan.id);

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'rollback_plan', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        mapped.auditAction, plan.id, reason ?? action, now
      );
    })();

    const updated = getRollbackPlan(deploymentId) as { id: string };
    const steps = getRollbackSteps(updated.id);
    return NextResponse.json({ ...updated, steps });
  } catch (err) {
    console.error('[PATCH /api/deployments/[id]/rollback]', err);
    return NextResponse.json({ error: 'Failed to update rollback plan' }, { status: 500 });
  }
}

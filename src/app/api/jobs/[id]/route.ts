import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJobRun, getJobRunEvents, getOperator } from '@/server/db';
import type { JobRunStatus } from '@/types/domain';

// Valid forward transitions for job runs
const JOB_TRANSITIONS: Record<JobRunStatus, JobRunStatus[]> = {
  draft: ['dry_run_ready', 'aborted'],
  dry_run_ready: ['approved', 'aborted'],
  approved: ['running', 'aborted'],
  running: ['done', 'failed', 'aborted'],
  done: [],
  failed: [],
  aborted: [],
};

const ALLOWED_ROLES = ['ops_engineer', 'release_manager', 'oncall_engineer'] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobRun = getJobRun(id);
    if (!jobRun) {
      return NextResponse.json({ error: 'Job run not found' }, { status: 404 });
    }
    const events = getJobRunEvents(id);
    return NextResponse.json({ ...jobRun, events });
  } catch (err) {
    console.error('[GET /api/jobs/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch job run' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const { id } = await params;
    const body = await req.json();
    const { action, actorId, reason } = body as {
      action: 'dry-run' | 'approve' | 'execute' | 'abort';
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
    if (!(ALLOWED_ROLES as readonly string[]).includes(actor.role as never)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to manage job runs` },
        { status: 403 }
      );
    }

    const jobRun = getJobRun(id) as { id: string; status: JobRunStatus } | undefined;
    if (!jobRun) {
      return NextResponse.json({ error: 'Job run not found' }, { status: 404 });
    }

    // Map action to status transition and audit event
    const ACTION_MAP: Record<
      string,
      { newStatus: JobRunStatus; eventType: string; auditAction: string }
    > = {
      'dry-run': { newStatus: 'dry_run_ready', eventType: 'dry_run', auditAction: 'job_dry_run' },
      approve: { newStatus: 'approved', eventType: 'approved', auditAction: 'job_approve' },
      execute: { newStatus: 'running', eventType: 'started', auditAction: 'job_execute' },
      abort: { newStatus: 'aborted', eventType: 'aborted', auditAction: 'job_abort' },
    };

    const mapped = ACTION_MAP[action];
    if (!mapped) {
      return NextResponse.json(
        { error: `Unknown action '${action}'. Valid: dry-run, approve, execute, abort` },
        { status: 400 }
      );
    }

    const allowed = JOB_TRANSITIONS[jobRun.status];
    if (!allowed.includes(mapped.newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid job run transition: '${jobRun.status}' → '${mapped.newStatus}'`,
          allowedTransitions: allowed,
        },
        { status: 422 }
      );
    }

    const db = getDb();
    const now = new Date().toISOString();

    db.transaction(() => {
      const updates: Record<string, string | number | null> = {
        status: mapped.newStatus,
        updated_at: now,
      };

      if (action === 'dry-run') {
        updates['dry_run_result'] = JSON.stringify({
          simulatedAt: now,
          result: 'pass',
          notes: 'Dry run completed successfully. No issues detected.',
        });
      }

      if (action === 'approve') {
        updates['approved_by'] = actorId;
      }

      if (action === 'execute') {
        updates['progress'] = 0;
      }

      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE job_runs SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);

      db.prepare(
        `INSERT INTO job_run_events (id, job_run_id, type, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), id, mapped.eventType, reason ?? action, now);

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'job_run', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        mapped.auditAction, id, reason ?? action, now
      );
    })();

    const updated = getJobRun(id) as Record<string, unknown>;
    const events = getJobRunEvents(id);
    return NextResponse.json({ ...updated, events });
  } catch (err) {
    console.error('[PATCH /api/jobs/[id]]', err);
    return NextResponse.json({ error: 'Failed to update job run' }, { status: 500 });
  }
}

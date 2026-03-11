import { NextRequest, NextResponse } from 'next/server';
import { getDb, getJobRun, getJobRunEvents } from '@/server/db';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobRun = getJobRun(id) as { id: string; status: string; progress: number } | undefined;

    if (!jobRun) {
      return NextResponse.json({ error: 'Job run not found' }, { status: 404 });
    }

    if (jobRun.status !== 'running') {
      return NextResponse.json(
        { error: `Job is not running (current status: '${jobRun.status}')` },
        { status: 422 }
      );
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Increment progress by a random amount between 15-30%
    const increment = Math.floor(Math.random() * 16) + 15; // 15..30
    const newProgress = Math.min(100, jobRun.progress + increment);
    const isCompleted = newProgress >= 100;

    db.transaction(() => {
      if (isCompleted) {
        // Job is done: set progress to 100, status to 'done', add completed event + audit log
        db.prepare(
          `UPDATE job_runs SET progress = 100, status = 'done', updated_at = ? WHERE id = ?`
        ).run(now, id);

        db.prepare(
          `INSERT INTO job_run_events (id, job_run_id, type, detail, created_at)
           VALUES (?, ?, 'completed', 'Job completed successfully', ?)`
        ).run(crypto.randomUUID(), id, now);

        db.prepare(
          `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
           VALUES (?, ?, 'system', 'system', 'job_complete', 'job_run', ?, 'Job execution completed', 'success', ?)`
        ).run(crypto.randomUUID(), crypto.randomUUID(), id, now);
      } else {
        // Just increment progress and add a progress event
        db.prepare(
          `UPDATE job_runs SET progress = ?, updated_at = ? WHERE id = ?`
        ).run(newProgress, now, id);

        db.prepare(
          `INSERT INTO job_run_events (id, job_run_id, type, detail, created_at)
           VALUES (?, ?, 'progress', ?, ?)`
        ).run(crypto.randomUUID(), id, `Progress: ${newProgress}%`, now);
      }
    })();

    const updated = getJobRun(id) as Record<string, unknown>;
    const events = getJobRunEvents(id);
    return NextResponse.json({ ...updated, events });
  } catch (err) {
    console.error('[POST /api/jobs/[id]/progress]', err);
    return NextResponse.json({ error: 'Failed to update job progress' }, { status: 500 });
  }
}

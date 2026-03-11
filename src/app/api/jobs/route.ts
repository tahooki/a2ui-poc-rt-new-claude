import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAllJobRuns, getAllJobTemplates, getOperator } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filters = {
      status: searchParams.get('status') ?? undefined,
      serviceId: searchParams.get('serviceId') ?? undefined,
    };
    const jobRuns = getAllJobRuns(filters);
    return NextResponse.json(jobRuns);
  } catch (err) {
    console.error('[GET /api/jobs]', err);
    return NextResponse.json({ error: 'Failed to fetch job runs' }, { status: 500 });
  }
}

// Roles that can create job runs
const ALLOWED_ROLES = ['ops_engineer', 'release_manager', 'oncall_engineer'] as const;

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const { templateId, serviceId, environment, spec, actorId } = body as {
      templateId: string;
      serviceId: string;
      environment: string;
      spec?: Record<string, unknown>;
      actorId: string;
    };

    if (!templateId || !serviceId || !environment || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId, serviceId, environment, actorId' },
        { status: 400 }
      );
    }

    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(actor.role as never)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to create job runs` },
        { status: 403 }
      );
    }

    // Validate template exists
    const templates = getAllJobTemplates() as { id: string }[];
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: 'Job template not found' }, { status: 404 });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    const specJson = JSON.stringify(spec ?? {});

    db.transaction(() => {
      db.prepare(
        `INSERT INTO job_runs (id, template_id, service_id, environment, spec, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      ).run(jobId, templateId, serviceId, environment, specJson, actorId, now, now);

      db.prepare(
        `INSERT INTO job_run_events (id, job_run_id, type, detail, created_at)
         VALUES (?, ?, 'created', ?, ?)`
      ).run(crypto.randomUUID(), jobId, 'Job run created', now);

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, 'job_create', 'job_run', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        jobId, `Job run created from template ${templateId}`, now
      );
    })();

    const created = db.prepare('SELECT * FROM job_runs WHERE id = ?').get(jobId);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/jobs]', err);
    return NextResponse.json({ error: 'Failed to create job run' }, { status: 500 });
  }
}

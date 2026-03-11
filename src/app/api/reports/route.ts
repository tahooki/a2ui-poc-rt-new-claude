import { NextRequest, NextResponse } from 'next/server';
import { getDb, getAllReports, getOperator } from '@/server/db';
import type { ReportType } from '@/types/domain';

const VALID_TYPES: ReportType[] = ['incident_update', 'handover', 'postmortem'];
const ALLOWED_ROLES = ['oncall_engineer', 'ops_engineer', 'release_manager', 'support_lead'] as const;

export async function GET() {
  try {
    const reports = getAllReports();
    return NextResponse.json(reports);
  } catch (err) {
    console.error('[GET /api/reports]', err);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json();
    const { type, title, incidentId, sections, actorId } = body as {
      type: ReportType;
      title: string;
      incidentId?: string;
      sections?: { title: string; content?: string }[];
      actorId: string;
    };

    if (!type || !title?.trim() || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: type, title, actorId' },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid report type. Valid: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(actor.role as never)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to create reports` },
        { status: 403 }
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    const reportId = crypto.randomUUID();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO reports (id, type, title, incident_id, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`
      ).run(reportId, type, title, incidentId ?? null, actorId, now, now);

      // Insert sections if provided
      (sections ?? []).forEach((sec, idx) => {
        db.prepare(
          `INSERT INTO report_sections (id, report_id, section_order, title, content)
           VALUES (?, ?, ?, ?, ?)`
        ).run(crypto.randomUUID(), reportId, idx + 1, sec.title, sec.content ?? '');
      });

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, 'report_create', 'report', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        reportId, `Report '${title}' created`, now
      );
    })();

    const created = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[POST /api/reports]', err);
    return NextResponse.json({ error: 'Failed to create report' }, { status: 500 });
  }
}

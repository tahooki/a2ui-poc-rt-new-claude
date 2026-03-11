import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  getReport,
  getReportSections,
  getReportActionItems,
  getReportExports,
  getOperator,
} from '@/server/db';
import type { ReportStatus } from '@/types/domain';

const STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ['reviewed'],
  reviewed: ['finalized'],
  finalized: ['exported'],
  exported: [],
};

const ALLOWED_ROLES = ['oncall_engineer', 'ops_engineer', 'release_manager', 'support_lead'] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const report = getReport(id);
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    const sections = getReportSections(id);
    const actionItems = getReportActionItems(id).map((item) => {
      const typed = item as {
        id: string;
        description: string;
        assignee_id: string | null;
        due_date: string | null;
        is_done: number;
      };
      return {
        ...typed,
        completed: Boolean(typed.is_done),
      };
    });
    const exports = getReportExports(id);
    return NextResponse.json({ ...report, sections, actionItems, exports });
  } catch (err) {
    console.error('[GET /api/reports/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
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
    const {
      status: requestedStatus,
      sections,
      actionItems,
      actorId,
      reason,
      exportFormat,
    } = body as {
      status?: ReportStatus;
      sections?: { id?: string; title: string; content: string; sectionOrder?: number }[];
      actionItems?: {
        id?: string;
        description: string;
        assignee_id?: string | null;
        due_date?: string | null;
        completed?: boolean;
      }[];
      actorId: string;
      reason?: string;
      exportFormat?: 'markdown' | 'json';
    };

    if (!actorId) {
      return NextResponse.json({ error: 'Missing required field: actorId' }, { status: 400 });
    }

    const actor = getOperator(actorId) as { id: string; role: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(actor.role as never)) {
      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to update reports` },
        { status: 403 }
      );
    }

    const report = getReport(id) as { id: string; status: ReportStatus; title: string } | undefined;
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const newStatus =
      requestedStatus ??
      (exportFormat && report.status === 'finalized' ? 'exported' : undefined);

    const db = getDb();
    const now = new Date().toISOString();

    // Validate status transition if status is changing
    if (newStatus && newStatus !== report.status) {
      const allowed = STATUS_TRANSITIONS[report.status];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          {
            error: `Invalid report status transition: '${report.status}' → '${newStatus}'`,
            allowedTransitions: allowed,
          },
          { status: 422 }
        );
      }
    }

    db.transaction(() => {
      // Update status if provided
      if (newStatus) {
        db.prepare(`UPDATE reports SET status = ?, updated_at = ? WHERE id = ?`).run(newStatus, now, id);
      }

      // Update or replace sections if provided
      if (sections) {
        db.prepare(`DELETE FROM report_sections WHERE report_id = ?`).run(id);
        sections.forEach((sec, idx) => {
          db.prepare(
            `INSERT INTO report_sections (id, report_id, section_order, title, content)
             VALUES (?, ?, ?, ?, ?)`
          ).run(
            sec.id ?? crypto.randomUUID(),
            id,
            sec.sectionOrder ?? idx + 1,
            sec.title,
            sec.content
          );
        });
        if (!newStatus) {
          db.prepare(`UPDATE reports SET updated_at = ? WHERE id = ?`).run(now, id);
        }
      }

      // If exporting, create an export record
      if (actionItems) {
        db.prepare(`DELETE FROM report_action_items WHERE report_id = ?`).run(id);
        actionItems.forEach((item) => {
          db.prepare(
            `INSERT INTO report_action_items (id, report_id, description, assignee_id, due_date, is_done)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            item.id ?? crypto.randomUUID(),
            id,
            item.description,
            item.assignee_id ?? null,
            item.due_date ?? null,
            item.completed ? 1 : 0
          );
        });

        if (!newStatus && !sections) {
          db.prepare(`UPDATE reports SET updated_at = ? WHERE id = ?`).run(now, id);
        }
      }

      if (exportFormat) {
        const currentReport = db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as Record<string, unknown>;
        const currentSections = db.prepare('SELECT * FROM report_sections WHERE report_id = ? ORDER BY section_order').all(id);

        let exportContent: string;
        if (exportFormat === 'json') {
          exportContent = JSON.stringify({ report: currentReport, sections: currentSections }, null, 2);
        } else {
          // markdown
          const secs = currentSections as { title: string; content: string }[];
          exportContent = `# ${currentReport['title']}\n\n` +
            secs.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n');
        }

        db.prepare(
          `INSERT INTO report_exports (id, report_id, format, content, exported_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(crypto.randomUUID(), id, exportFormat, exportContent, now);
      }

      // Determine audit action type
      let auditAction = 'report_update';
      if (newStatus === 'finalized') auditAction = 'report_finalize';
      else if (newStatus === 'exported' || exportFormat) auditAction = 'report_export';

      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'report', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(), requestId, actorId, actor.role,
        auditAction,
        id,
        reason ??
          (exportFormat
            ? `Exported as ${exportFormat}`
            : newStatus
              ? `Status changed to ${newStatus}`
              : actionItems
                ? 'Action items updated'
                : 'Sections updated'),
        now
      );
    })();

    const updated = getReport(id) as Record<string, unknown>;
    const sections2 = getReportSections(id);
    const actionItems2 = getReportActionItems(id).map((item) => {
      const typed = item as {
        id: string;
        description: string;
        assignee_id: string | null;
        due_date: string | null;
        is_done: number;
      };
      return {
        ...typed,
        completed: Boolean(typed.is_done),
      };
    });
    const exports = getReportExports(id);
    return NextResponse.json({ ...updated, sections: sections2, actionItems: actionItems2, exports });
  } catch (err) {
    console.error('[PATCH /api/reports/[id]]', err);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}

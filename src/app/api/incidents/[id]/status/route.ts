import { NextRequest, NextResponse } from 'next/server';
import { getDb, getIncident, getOperator } from '@/server/db';
import { mapIncidentRecord, type IncidentRecord } from '@/server/mappers/incidents';
import type { IncidentStatus } from '@/types/domain';

// Valid forward transitions only
const TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['investigating'],
  investigating: ['mitigated'],
  mitigated: ['resolved'],
  resolved: ['closed'],
  closed: [],
};

// Roles permitted to change incident status
const ALLOWED_ROLES = ['oncall_engineer', 'ops_engineer', 'support_lead'] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const { id } = await params;
    const body = await req.json();

    const { status: newStatus, reason, actorId } = body as {
      status: IncidentStatus;
      reason: string;
      actorId: string;
    };

    // Validate required fields
    if (!newStatus || !reason?.trim() || !actorId) {
      return NextResponse.json(
        { error: 'Missing required fields: status, reason, actorId' },
        { status: 400 }
      );
    }

    // Validate actor exists and has permission
    const actor = getOperator(actorId) as { id: string; role: string; name: string } | undefined;
    if (!actor) {
      return NextResponse.json({ error: 'Actor not found' }, { status: 404 });
    }
    if (!(ALLOWED_ROLES as readonly string[]).includes(actor.role)) {
      // Log denied attempt
      getDb().prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result)
         VALUES (?, ?, ?, ?, 'incident_update', 'incident', ?, ?, 'denied')`
      ).run(crypto.randomUUID(), requestId, actorId, actor.role, id, reason);

      return NextResponse.json(
        { error: `Role '${actor.role}' is not permitted to update incident status` },
        { status: 403 }
      );
    }

    // Fetch incident
    const incident = getIncident(id) as { id: string; status: IncidentStatus } | undefined;
    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }

    // Validate transition
    const allowed = TRANSITIONS[incident.status];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status transition: '${incident.status}' → '${newStatus}'`,
          allowedTransitions: allowed,
        },
        { status: 422 }
      );
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Determine action type
    const actionType = newStatus === 'closed' ? 'incident_close' : 'incident_update';

    db.transaction(() => {
      // Update incident status
      db.prepare(
        `UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?`
      ).run(newStatus, now, id);

      // Create incident event
      db.prepare(
        `INSERT INTO incident_events (id, incident_id, actor_id, action, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        id,
        actorId,
        `status_changed_to_${newStatus}`,
        reason,
        now
      );

      // Create audit log
      db.prepare(
        `INSERT INTO audit_logs (id, request_id, actor_id, actor_role, action_type, target_type, target_id, reason, result, created_at)
         VALUES (?, ?, ?, ?, ?, 'incident', ?, ?, 'success', ?)`
      ).run(
        crypto.randomUUID(),
        requestId,
        actorId,
        actor.role,
        actionType,
        id,
        reason,
        now
      );
    })();

    const updated = getIncident(id);
    return NextResponse.json(
      updated ? mapIncidentRecord(updated as IncidentRecord) : null
    );
  } catch (err) {
    console.error('[PATCH /api/incidents/[id]/status]', err);
    return NextResponse.json({ error: 'Failed to update incident status' }, { status: 500 });
  }
}

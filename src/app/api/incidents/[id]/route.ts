import { NextRequest, NextResponse } from 'next/server';
import { getIncident, getIncidentEvents, getIncidentEvidence } from '@/server/db';
import {
  mapIncidentEvidenceRecord,
  mapIncidentEventRecord,
  mapIncidentRecord,
  type IncidentEvidenceRecord,
  type IncidentEventRecord,
  type IncidentRecord,
} from '@/server/mappers/incidents';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const incident = getIncident(id);
    if (!incident) {
      return NextResponse.json({ error: 'Incident not found' }, { status: 404 });
    }
    const events = getIncidentEvents(id).map((event) =>
      mapIncidentEventRecord(event as IncidentEventRecord)
    );
    const evidence = getIncidentEvidence(id).map((item) =>
      mapIncidentEvidenceRecord(item as IncidentEvidenceRecord)
    );
    return NextResponse.json({
      ...mapIncidentRecord(incident as IncidentRecord),
      events,
      evidence,
    });
  } catch (err) {
    console.error('[GET /api/incidents/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch incident' }, { status: 500 });
  }
}

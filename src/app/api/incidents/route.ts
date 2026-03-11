import { NextRequest, NextResponse } from 'next/server';
import { getAllIncidents } from '@/server/db';
import {
  mapIncidentRecord,
  type IncidentRecord,
} from '@/server/mappers/incidents';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filters = {
      status: searchParams.get('status') ?? undefined,
      severity: searchParams.get('severity') ?? undefined,
      serviceId: searchParams.get('serviceId') ?? undefined,
      environment: searchParams.get('environment') ?? undefined,
    };
    const incidents = getAllIncidents(filters).map((incident) =>
      mapIncidentRecord(incident as IncidentRecord)
    );
    return NextResponse.json(incidents);
  } catch (err) {
    console.error('[GET /api/incidents]', err);
    return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 });
  }
}

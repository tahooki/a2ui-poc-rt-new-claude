import { NextRequest, NextResponse } from 'next/server';
import { getService, getDb } from '@/server/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const service = getService(id);
    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const db = getDb();
    const activeIncidents = db
      .prepare(
        `SELECT * FROM incidents
         WHERE service_id = ? AND status IN ('open', 'investigating')
         ORDER BY created_at DESC`
      )
      .all(id);

    const recentDeployments = db
      .prepare(
        `SELECT * FROM deployments
         WHERE service_id = ? AND created_at >= datetime('now', '-7 days')
         ORDER BY created_at DESC`
      )
      .all(id);

    return NextResponse.json({
      ...service,
      activeIncidents,
      recentDeployments,
    });
  } catch (err) {
    console.error('[GET /api/services/[id]]', err);
    return NextResponse.json({ error: 'Failed to fetch service' }, { status: 500 });
  }
}

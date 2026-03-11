import { NextRequest, NextResponse } from 'next/server';
import { getAllServices, getDb } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const tier = searchParams.get('tier') ?? undefined;

    let services = getAllServices() as Array<Record<string, unknown>>;

    if (tier) {
      services = services.filter((s) => s.tier === tier);
    }

    const db = getDb();
    const activeIncidentCounts = db
      .prepare(
        `SELECT service_id, COUNT(*) as count FROM incidents
         WHERE status IN ('open', 'investigating')
         GROUP BY service_id`
      )
      .all() as Array<{ service_id: string; count: number }>;

    const recentDeploymentCounts = db
      .prepare(
        `SELECT service_id, COUNT(*) as count FROM deployments
         WHERE created_at >= datetime('now', '-7 days')
         GROUP BY service_id`
      )
      .all() as Array<{ service_id: string; count: number }>;

    const incidentMap = new Map(activeIncidentCounts.map((r) => [r.service_id, r.count]));
    const deploymentMap = new Map(recentDeploymentCounts.map((r) => [r.service_id, r.count]));

    const enriched = services.map((service) => ({
      ...service,
      activeIncidentCount: incidentMap.get(service.id as string) ?? 0,
      recentDeploymentCount: deploymentMap.get(service.id as string) ?? 0,
    }));

    return NextResponse.json(enriched);
  } catch (err) {
    console.error('[GET /api/services]', err);
    return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
  }
}

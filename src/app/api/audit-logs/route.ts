import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 50;

    const filters = {
      targetType: searchParams.get('targetType') ?? undefined,
      targetId: searchParams.get('targetId') ?? undefined,
      actorId: searchParams.get('actorId') ?? undefined,
      limit: isNaN(limit) ? 50 : limit,
    };

    const logs = getAuditLogs(filters);
    return NextResponse.json(logs);
  } catch (err) {
    console.error('[GET /api/audit-logs]', err);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}

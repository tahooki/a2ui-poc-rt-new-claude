import { NextRequest, NextResponse } from 'next/server';
import { getAllDeployments } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const filters = {
      status: searchParams.get('status') ?? undefined,
      serviceId: searchParams.get('serviceId') ?? undefined,
      environment: searchParams.get('environment') ?? undefined,
    };
    const deployments = getAllDeployments(filters);
    return NextResponse.json(deployments);
  } catch (err) {
    console.error('[GET /api/deployments]', err);
    return NextResponse.json({ error: 'Failed to fetch deployments' }, { status: 500 });
  }
}

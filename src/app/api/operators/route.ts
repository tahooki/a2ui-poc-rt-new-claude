import { NextResponse } from 'next/server';
import { getAllOperators } from '@/server/db';

export async function GET() {
  try {
    const operators = getAllOperators();
    return NextResponse.json(operators);
  } catch (err) {
    console.error('[GET /api/operators]', err);
    return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getChatThread, createChatThread, getChatMessages } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const operatorId = searchParams.get('operatorId');
    const page = searchParams.get('page');

    if (!operatorId || !page) {
      return NextResponse.json(
        { error: 'Missing required query params: operatorId, page' },
        { status: 400 }
      );
    }

    const thread = getChatThread(operatorId, page);
    if (!thread) {
      return NextResponse.json({ threadId: null, messages: [] });
    }

    const messages = getChatMessages(thread.id);
    return NextResponse.json({ threadId: thread.id, thread, messages });
  } catch (err) {
    console.error('[GET /api/chat/threads]', err);
    return NextResponse.json({ error: 'Failed to fetch chat thread' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { operatorId, page, selectedEntityId } = body;

    if (!operatorId || !page) {
      return NextResponse.json(
        { error: 'Missing required fields: operatorId, page' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const thread = createChatThread(id, operatorId, page, selectedEntityId);
    return NextResponse.json(thread, { status: 201 });
  } catch (err) {
    console.error('[POST /api/chat/threads]', err);
    return NextResponse.json({ error: 'Failed to create chat thread' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getChatMessages, saveChatMessage, updateChatThreadTimestamp } from '@/server/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const messages = getChatMessages(id);
    return NextResponse.json(messages);
  } catch (err) {
    console.error('[GET /api/chat/threads/[id]/messages]', err);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params;
    const body = await req.json();
    const { role, content, toolName, toolResult } = body;

    if (!role || content === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: role, content' },
        { status: 400 }
      );
    }

    const messageId = body.id || randomUUID();
    const message = saveChatMessage(messageId, threadId, role, content, toolName, toolResult);
    updateChatThreadTimestamp(threadId);
    return NextResponse.json(message, { status: 201 });
  } catch (err) {
    console.error('[POST /api/chat/threads/[id]/messages]', err);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}

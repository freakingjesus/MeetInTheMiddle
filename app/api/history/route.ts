import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { verifyRoomToken } from '@/lib/roomToken';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomToken = searchParams.get('roomToken') || '';
  const limit = Number(searchParams.get('limit') || '20');
  const roomId = verifyRoomToken(roomToken);
  if (!roomId) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  const { data } = await adminClient
    .from('summaries')
    .select('content, created_at, helpful')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const histories = (data || []).map((r) => ({
    ...JSON.parse(r.content),
    created_at: r.created_at,
    helpful: r.helpful,
  }));

  return NextResponse.json(histories);
}

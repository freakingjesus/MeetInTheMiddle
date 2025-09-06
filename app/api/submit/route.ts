import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { verifyRoomToken } from '@/lib/roomToken';

export async function POST(req: NextRequest) {
  const { roomToken, side, content } = await req.json();
  const roomId = verifyRoomToken(roomToken);
  if (!roomId) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  await adminClient.from('entries').insert({ room_id: roomId, side, content });
  await adminClient
    .from('status')
    .upsert({ room_id: roomId, [`${side}_ready`]: true }, { onConflict: 'room_id' });

  const { data: room } = await adminClient
    .from('rooms')
    .select('code')
    .eq('id', roomId)
    .single();

  if (!room) {
    return NextResponse.json({ error: 'room not found' }, { status: 404 });
  }

  adminClient
    .channel(`room-${room.code}`)
    .send({ type: 'broadcast', event: 'READY_CHANGE', payload: { who: side, ready: true } });

  return NextResponse.json({ ok: true });
}

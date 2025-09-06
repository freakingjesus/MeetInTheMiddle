import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { signRoomToken } from '@/lib/roomToken';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  const roomCode = (code || randomBytes(3).toString('hex')).toLowerCase();

  let { data: room } = await adminClient
    .from('rooms')
    .select('id')
    .eq('code', roomCode)
    .single();

  if (!room) {
    const { data } = await adminClient
      .from('rooms')
      .insert({ code: roomCode })
      .select('id')
      .single();
    room = data!;
    await adminClient
      .from('status')
      .insert({ room_id: room.id, your_ready: false, their_ready: false });
  }

  const roomToken = signRoomToken(room.id);
  return NextResponse.json({ roomId: room.id, roomToken, code: roomCode });
}

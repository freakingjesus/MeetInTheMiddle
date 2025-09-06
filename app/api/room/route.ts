import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { signRoomToken } from '@/lib/roomToken';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  const roomCode = (code || randomBytes(3).toString('hex')).toLowerCase();

  const { data: roomData, error } = await adminClient
    .from('rooms')
    .select('id')
    .eq('code', roomCode)
    .maybeSingle();
  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let room = roomData;
  if (!room) {
    const { data, error: insertError } = await adminClient
      .from('rooms')
      .insert({ code: roomCode })
      .select('id')
      .single();
    if (insertError) {
      console.error(insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    room = data!;
    const { error: statusError } = await adminClient
      .from('status')
      .insert({ room_id: room.id, your_ready: false, their_ready: false });
    if (statusError) {
      console.error(statusError);
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }
  }

  const roomToken = signRoomToken(room.id);
  return NextResponse.json({ roomId: room.id, roomToken, code: roomCode });
}

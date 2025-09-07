import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { signRoomToken } from '@/lib/roomToken';
import { randomBytes } from 'crypto';

interface JoinRoomBody {
  code?: string;
  name: string;
}

interface NameChangePayload {
  who: 'your' | 'their';
  name: string;
}

export async function POST(req: NextRequest) {
  const { code, name }: JoinRoomBody = await req.json();
  const roomCode = (code || randomBytes(3).toString('hex')).toLowerCase();
  const adminClient = createAdminClient();

  const { data: roomData, error } = await adminClient
    .from('rooms')
    .select('id')
    .eq('code', roomCode)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
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

  const { data: statusData, error: statusSelectError } = await adminClient
    .from('status')
    .select('your_name, their_name')
    .eq('room_id', room.id)
    .maybeSingle();
  if (statusSelectError && statusSelectError.code !== 'PGRST116') {
    console.error(statusSelectError);
    return NextResponse.json({ error: statusSelectError.message }, { status: 500 });
  }

  const yourName = statusData?.your_name ?? null;
  const theirName = statusData?.their_name ?? null;

  let side: 'your' | 'their';
  if (yourName === name) side = 'your';
  else if (theirName === name) side = 'their';
  else if (!yourName) side = 'your';
  else side = 'their';

  const { data: updatedStatus, error: upsertError } = await adminClient
    .from('status')
    .upsert(
      { room_id: room.id, [`${side}_name`]: name },
      { onConflict: 'room_id' }
    )
    .select('your_name, their_name')
    .single();
  if (upsertError) {
    console.error(upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const payload = { who: side, name } satisfies NameChangePayload;
  await adminClient
    .channel(`room-${roomCode}`)
    .send({ type: 'broadcast', event: 'NAME_CHANGE', payload });

  const roomToken = signRoomToken(room.id, side, name);
  return NextResponse.json({
    side,
    your_name: updatedStatus?.your_name ?? null,
    their_name: updatedStatus?.their_name ?? null,
    roomToken,
  });
}

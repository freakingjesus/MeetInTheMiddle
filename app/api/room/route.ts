import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { signRoomToken } from '@/lib/roomToken';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  const { code, name } = await req.json();
  const roomCode = (code || randomBytes(3).toString('hex')).toLowerCase();
  const adminClient = createAdminClient();

  // Find (or create) the room by code
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

  // If a name is provided, use the extended name-assignment flow.
  if (typeof name === 'string' && name.trim().length > 0) {
    // Fetch current names (tables should have your_name / their_name columns)
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

    // Upsert the chosen side's name
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

    // Optional realtime broadcast (no await to avoid blocking)
    try {
      // @ts-ignore - supabase-js Realtime channel available on the admin client
      adminClient.channel?.(`room-${roomCode}`)?.send?.({
        type: 'broadcast',
        event: 'NAME_CHANGE',
        payload: { who: side, name },
      });
    } catch (e) {
      console.warn('Realtime NAME_CHANGE broadcast failed (non-fatal):', e);
    }

    // Be compatible with signRoomToken(roomId) or signRoomToken(roomId, side, name)
    const _sign: any = signRoomToken;
    const roomToken = _sign(room.id, side, name);

    return NextResponse.json({
      roomId: room.id,
      code: roomCode,
      side,
      your_name: updatedStatus?.your_name ?? null,
      their_name: updatedStatus?.their_name ?? null,
      roomToken,
    });
  }

  // Fallback: no name provided → original simple behavior
  const side = Math.random() < 0.5 ? 'your' : 'their';
  const _sign: any = signRoomToken;
  const roomToken = _sign(room.id, side, null); // falls back if only roomId is supported
  return NextResponse.json({
    roomId: room.id,
    code: roomCode,
    side,
    roomToken,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { signRoomToken } from '@/lib/roomToken';
import { randomBytes } from 'crypto';

interface JoinRoomBody {
  code?: string;
  name?: string;
}

interface NameChangePayload {
  who: 'your' | 'their';
  name: string;
}

export async function POST(req: NextRequest) {
  const { code, name }: JoinRoomBody = await req.json();
  const roomCode = (code || randomBytes(3).toString('hex')).toLowerCase();
  const adminClient = createAdminClient();
  const sign = signRoomToken as unknown as (
    roomId: string,
    side: 'your' | 'their',
    name: string | null
  ) => string;

  // 1) Find (or create) the room by code
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

    // Create initial status row for the new room
    const { error: statusError } = await adminClient
      .from('status')
      .insert({ room_id: room.id, your_ready: false, their_ready: false });

    if (statusError) {
      console.error(statusError);
      return NextResponse.json({ error: statusError.message }, { status: 500 });
    }
  } else {
    // Ensure a status row exists for preexisting rooms (idempotent)
    const { data: statusExists, error: statusCheckErr } = await adminClient
      .from('status')
      .select('room_id')
      .eq('room_id', room.id)
      .maybeSingle();

    if (statusCheckErr && statusCheckErr.code !== 'PGRST116') {
      console.error(statusCheckErr);
      return NextResponse.json({ error: statusCheckErr.message }, { status: 500 });
    }

    if (!statusExists) {
      const { error: ensureStatusErr } = await adminClient
        .from('status')
        .insert({ room_id: room.id, your_ready: false, their_ready: false });

      if (ensureStatusErr) {
        console.error(ensureStatusErr);
        return NextResponse.json({ error: ensureStatusErr.message }, { status: 500 });
      }
    }
  }

  // 2) If a name is provided, run the name-assignment flow
  if (typeof name === 'string' && name.trim().length > 0) {
    const trimmed = name.trim();

    // Fetch current names (expects your_name / their_name columns to exist)
    const { data: statusData, error: statusSelectError } = await adminClient
      .from('status')
      .select('your_name, their_name')
      .eq('room_id', room.id)
      .maybeSingle();

    if (statusSelectError && statusSelectError.code !== 'PGRST116') {
      console.error(statusSelectError);
      return NextResponse.json({ error: statusSelectError.message }, { status: 500 });
    }

    const yourName: string | null = statusData?.your_name ?? null;
    const theirName: string | null = statusData?.their_name ?? null;

    // Reject if both slots are already taken by different names
    if (
      yourName &&
      theirName &&
      trimmed !== yourName &&
      trimmed !== theirName
    ) {
      return NextResponse.json({ error: 'room full' }, { status: 409 });
    }

    let side: 'your' | 'their';
    if (yourName === trimmed) side = 'your';
    else if (theirName === trimmed) side = 'their';
    else if (!yourName) side = 'your';
    else side = 'their';

    // Upsert the chosen side's name on the status row
    const { data: updatedStatus, error: upsertError } = await adminClient
      .from('status')
      .upsert(
        { room_id: room.id, [`${side}_name`]: trimmed },
        { onConflict: 'room_id' }
      )
      .select('your_name, their_name')
      .single();

    if (upsertError) {
      console.error(upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Optional realtime broadcast; don't block on failures
    try {
      if (adminClient.channel) {
        adminClient.channel(`room-${roomCode}`).send({
          type: 'broadcast',
          event: 'NAME_CHANGE',
          payload: { who: side, name: trimmed } satisfies NameChangePayload,
        });
      }
    } catch (e) {
      console.warn('Realtime NAME_CHANGE broadcast failed (non-fatal):', e);
    }

      // Support signRoomToken(roomId, side, name)
      const roomToken = sign(room.id, side, trimmed);

    return NextResponse.json({
      roomId: room.id,
      code: roomCode,
      side,
      your_name: updatedStatus?.your_name ?? null,
      their_name: updatedStatus?.their_name ?? null,
      roomToken,
    });
  }

  // 3) Fallback: no name provided → assign a side randomly, return token
  const side: 'your' | 'their' = Math.random() < 0.5 ? 'your' : 'their';
  const roomToken = sign(room.id, side, null);

  return NextResponse.json({
    roomId: room.id,
    code: roomCode,
    side,
    your_name: null,
    their_name: null,
    roomToken,
  });
}

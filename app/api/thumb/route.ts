import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase';
import { verifyRoomToken } from '@/lib/roomToken';

export async function POST(req: NextRequest) {
  const { roomToken, which, value } = await req.json();
  const roomId = verifyRoomToken(roomToken);
  if (!roomId) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  const { data: summary } = await adminClient
    .from('summaries')
    .select('id, helpful, content')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!summary) return NextResponse.json({ error: 'no summary' }, { status: 400 });

  const helpful = summary.helpful || { yourSideThumb: null, theirSideThumb: null };
  if (which === 'your') helpful.yourSideThumb = value;
  if (which === 'their') helpful.theirSideThumb = value;

  await adminClient.from('summaries').update({ helpful }).eq('id', summary.id);
  return NextResponse.json({ ok: true });
}

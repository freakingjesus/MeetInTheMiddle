import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifyRoomToken } from '@/lib/roomToken';
import { callGemini, parseGeminiResponse, type GeminiSummary } from '@/lib/gemini';

const lastGen = new Map<string, number>();

export async function POST(req: NextRequest) {
  const { roomToken, save } = await req.json();
  const roomId = verifyRoomToken(roomToken);
  if (!roomId) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  const last = lastGen.get(roomId) || 0;
  if (Date.now() - last < 10_000)
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  lastGen.set(roomId, Date.now());

  const adminClient = createAdminClient();

  const { data: entries } = await adminClient
    .from('entries')
    .select('side, content')
    .eq('room_id', roomId);

  const your = entries?.find((e) => e.side === 'your')?.content || '';
  const their = entries?.find((e) => e.side === 'their')?.content || '';

  let summary: GeminiSummary;
  if (!process.env.GOOGLE_API_KEY) {
    summary = { summary: 'Missing Google API key', nextSteps: [], toneNotes: '' };
  } else {
    try {
      const text = await callGemini(your, their);
      summary = parseGeminiResponse(text);
    } catch (err) {
      return NextResponse.json(
        { error: 'Failed to generate summary' },
        { status: 500 }
      );
    }
  }

  if (save) {
    await adminClient.from('summaries').insert({ room_id: roomId, content: JSON.stringify(summary) });
  }

  return NextResponse.json(summary);
}

// app/api/whatever/route.ts (or wherever this handler lives)
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyRoomToken } from "@/lib/roomToken";
import { callGemini, parseGeminiResponse, type GeminiSummary } from "@/lib/gemini";

const lastGen = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    const { roomToken } = await req.json();

    if (!roomToken) {
      return NextResponse.json({ error: "missing token" }, { status: 400 });
    }

    const roomId = verifyRoomToken(roomToken);
    if (!roomId) {
      return NextResponse.json({ error: "invalid token" }, { status: 401 });
    }

    // naive in-memory rate limit per room (10s)
    const last = lastGen.get(roomId) ?? 0;
    if (Date.now() - last < 10_000) {
      return NextResponse.json({ error: "rate limited" }, { status: 429 });
    }
    lastGen.set(roomId, Date.now());

    const adminClient = createAdminClient();

    const { data: entries, error: entriesError } = await adminClient
      .from("entries")
      .select("side, content")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false });

    const { data: status, error: statusError } = await adminClient
      .from("status")
      .select("your_name, their_name")
      .eq("room_id", roomId)
      .single();

    if (statusError) {
      throw new Error(`Failed to fetch status: ${statusError.message}`);
    }

    if (entriesError) {
      throw new Error(`Failed to fetch entries: ${entriesError.message}`);
    }

    const your = entries?.find((e) => e.side === "your")?.content ?? "";
    const their = entries?.find((e) => e.side === "their")?.content ?? "";
    const yourName = status?.your_name ?? "Your Side";
    const theirName = status?.their_name ?? "Their Side";

    let summary: GeminiSummary;

    // Keep the codex branch behavior: return a placeholder summary if the key is missing
    if (!process.env.GOOGLE_API_KEY) {
      summary = { summary: "Missing Google API key", nextSteps: [], toneNotes: "" };
    } else {
      const text = await callGemini(your, their, yourName, theirName);
      summary = parseGeminiResponse(text);
    }

    const { error: summaryError } = await adminClient
      .from("summaries")
      .insert({ room_id: roomId, content: JSON.stringify(summary) });

    if (summaryError) {
      throw new Error(`Failed to save summary: ${summaryError.message}`);
    }

    const { data: room } = await adminClient
      .from("rooms")
      .select("code")
      .eq("id", roomId)
      .single();

    if (room?.code) {
      adminClient
        .channel(`room-${room.code}`)
        .send({ type: "broadcast", event: "SUMMARY", payload: summary });
    }

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

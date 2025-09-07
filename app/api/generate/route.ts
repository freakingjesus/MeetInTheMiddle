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
      .eq("room_id", roomId);

    if (entriesError) {
      throw new Error(`Failed to fetch entries: ${entriesError.message}`);
    }

    const your = entries?.find((e) => e.side === "your")?.content ?? "";
    const their = entries?.find((e) => e.side === "their")?.content ?? "";

    let summary: GeminiSummary;

    // Keep the codex branch behavior: return a placeholder summary if the key is missing
    if (!process.env.GOOGLE_API_KEY) {
      summary = { summary: "Missing Google API key", nextSteps: [], toneNotes: "" };
    } else {
      const text = await callGemini(your, their);
      summary = parseGeminiResponse(text);
    }

    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

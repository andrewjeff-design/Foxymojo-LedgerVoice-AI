import { NextResponse } from "next/server";
import { requireEntitledWorkspace } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { openai } from "@/lib/openai";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg"]);

export async function POST(request: Request) {
  try {
    const context = await requireEntitledWorkspace();
    await enforceRateLimit("audio-transcription", context.user.id, 10);
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return NextResponse.json({ error: "Audio file required" }, { status: 400 });
    if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio must be between 1 byte and 10 MB" }, { status: 413 });
    if (audio.type && !ALLOWED_TYPES.has(audio.type)) return NextResponse.json({ error: "Unsupported audio type" }, { status: 415 });

    const result = await openai().audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      prompt: "Small-business finance command. Preserve customer names, merchant names, dates, currencies, invoice numbers and amounts exactly."
    });
    return NextResponse.json({ transcript: result.text });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

/**
 * Genera audio MP3 con voces neuronales (sin claves API).
 * - female → es-MX-DaliaNeural (voz de mujer, garantizada)
 * - male   → es-MX-JorgeNeural  (voz de hombre, garantizada)
 *
 * El audio SIEMPRE se genera a velocidad normal (1x): el cambio de
 * velocidad lo hace el navegador con playbackRate, así mover el
 * control JAMÁS reinicia ni regenera la lectura.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VOICES: Record<"female" | "male", string> = {
  female: "es-MX-DaliaNeural",
  male: "es-MX-JorgeNeural",
};

/** Longitud máxima de texto por petición (los fragmentos llegan ≤800) */
const MAX_TEXT_LENGTH = 1500;

/** Escapa XML: el texto se incrusta dentro de la plantilla SSML */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function synthesize(text: string, voiceKey: "female" | "male"): Promise<Buffer> {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(VOICES[voiceKey], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = await tts.toStream(escapeXml(text));
    const parts: Buffer[] = [];
    for await (const chunk of audioStream) {
      parts.push(Buffer.from(chunk as ArrayBuffer));
    }
    const buffer = Buffer.concat(parts);
    if (buffer.length < 512) throw new Error("audio vacío");
    return buffer;
  } finally {
    try {
      tts.close();
    } catch {
      // cierre best-effort
    }
  }
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; voice?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  const voiceKey: "female" | "male" = body.voice === "male" ? "male" : "female";

  if (!rawText) {
    return NextResponse.json({ error: "Texto vacío" }, { status: 400 });
  }
  if (rawText.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "Texto demasiado largo" }, { status: 400 });
  }

  // 2 intentos: la conexión con el servicio de voces puede fallar de forma transitoria
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const audio = await synthesize(rawText, voiceKey);
      return new NextResponse(new Uint8Array(audio), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "Content-Length": String(audio.length),
        },
      });
    } catch (err) {
      lastError = err;
    }
  }

  console.error("[/api/tts] fallo al sintetizar:", lastError);
  return NextResponse.json({ error: "No se pudo generar el audio" }, { status: 502 });
}

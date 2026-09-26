import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHUNK_LENGTH = 1024;

/**
 * Motor "Voz HD (servidor)" — OPCIONAL.
 *
 * Sin configuración, este endpoint responde 501 y el cliente usa
 * automáticamente la voz gratuita del navegador (Web Speech API).
 *
 * Para activar las voces neuronales HD, define la variable de entorno
 * OPENAI_API_KEY (en local: archivo .env ; en Vercel: Settings →
 * Environment Variables). No se necesita ningún paquete extra.
 */

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const gender = body.voice === "male" ? "male" : "female";
    const speedRaw = Number(body.speed);
    const speed = clamp(Number.isFinite(speedRaw) ? speedRaw : 1, 0.5, 2);

    if (!text) {
      return NextResponse.json({ error: "No hay texto para leer." }, { status: 400 });
    }
    if (text.length > MAX_CHUNK_LENGTH) {
      return NextResponse.json(
        { error: `Fragmento demasiado largo (máx. ${MAX_CHUNK_LENGTH} caracteres).` },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          code: "NO_PROVIDER",
          error:
            "El servidor no tiene un proveedor de voz configurado. Añade OPENAI_API_KEY para usar voces HD, o selecciona el motor «Voz del navegador», que es gratuito.",
        },
        { status: 501 }
      );
    }

    // OpenAI TTS: voces femeninas (nova/coral/shimmer) y masculinas (onyx/echo/ash)
    const openaiVoice = gender === "male" ? "onyx" : "nova";

    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: openaiVoice,
        speed: clamp(speed, 0.25, 4),
        response_format: "mp3",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("[api/tts] Proveedor de voz falló:", upstream.status, detail.slice(0, 300));
      return NextResponse.json(
        {
          error: `El proveedor de voz falló (HTTP ${upstream.status}). Verifica tu OPENAI_API_KEY o usa el motor del navegador.`,
        },
        { status: 502 }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    if (buffer.length < 100) {
      return NextResponse.json(
        { error: "El proveedor devolvió un audio vacío. Intenta de nuevo." },
        { status: 502 }
      );
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/tts] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Error al generar el audio: ${error.message}`
            : "Error al generar el audio. Intenta de nuevo.",
      },
      { status: 500 }
    );
  }
}

/**
 * Utilidades para LectorVoz:
 * - Fragmentación de texto en trozos compatibles con TTS (máx. 1024 caracteres)
 * - Estimación de duración de lectura
 * - Formateo de tiempos
 */

export interface TextChunk {
  index: number;
  text: string;
}

/** Tamaño máximo seguro por fragmento (el límite de la API es 1024) */
const MAX_CHUNK_LENGTH = 800;

/**
 * Divide un párrafo largo en oraciones, respetando signos de apertura
 * españoles (¿ ¡) y puntos suspensivos.
 */
function splitIntoSentences(paragraph: string): string[] {
  // Inserta un separador después de ., !, ?, … si no es una abreviatura numérica
  const normalized = paragraph.replace(/([.!?…])(\s+)/g, "$1\u0000$2");
  return normalized
    .split("\u0000")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Divide una oración demasiado larga en trozos más pequeños,
 * primero por comas/punto y coma, luego de forma forzada por palabras.
 */
function splitLongSentence(sentence: string, maxLen: number): string[] {
  if (sentence.length <= maxLen) return [sentence];

  const results: string[] = [];
  // Intento 1: dividir por comas, punto y coma o dos puntos
  const segments = sentence.split(/(?<=[,;:])\s+/);
  let current = "";

  for (const seg of segments) {
    if (seg.length > maxLen) {
      // Intento 2: corte forzado por palabras
      if (current) {
        results.push(current.trim());
        current = "";
      }
      let line = "";
      for (const word of seg.split(/\s+/)) {
        if ((line + " " + word).trim().length > maxLen && line) {
          results.push(line.trim());
          line = word;
        } else {
          line = (line + " " + word).trim();
        }
      }
      if (line.trim()) results.push(line.trim());
      continue;
    }

    if ((current + " " + seg).trim().length > maxLen && current) {
      results.push(current.trim());
      current = seg;
    } else {
      current = (current + " " + seg).trim();
    }
  }
  if (current.trim()) results.push(current.trim());
  return results;
}

/**
 * Divide el texto completo en fragmentos listos para TTS.
 * Agrupa oraciones hasta MAX_CHUNK_LENGTH, nunca corta a mitad de oración
 * salvo que la oración sea más larga que el máximo.
 */
export function splitTextIntoChunks(text: string): TextChunk[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHUNK_LENGTH) {
      // Agrupa párrafos cortos consecutivos en un mismo fragmento
      const last = chunks[chunks.length - 1];
      if (last && (last + "\n" + paragraph).length <= MAX_CHUNK_LENGTH) {
        chunks[chunks.length - 1] = last + "\n" + paragraph;
      } else {
        chunks.push(paragraph);
      }
      continue;
    }

    // Párrafo largo: acumula oraciones
    let current = "";
    for (const sentence of splitIntoSentences(paragraph)) {
      if (sentence.length > MAX_CHUNK_LENGTH) {
        if (current) {
          chunks.push(current.trim());
          current = "";
        }
        chunks.push(...splitLongSentence(sentence, MAX_CHUNK_LENGTH));
        continue;
      }
      if ((current + " " + sentence).trim().length > MAX_CHUNK_LENGTH && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = (current + " " + sentence).trim();
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  return chunks.map((text, index) => ({ index, text: text.trim() }));
}

/** Cuenta palabras de un texto */
export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return matches ? matches.length : 0;
}

/**
 * Estima la duración de lectura en segundos.
 * Promedio de lectura hablada: ~150 palabras por minuto a velocidad 1x.
 */
export function estimateSeconds(words: number, speed: number): number {
  if (words <= 0) return 0;
  return Math.round((words / 150) * 60 / speed);
}

/** Formatea segundos como "1h 05 min", "5 min 30 s" o "45 s" */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 1) return "0 s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, "0")} s`;
  return `${seconds} s`;
}

/** Formatea segundos como reloj de reproductor: "4:07" u "1:02:33" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Segmento de habla: texto + offset absoluto dentro del fragmento original */
export interface SpeechSegment {
  offset: number;
  text: string;
}

/**
 * Divide el texto en segmentos del tamaño de una oración (con offset absoluto).
 *
 * Se usa para la lectura con la voz del navegador: cada segmento se sintetiza
 * justo ANTES de hablarse, así un cambio de velocidad se aplica en la siguiente
 * oración sin cortar, reiniciar ni repetir nada de la lectura en curso.
 *
 * Reglas de corte: tras puntuación fuerte (.!?…) si el bloque ya tiene ≥40
 * caracteres; tras puntuación suave (,;:) si supera ~150; y corte forzado por
 * palabra como último recurso. `from` permite empezar desde cualquier carácter
 * (salto de la barra de progreso).
 *
 * Segmentos cortos = al cambiar la velocidad, la nueva tarifa se nota en
 * pocos segundos, sin cortar ni repetir nada de la lectura en curso.
 */
export function splitSpeechSegments(
  text: string,
  from = 0,
  maxLen = 150
): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  let start = Math.min(Math.max(0, from), text.length);
  let i = start;

  while (i < text.length) {
    const prevChar = text[i];
    i += 1;
    const len = i - start;
    const nextChar = i < text.length ? text[i] : "";
    const hardCut = ".!?…".includes(prevChar) && (nextChar === "" || /\s/.test(nextChar));
    const softCut = ",;:".includes(prevChar) && (nextChar === "" || /\s/.test(nextChar));
    const forced = (len >= maxLen && /\s/.test(nextChar)) || len > maxLen + 80;

    if ((hardCut && len >= 40) || (softCut && len >= 150) || forced) {
      const slice = text.slice(start, i);
      if (slice.trim()) segments.push({ offset: start, text: slice.trim() });
      while (i < text.length && /\s/.test(text[i])) i += 1;
      start = i;
    }
  }

  const tail = text.slice(start);
  if (tail.trim()) segments.push({ offset: start, text: tail.trim() });
  return segments;
}

/** Limpia texto extraído de documentos */
export function cleanExtractedText(raw: string): string {
  return raw
    // Normaliza fines de línea
    .replace(/\r\n?/g, "\n")
    // Une palabras cortadas por guión al final de línea: "pala-\nbra" → "palabra"
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    // Colapsa espacios y tabulaciones dentro de cada línea
    .replace(/[ \t]+/g, " ")
    // Elimina espacios al final de las líneas
    .replace(/ +\n/g, "\n")
    // Colapsa más de 2 saltos de línea consecutivos
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

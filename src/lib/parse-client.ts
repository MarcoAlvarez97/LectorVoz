/**
 * Análisis de documentos 100% en el navegador (funciona SIN CONEXIÓN).
 *
 * - PDF  → pdfjs-dist (worker incluido en el bundle)
 * - DOCX → mammoth (build de navegador)
 * - TXT / MD / CSV → FileReader nativo
 *
 * Reemplaza al antiguo endpoint /api/parse: así el paso "Análisis" del
 * flujo funciona incluso en modo avión, una vez cargada la app.
 */

import { cleanExtractedText, countWords } from "@/lib/lector";

export interface ParsedDoc {
  filename: string;
  ext: string;
  sizeBytes: number;
  text: string;
  truncated: boolean;
  words: number;
  chars: number;
  paragraphs: number;
}

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_TEXT_LENGTH = 2_000_000; // ~320.000 palabras
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "csv"];

class ParseError extends Error {}

/** Extrae el texto de un PDF usando pdfjs-dist en el hilo del navegador */
async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // Worker como module worker empaquetado por el bundler (Turbopack/webpack)
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" }
    );
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const maxPages = Math.min(doc.numPages, 2000);
  let rawText = "";
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) {
        rawText += item.str + (item.hasEOL ? "\n" : "");
      }
    }
    rawText += "\n";
    page.cleanup();
  }
  await doc.destroy();
  return rawText;
}

/** Extrae el texto de un DOCX con el build de navegador de mammoth */
async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

/** Lee archivos de texto plano y detecta binarios disfrazados */
async function extractPlainText(file: File): Promise<string> {
  const rawText = await file.text();
  const controlChars = rawText.replace(/[\t\n\r\u0020-\u007E\u00A0-\u024F]/g, "");
  if (rawText.length > 0 && controlChars.length / rawText.length > 0.1) {
    throw new ParseError("El archivo parece binario o corrupto y no contiene texto legible.");
  }
  return rawText;
}

/** Analiza un documento en el dispositivo y devuelve texto + estadísticas */
export async function parseFileClient(file: File): Promise<ParsedDoc> {
  const filename = file.name || "documento";
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (file.size === 0) {
    throw new ParseError("El archivo está vacío.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ParseError("El archivo supera el límite de 200 MB.");
  }
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new ParseError(
      `Formato no soportado: .${ext || "desconocido"}. Los formatos aceptados son PDF, DOCX, TXT, MD y CSV.`
    );
  }

  let rawText = "";
  try {
    if (ext === "pdf") {
      rawText = await extractPdf(file);
    } else if (ext === "docx") {
      rawText = await extractDocx(file);
    } else {
      rawText = await extractPlainText(file);
    }
  } catch (err) {
    if (err instanceof ParseError) throw err;
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException" || name === "PasswordError") {
      throw new ParseError("El PDF está protegido con contraseña. Quítala e intenta de nuevo.");
    }
    if (name === "InvalidPDFException") {
      throw new ParseError("El archivo no es un PDF válido o está dañado.");
    }
    throw new ParseError(
      err instanceof Error
        ? `No se pudo leer el documento: ${err.message}`
        : "No se pudo leer el documento. Verifica que no esté dañado."
    );
  }

  const text = cleanExtractedText(rawText);
  if (!text || countWords(text) === 0) {
    throw new ParseError(
      "El documento no contiene texto legible (puede ser un PDF escaneado como imagen). Prueba con un documento con texto real."
    );
  }

  let truncated = false;
  let finalText = text;
  if (text.length > MAX_TEXT_LENGTH) {
    const cutPoint = text.lastIndexOf("\n", MAX_TEXT_LENGTH);
    finalText = text.slice(0, cutPoint > MAX_TEXT_LENGTH * 0.8 ? cutPoint : MAX_TEXT_LENGTH);
    truncated = true;
  }

  return {
    filename,
    ext,
    sizeBytes: file.size,
    text: finalText,
    truncated,
    words: countWords(finalText),
    chars: finalText.length,
    paragraphs: finalText.split(/\n+/).filter((p) => p.trim()).length,
  };
}

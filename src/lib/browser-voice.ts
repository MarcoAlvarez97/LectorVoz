/**
 * Voces en español del navegador (Web Speech API).
 *
 * Cada dispositivo ofrece voces distintas (Chrome, Edge, Windows, macOS,
 * Android, iOS…). Elegimos la mejor coincidencia según el género usando
 * listas de nombres conocidos, dando PRIORIDAD a las voces locales
 * (voice.localService) porque funcionan SIN CONEXIÓN.
 */

export interface VoiceOption {
  /** Identificador único de la voz (voiceURI) */
  uri: string;
  name: string;
  /** true si la voz está instalada en el dispositivo → funciona offline */
  local: boolean;
  lang: string;
  gender: "female" | "male" | "unknown";
}

const FEMALE_HINTS = [
  "sabina",
  "helena",
  "mónica",
  "monica",
  "paulina",
  "maría",
  "maria",
  "esperanza",
  "marisol",
  "elvira",
  "francisca",
  "laura",
  "hortencia",
  "dolores",
  "isabela",
  "paloma",
  "lucía",
  "lucia",
  "dalia",
  "ximena",
  "renata",
  "yolanda",
  "isidora",
  "catalina",
  "valentina",
  "luciana",
  "camila",
  "salomé",
  "salome",
  "alba",
  "irene",
  "laia",
  "sabela",
  "abril",
  "estrella",
  "rocío",
  "rocio",
  "alma",
  "samantha",
  "isabella",
  "angélica",
  "angelica",
  "soledad",
  "google español", // voz por defecto de Android/Chrome (femenina)
];

const MALE_HINTS = [
  "pablo",
  "jorge",
  "diego",
  "juan",
  "carlos",
  "andrés",
  "andres",
  "álvaro",
  "alvaro",
  "raúl",
  "raul",
  "gerardo",
  "luciano",
  "francisco",
  "tomás",
  "tomas",
  "mateo",
  "lorenzo",
  "mario",
  "gonzalo",
  "arnau",
  "gerard",
  "darío",
  "dario",
  "emilio",
  "teo",
  "saúl",
  "saul",
];

/** Clasifica el género probable de una voz por su nombre */
function classifyGender(name: string): "female" | "male" | "unknown" {
  const lower = name.toLowerCase();
  if (FEMALE_HINTS.some((hint) => lower.includes(hint))) return "female";
  if (MALE_HINTS.some((hint) => lower.includes(hint))) return "male";
  return "unknown";
}

/** Devuelve todas las voces en español disponibles en el dispositivo */
export function getSpanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("es"));
}

/**
 * Lista completa de voces en español para el selector.
 * Orden: locales primero (offline), luego por género conocido y nombre.
 */
export function getSpanishVoiceOptions(): VoiceOption[] {
  return getSpanishVoices()
    .map((v) => ({
      uri: v.voiceURI,
      name: v.name,
      local: v.localService,
      lang: v.lang,
      gender: classifyGender(v.name),
    }))
    .sort((a, b) => {
      if (a.local !== b.local) return a.local ? -1 : 1;
      const ga = a.gender === "unknown" ? 1 : 0;
      const gb = b.gender === "unknown" ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name, "es");
    });
}

/**
 * Elige la mejor voz en español según el género (y una voz preferida opcional).
 * Prioriza voces locales (offline) y coincidencias de nombre conocidas.
 */
export function pickSpanishVoice(
  gender: "female" | "male",
  preferredUri?: string | null
): SpeechSynthesisVoice | null {
  const voices = getSpanishVoices();
  if (voices.length === 0) return null;

  if (preferredUri) {
    const preferred = voices.find((v) => v.voiceURI === preferredUri);
    if (preferred) return preferred;
  }

  const hints = gender === "female" ? FEMALE_HINTS : MALE_HINTS;

  // 1) Voz local con nombre conocido del género pedido
  for (const voice of voices) {
    const name = voice.name.toLowerCase();
    if (voice.localService && hints.some((h) => name.includes(h))) return voice;
  }
  // 2) Cualquier voz con nombre conocido del género pedido
  for (const voice of voices) {
    const name = voice.name.toLowerCase();
    if (hints.some((h) => name.includes(h))) return voice;
  }
  // 3) Primera voz local en español, si existe
  const local = voices.find((v) => v.localService);
  if (local) return local;

  // 4) Primera voz en español disponible
  return voices[0];
}

/** Indica si el navegador soporta síntesis de voz */
export function supportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

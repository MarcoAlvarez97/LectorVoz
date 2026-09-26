/**
 * Voces en español del navegador (Web Speech API).
 *
 * Cada dispositivo ofrece voces distintas (Chrome, Edge, Windows, macOS,
 * Android, iOS…). Elegimos la mejor coincidencia según el género usando
 * listas de nombres conocidos:
 *  - Con internet → priorizamos voces neuronales/naturales (Edge "Natural",
 *    Google…), que suenan mucho más humanas.
 *  - Sin conexión → priorizamos voces locales (voice.localService).
 */

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
  "xóchitl",
  "xochitl",
  "trinidad",
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
  "liberto",
  "nil",
  "salomón",
  "salomon",
  "thiago",
  "yago",
];

/** Detecta voces neuronales de alta calidad (Edge "Natural", Google, neural…) */
function isNaturalVoice(name: string): boolean {
  return /natural|google|neural|neuronal|online/i.test(name);
}

/** Devuelve todas las voces en español disponibles en el dispositivo */
export function getSpanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("es"));
}

/**
 * Elige automáticamente LA mejor voz en español para el género pedido.
 * (La app ofrece exactamente una voz por género: mujer u hombre.)
 *
 * Con internet: prioriza las voces neuronales/naturales del género pedido
 * (Edge "Natural", Google…), que suenan mucho mejor que las clásicas.
 * Sin conexión: prioriza voces locales (offline) del género pedido.
 */
export function pickSpanishVoice(
  gender: "female" | "male",
  online = true
): SpeechSynthesisVoice | null {
  const voices = getSpanishVoices();
  if (voices.length === 0) return null;

  const hints = gender === "female" ? FEMALE_HINTS : MALE_HINTS;
  const matchesGender = (v: SpeechSynthesisVoice) =>
    hints.some((h) => v.name.toLowerCase().includes(h));
  const isNatural = (v: SpeechSynthesisVoice) => isNaturalVoice(v.name);

  // Con internet: 1ª) natural del género pedido — calidad máxima
  if (online) {
    for (const voice of voices) {
      if (matchesGender(voice) && isNatural(voice)) return voice;
    }
  }
  // 2) Voz local con nombre conocido del género pedido
  for (const voice of voices) {
    if (voice.localService && matchesGender(voice)) return voice;
  }
  // 3) Cualquier voz con nombre conocido del género pedido
  for (const voice of voices) {
    if (matchesGender(voice)) return voice;
  }
  // 4) Natural aunque el género sea desconocido (si hay internet)
  if (online) {
    for (const voice of voices) {
      if (isNatural(voice)) return voice;
    }
  }
  // 5) Primera voz local en español, si existe
  const local = voices.find((v) => v.localService);
  if (local) return local;

  // 6) Primera voz en español disponible
  return voices[0];
}

/** Indica si el navegador soporta síntesis de voz */
export function supportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

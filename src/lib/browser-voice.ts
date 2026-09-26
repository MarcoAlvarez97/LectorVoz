/**
 * Voces en español del navegador (Web Speech API).
 *
 * La app ofrece EXACTAMENTE una voz por género (mujer / hombre). Este módulo
 * elige automáticamente la mejor voz disponible del dispositivo:
 *
 *  - MUJER: solo voces con nombre femenino o de género desconocido.
 *    JAMÁS devuelve una voz con nombre masculino (fix: "la voz de mujer
 *    suena a hombre").
 *  - HOMBRE: primero una voz masculina natural; si el dispositivo no tiene
 *    ninguna, usa la mejor voz femenina/neutra del dispositivo con el tono
 *    (pitch) bajado a nivel grave, para que suene a hombre en vez de a una
 *    voz robótica horrible.
 *  - Se vetan los motores robóticos (Pico, eSpeak…) salvo que no quede
 *    otra opción.
 *  - Con internet prioriza voces neuronales/naturales (Google, Edge
 *    "Natural"…); sin conexión, voces locales instaladas.
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
  "ines",
  "inés",
  "lola",
  "tania",
  "carmen",
  "conchita",
  "montserrat",
  "sofía",
  "sofia",
  "emilia",
  "elena",
  "gabriela",
  "verónica",
  "veronica",
  "patricia",
  "silvia",
  "beatriz",
  "noelia",
  "loreto",
  "esperanza",
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
  "miguel",
  "josé",
  "jose",
  "luis",
  "antonio",
  "manuel",
  "javier",
  "sergio",
  "daniel",
  "alejandro",
  "rafael",
  "hector",
  "héctor",
  "salvador",
  "enrique",
  "terencio",
  "valerio",
  "arnau",
];

/** Motores robóticos que suenan horrible: se evitan siempre que se pueda */
const ROBOTIC_HINTS = ["pico", "espeak", "festival", "freetts", "ekho"];

/** Tono grave aplicado cuando se simula una voz masculina */
const MALE_SIMULATED_PITCH = 0.7;

export interface PickedVoice {
  voice: SpeechSynthesisVoice;
  /** 1 = tono normal; < 1 = tono grave (hombre simulado) */
  pitch: number;
  /** true si la voz masculina se logró bajando el tono de otra voz */
  simulated: boolean;
}

function normalize(name: string): string {
  return name.toLowerCase();
}

/** Palabras explícitas de género en el nombre ("Female", "mujer"…) */
function hasFemaleWord(name: string): boolean {
  return /(^|[^a-z])(female|mujer|femenin)/i.test(name);
}

function hasMaleWord(name: string): boolean {
  // OJO: "female" contiene "male", por eso se excluye primero
  return !hasFemaleWord(name) && /(^|[^a-z])(male|hombre|masculin)/i.test(name);
}

/** Detecta voces neuronales de alta calidad (Edge "Natural", Google…) */
function isNaturalVoice(name: string): boolean {
  return /natural|google|neural|neuronal|online/i.test(name);
}

function isRobotic(name: string): boolean {
  return ROBOTIC_HINTS.some((h) => name.includes(h));
}

/** Devuelve todas las voces en español disponibles en el dispositivo */
export function getSpanishVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("es"));
}

/**
 * Espera a que el dispositivo cargue su lista de voces (Chrome la carga de
 * forma asíncrona). Resuelve en cuanto haya voces o al agotar el timeout.
 */
export function ensureVoices(timeoutMs = 2500): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener("voiceschanged", finish);
      clearInterval(poll);
      clearTimeout(timer);
      resolve();
    };
    const poll = setInterval(() => {
      if (synth.getVoices().length > 0) finish();
    }, 120);
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish);
  });
}

/** Ordena candidatos por calidad: natural (con internet) → local → resto */
function sortByQuality(voices: SpeechSynthesisVoice[], online: boolean): SpeechSynthesisVoice[] {
  const score = (v: SpeechSynthesisVoice) => {
    const name = normalize(v.name);
    let s = 0;
    if (online && isNaturalVoice(name)) s -= 100; // suenan mucho mejor
    if (v.default) s -= 10;
    if (!v.localService && !isNaturalVoice(name)) s -= 5; // remotas viejas: peor
    return s;
  };
  return [...voices].sort((a, b) => score(a) - score(b));
}

/**
 * Elige LA voz para el género pedido. Devuelve voz + tono a aplicar.
 * - gender "female": nunca devuelve una voz de nombre masculino.
 * - gender "male": si no hay voces masculinas utilizables, simula una
 *   bajando el tono de la mejor voz del dispositivo.
 */
export function pickSpanishVoice(
  gender: "female" | "male",
  online = true
): PickedVoice | null {
  const voices = getSpanishVoices();
  if (voices.length === 0) return null;

  const info = voices.map((v) => {
    const name = normalize(v.name);
    return {
      voice: v,
      name,
      female: FEMALE_HINTS.some((h) => name.includes(h)) || hasFemaleWord(name),
      male: MALE_HINTS.some((h) => name.includes(h)) || hasMaleWord(name),
      robotic: isRobotic(name),
      natural: isNaturalVoice(name),
    };
  });

  const ok = (x: (typeof info)[number]) => !x.robotic;

  // ---------- MUJER ----------
  if (gender === "female") {
    const femaleOk = sortByQuality(
      info.filter((x) => x.female && !x.male && ok(x)).map((x) => x.voice),
      online
    );
    if (femaleOk.length > 0) return { voice: femaleOk[0], pitch: 1, simulated: false };

    // Género desconocido (no masculino): Google español, voces por defecto…
    const neutralOk = sortByQuality(
      info.filter((x) => !x.male && ok(x)).map((x) => x.voice),
      online
    );
    if (neutralOk.length > 0) return { voice: neutralOk[0], pitch: 1, simulated: false };

    // Último recurso: cualquier voz no masculina (aunque sea robótica)
    const anyNotMale = info.filter((x) => !x.male);
    if (anyNotMale.length > 0) return { voice: anyNotMale[0].voice, pitch: 1, simulated: false };

    // Solo hay voces masculinas (rarísimo): sube el tono para feminizar
    const males = sortByQuality(
      info.filter((x) => ok(x)).map((x) => x.voice),
      online
    );
    const chosen = males[0] ?? voices[0];
    return { voice: chosen, pitch: 1.45, simulated: true };
  }

  // ---------- HOMBRE ----------
  const maleOk = sortByQuality(
    info.filter((x) => x.male && !x.female && ok(x)).map((x) => x.voice),
    online
  );
  if (maleOk.length > 0) return { voice: maleOk[0], pitch: 1, simulated: false };

  // Sin voces masculinas decentes: la mejor voz del dispositivo con tono grave
  const anyOk = sortByQuality(
    info.filter(ok).map((x) => x.voice),
    online
  );
  if (anyOk.length > 0) return { voice: anyOk[0], pitch: MALE_SIMULATED_PITCH, simulated: true };

  // Solo hay voces robóticas: usa una masculina robótica si existe (sin otra opción)
  const roboticMale = info.find((x) => x.male && !x.female);
  if (roboticMale) return { voice: roboticMale.voice, pitch: 1, simulated: false };
  return { voice: voices[0], pitch: MALE_SIMULATED_PITCH, simulated: true };
}

/** Indica si el navegador soporta síntesis de voz */
export function supportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

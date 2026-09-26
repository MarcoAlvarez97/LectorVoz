"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileSearch,
  ListChecks,
  Pause,
  Play,
  Square,
  UploadCloud,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadZone } from "@/components/lector/upload-zone";
import {
  VoiceSelector,
  type VoiceGender,
} from "@/components/lector/voice-selector";
import { PlayerBar, type PlayerState } from "@/components/lector/player-bar";
import { WalkingMode } from "@/components/lector/walking-mode";
import {
  ensureVoices,
  pickSpanishVoice,
} from "@/lib/browser-voice";
import { parseFileClient } from "@/lib/parse-client";
import { InstallButton, OfflineBadge } from "@/components/lector/pwa";
import { ThemeToggle } from "@/components/lector/theme-toggle";
import {
  splitSpeechSegments,
  estimateSeconds,
  formatDuration,
  splitTextIntoChunks,
  type TextChunk,
} from "@/lib/lector";
import { cn } from "@/lib/utils";

/**
 * Velocidad media de habla en español (caracteres por segundo a 1x).
 * Se usa para el reloj del reproductor y para que la barra de progreso
 * avance SIEMPRE, incluso en dispositivos donde el navegador no dispara
 * los eventos de palabra (onboundary) — error típico de varios Android.
 */
const CHARS_PER_SECOND = 14.5;

interface DocInfo {
  filename: string;
  ext: string;
  sizeBytes: number;
  text: string;
  truncated: boolean;
  words: number;
  chars: number;
  paragraphs: number;
}

export default function Home() {
  // ---------- Estado del documento ----------
  const [isParsing, setIsParsing] = useState(false);
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null);
  const [chunks, setChunks] = useState<TextChunk[]>([]);

  // ---------- Estado del reproductor ----------
  const [state, setState] = useState<PlayerState>("stopped");
  const [currentChunk, setCurrentChunk] = useState(0);
  const [chunkFraction, setChunkFraction] = useState(0);
  const [isLoadingChunk, setIsLoadingChunk] = useState(false);
  const [voice, setVoice] = useState<VoiceGender>("female");
  const [isOffline, setIsOffline] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [walkingOpen, setWalkingOpen] = useState(false);

  // ---------- Refs para la cadena de reproducción ----------
  const playTokenRef = useRef(0);
  const currentChunkRef = useRef(0);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const stateRef = useRef(state);
  const chunksRef = useRef(chunks);
  const isOfflineRef = useRef(isOffline);
  const consecutiveFailuresRef = useRef(0);
  const activeChunkElRef = useRef<HTMLParagraphElement | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Última posición leída (palabra actual) para cambiar voz/velocidad sin volver al inicio */
  const lastBoundaryRef = useRef<{ index: number; charIndex: number }>({ index: 0, charIndex: 0 });
  /** Ancla del reloj: posición exacta conocida + momento en que se midió */
  const boundaryPosRef = useRef<{ index: number; charIndex: number; ts: number }>({
    index: 0,
    charIndex: 0,
    ts: 0,
  });
  /** true si el dispositivo reporta eventos de palabra (onboundary) */
  const boundaryFiredRef = useRef(false);
  /** Voz/velocidad cambiadas en pausa: al reanudar se vuelve a hablar desde la palabra actual */
  const pendingRestartRef = useRef(false);
  const speedRespeakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Desbloqueo de la síntesis de voz en iOS (hablar 1º dentro del gesto) */
  const unlockedRef = useRef(false);

  voiceRef.current = voice;
  speedRef.current = speed;
  stateRef.current = state;
  chunksRef.current = chunks;
  isOfflineRef.current = isOffline;

  const totalChunks = chunks.length;

  // ---------- Watchdog: fix del bug de Chrome que corta audios largos ----------

  const stopResumeWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const startResumeWatchdog = useCallback(() => {
    stopResumeWatchdog();
    watchdogRef.current = setInterval(() => {
      if (
        stateRef.current === "playing" &&
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        window.speechSynthesis.speaking
      ) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10_000);
  }, [stopResumeWatchdog]);

  /** iOS exige una llamada speak() dentro del gesto del usuario para habilitar el audio */
  const unlockSpeech = useCallback(() => {
    if (unlockedRef.current) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      u.lang = "es-ES";
      window.speechSynthesis.speak(u);
      unlockedRef.current = true;
    } catch {
      // navegador sin síntesis: el error real se muestra al intentar leer
    }
  }, []);

  // ---------- Limpieza al desmontar ----------

  useEffect(() => {
    return () => {
      playTokenRef.current++;
      stopResumeWatchdog();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (speedRespeakTimerRef.current) clearTimeout(speedRespeakTimerRef.current);
    };
  }, [stopResumeWatchdog]);

  // ---------- Conexión y precarga de voces ----------

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.getVoices(); // fuerza la carga temprana
    const onChange = () => synth.getVoices();
    synth.addEventListener?.("voiceschanged", onChange);
    return () => synth.removeEventListener?.("voiceschanged", onChange);
  }, []);

  // ---------- Reloj del reproductor (siempre avanza mientras lee) ----------

  useEffect(() => {
    const timer = setInterval(() => {
      if (stateRef.current !== "playing") return;
      const chunk = chunksRef.current[currentChunkRef.current];
      if (!chunk || chunk.text.length === 0) return;
      const cps = CHARS_PER_SECOND * Math.min(2, Math.max(0.5, speedRef.current));
      const b = boundaryPosRef.current;
      if (b.index !== currentChunkRef.current || b.ts <= 0) return;
      const chars = b.charIndex + ((performance.now() - b.ts) / 1000) * cps;
      setChunkFraction(Math.min(0.999, Math.max(0, chars / chunk.text.length)));
    }, 250);
    return () => clearInterval(timer);
  }, []);

  // ---------- Motor del dispositivo (Web Speech API) ----------

  /** Lee un fragmento con la voz del dispositivo, ORACIÓN POR ORACIÓN.
   *
   *  Cada oración se crea justo antes de hablarse con la voz y la velocidad
   *  vigentes en ese momento. startChar > 0 permite retomar desde una palabra
   *  concreta (cambio de voz, de velocidad o salto con la barra). */
  const speakChunkBrowser = useCallback(
    (index: number, token: number, startChar = 0) => {
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) {
        setState("stopped");
        setIsLoadingChunk(false);
        toast({
          title: "Navegador sin síntesis de voz",
          description: "Tu navegador no soporta lectura por voz. Usa Chrome, Edge o Safari.",
          variant: "destructive",
        });
        return;
      }

      // Sin voces instaladas no hay nada que reproducir: avisa una vez y corta
      if (synth.getVoices().length === 0) {
        setState("stopped");
        setIsLoadingChunk(false);
        toast({
          title: "No hay voces disponibles en tu dispositivo",
          description:
            "Instala voces en español (Android: Síntesis de voz · Windows: Configuración → Voz) o prueba en Chrome, Edge o Safari.",
          variant: "destructive",
        });
        return;
      }

      const fullText = chunksRef.current[index]?.text ?? "";
      let from = Math.min(Math.max(0, startChar), fullText.length);
      // Si caemos a mitad de palabra, retrocede al inicio de la palabra
      if (from > 0 && !/\s/.test(fullText[from - 1] ?? " ")) {
        const space = fullText.lastIndexOf(" ", from);
        if (space !== -1 && space > from - 40) from = space + 1;
      }
      lastBoundaryRef.current = { index, charIndex: from };

      const segments = splitSpeechSegments(fullText, from);
      if (segments.length === 0) {
        // Nada por leer desde esa posición: pasa al siguiente fragmento
        if (index + 1 < chunksRef.current.length) {
          playChunkRef.current?.(index + 1);
        } else {
          finishPlaybackRef.current?.();
        }
        return;
      }

      let si = 0;
      const speakNext = () => {
        if (token !== playTokenRef.current) return;
        if (si >= segments.length) {
          // Fragmento completo: encadena el siguiente
          stopResumeWatchdog();
          consecutiveFailuresRef.current = 0;
          setChunkFraction(0.999);
          if (index + 1 < chunksRef.current.length) {
            playChunkRef.current?.(index + 1);
          } else {
            finishPlaybackRef.current?.();
          }
          return;
        }
        const seg = segments[si];
        const utterance = new SpeechSynthesisUtterance(seg.text);
        utterance.lang = "es-ES";
        // Velocidad vigente AL COMENZAR esta oración (cambio sin reiniciar)
        utterance.rate = Math.min(2, Math.max(0.5, speedRef.current));

        // Voz del dispositivo: exactamente una por género (mujer/hombre).
        // Si no hay voz masculina instalada, se simula bajando el tono.
        const picked = pickSpanishVoice(voiceRef.current, !isOfflineRef.current);
        if (picked) {
          utterance.voice = picked.voice;
          utterance.lang = picked.voice.lang;
          utterance.pitch = picked.pitch;
        }

        utterance.onstart = () => {
          if (token !== playTokenRef.current) return;
          setIsLoadingChunk(false);
          // Ancla del reloj para este segmento (los onboundary lo afinan)
          boundaryPosRef.current = {
            index,
            charIndex: seg.offset,
            ts: performance.now(),
          };
        };
        utterance.onboundary = (event) => {
          if (token !== playTokenRef.current) return;
          boundaryFiredRef.current = true;
          const pos = seg.offset + (event.charIndex || 0);
          lastBoundaryRef.current = { index, charIndex: pos };
          boundaryPosRef.current = { index, charIndex: pos, ts: performance.now() };
          if (fullText.length > 0) {
            setChunkFraction(Math.min(0.999, Math.max(0, pos / fullText.length)));
          }
        };
        utterance.onend = () => {
          if (token !== playTokenRef.current) return;
          si += 1;
          speakNext();
        };
        utterance.onerror = (event) => {
          if (token !== playTokenRef.current) return;
          const errorType = (event as SpeechSynthesisErrorEvent).error;
          if (errorType === "interrupted" || errorType === "canceled") return;
          stopResumeWatchdog();
          handleChunkFailureRef.current?.(index, "La voz del navegador falló al leer el fragmento");
        };

        synth.speak(utterance);
      };

      synth.cancel();
      speakNext();
      startResumeWatchdog();
    },
    [startResumeWatchdog, stopResumeWatchdog]
  );

  // ---------- Control de reproducción ----------

  /** Detiene la reproducción y vuelve al inicio */
  const stopPlayback = useCallback(
    (resetPosition = true) => {
      playTokenRef.current++;
      stopResumeWatchdog();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (resetPosition) {
        currentChunkRef.current = 0;
        setCurrentChunk(0);
      }
      setState("stopped");
      setIsLoadingChunk(false);
      consecutiveFailuresRef.current = 0;
      pendingRestartRef.current = false;
      if (speedRespeakTimerRef.current) {
        clearTimeout(speedRespeakTimerRef.current);
        speedRespeakTimerRef.current = null;
      }
      lastBoundaryRef.current = { index: 0, charIndex: 0 };
      boundaryPosRef.current = { index: currentChunkRef.current, charIndex: 0, ts: 0 };
    },
    [stopResumeWatchdog]
  );

  /** Finaliza la lectura completa */
  const finishPlayback = useCallback(() => {
    playTokenRef.current++;
    stopResumeWatchdog();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setState("stopped");
    setIsLoadingChunk(false);
    currentChunkRef.current = 0;
    setCurrentChunk(0);
    setChunkFraction(0);
    toast({
      title: "Lectura completada",
      description: "Escuchaste el documento de principio a fin.",
    });
  }, [stopResumeWatchdog]);

  const finishPlaybackRef = useRef<() => void>(() => {});
  finishPlaybackRef.current = finishPlayback;

  /** Maneja fallos: salta al siguiente fragmento; si fallan 3 seguidos, detiene */
  const handleChunkFailure = useCallback(
    (index: number, message: string) => {
      consecutiveFailuresRef.current++;
      if (consecutiveFailuresRef.current >= 3) {
        stopPlayback(true);
        toast({
          title: "La lectura se detuvo",
          description:
            "Ocurrieron varios errores consecutivos con la voz del dispositivo. Intenta de nuevo.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Fragmento ${index + 1} omitido`,
        description: message,
        variant: "destructive",
      });
      if (index + 1 < chunksRef.current.length) {
        setTimeout(() => playChunkRef.current?.(index + 1), 600);
      } else {
        finishPlaybackRef.current?.();
      }
    },
    [stopPlayback]
  );

  const handleChunkFailureRef = useRef<(index: number, message: string) => void>(() => {});
  handleChunkFailureRef.current = handleChunkFailure;

  /** Reproduce un fragmento y encadena el siguiente al terminar.
   *  startFraction (0–1) permite empezar a mitad del fragmento
   *  (salto con la barra de progreso). */
  const playChunk = useCallback(
    (index: number, startFraction = 0) => {
      const list = chunksRef.current;
      if (index < 0 || index >= list.length) {
        finishPlaybackRef.current?.();
        return;
      }
      const token = ++playTokenRef.current;
      currentChunkRef.current = index;
      setCurrentChunk(index);
      setChunkFraction(startFraction > 0 ? Math.min(0.999, startFraction) : 0);
      setState("playing");

      const startChar =
        startFraction > 0 ? Math.floor(startFraction * (list[index]?.text.length ?? 0)) : 0;
      lastBoundaryRef.current = { index, charIndex: startChar };
      boundaryPosRef.current = { index, charIndex: startChar, ts: 0 };
      setIsLoadingChunk(true);

      const start = () => {
        if (token !== playTokenRef.current) return;
        speakChunkBrowser(index, token, startChar);
      };
      // Chrome carga las voces de forma asíncrona: espera la primera vez
      ensureVoices().then(start);
    },
    [speakChunkBrowser]
  );

  const playChunkRef = useRef<(index: number, startFraction?: number) => void>(() => {});
  playChunkRef.current = playChunk;

  // ---------- Acciones del usuario ----------

  const handlePlayPause = useCallback(() => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (state === "playing") {
      if (isLoadingChunk) {
        // Todavía no empezó a sonar: corta la cadena y marca para retomar
        playTokenRef.current++;
        synth?.cancel();
        setIsLoadingChunk(false);
        pendingRestartRef.current = true;
      } else {
        synth?.pause();
      }
      setState("paused");
      return;
    }
    if (state === "paused") {
      // Si se cambió voz/velocidad en pausa, o el navegador no conservó la
      // pausa (iOS), retoma desde la palabra actual con la configuración nueva
      if (pendingRestartRef.current || !synth?.speaking) {
        pendingRestartRef.current = false;
        const { index, charIndex } = lastBoundaryRef.current;
        unlockSpeech();
        const token = ++playTokenRef.current;
        setState("playing");
        startResumeWatchdog();
        // Reancla el reloj en "ahora" para no contar el tiempo de pausa
        boundaryPosRef.current = { index: currentChunkRef.current, charIndex, ts: performance.now() };
        speakChunkBrowser(index, token, charIndex);
        return;
      }
      if (boundaryPosRef.current.ts > 0) {
        boundaryPosRef.current.ts = performance.now();
      }
      synth?.resume();
      setState("playing");
      startResumeWatchdog();
      return;
    }
    // stopped
    unlockSpeech();
    playChunkRef.current?.(currentChunkRef.current);
  }, [state, isLoadingChunk, startResumeWatchdog, unlockSpeech]);

  const handleStop = useCallback(() => {
    stopPlayback(true);
    setWalkingOpen(false);
  }, [stopPlayback]);

  const handlePrev = useCallback(() => {
    const target = Math.max(0, currentChunkRef.current - 1);
    unlockSpeech();
    playChunkRef.current?.(target);
  }, [unlockSpeech]);

  const handleNext = useCallback(() => {
    const target = Math.min(chunksRef.current.length - 1, currentChunkRef.current + 1);
    unlockSpeech();
    playChunkRef.current?.(target);
  }, [unlockSpeech]);

  /** Relee desde la palabra en curso: se usa al cambiar de voz o de velocidad.
   *  NO reinicia la lectura: continúa exactamente por el mismo punto. */
  const respeakFromCurrentWord = useCallback(() => {
    const { index, charIndex } = lastBoundaryRef.current;
    if (index !== currentChunkRef.current) {
      playChunkRef.current?.(currentChunkRef.current);
      return;
    }
    const token = ++playTokenRef.current;
    setState("playing");
    startResumeWatchdog();
    boundaryPosRef.current = { index, charIndex, ts: performance.now() };
    speakChunkBrowser(index, token, charIndex);
  }, [speakChunkBrowser, startResumeWatchdog]);

  const respeakFromCurrentWordRef = useRef<() => void>(() => {});
  respeakFromCurrentWordRef.current = respeakFromCurrentWord;

  /** Cambio de voz (género): EXACTAMENTE una voz por género. Retoma desde la
   *  palabra actual para que suene la voz nueva desde ese punto. */
  const handleVoiceChange = useCallback(
    (v: VoiceGender) => {
      if (v === voiceRef.current) return;
      setVoice(v);
      voiceRef.current = v;
      if (stateRef.current === "playing") {
        respeakFromCurrentWordRef.current?.();
      } else if (stateRef.current === "paused") {
        window.speechSynthesis?.cancel();
        pendingRestartRef.current = true;
      }
    },
    []
  );

  /** Cambio de velocidad SIN reiniciar la lectura, JAMÁS:
   *  - Lee desde la palabra en curso con la nueva velocidad (se nota al
   *    instante y sigue por el mismo punto, sin volver al inicio).
   *  - Si el dispositivo no reporta la palabra actual, la oración nueva ya
   *    sale con la velocidad nueva (los segmentos son cortos, ~5 segundos).
   *  La posición de lectura SOLO la cambia el usuario (barra o botones). */
  const handleSpeedChange = useCallback(
    (s: number) => {
      setSpeed(s);
      speedRef.current = s;
      if (speedRespeakTimerRef.current) clearTimeout(speedRespeakTimerRef.current);
      if (boundaryFiredRef.current && stateRef.current === "playing") {
        // debounce: mientras se arrastra el slider, aplica una sola vez al soltar
        speedRespeakTimerRef.current = setTimeout(() => {
          speedRespeakTimerRef.current = null;
          if (stateRef.current === "playing") respeakFromCurrentWordRef.current?.();
        }, 220);
      } else if (boundaryFiredRef.current && stateRef.current === "paused") {
        pendingRestartRef.current = true;
      }
    },
    []
  );

  /** Salto de posición con la barra de audio (0–100). Solo el usuario mueve
   *  la posición de lectura; se retoma exactamente desde ese punto.
   *  El mapeo usa fragmentos (igual que la barra de progreso mostrada):
   *  así la barra y el reloj coinciden siempre con donde se salta. */
  const handleSeek = useCallback(
    (percent: number) => {
      const list = chunksRef.current;
      if (list.length === 0) return;

      const clamped = Math.min(100, Math.max(0, percent));
      const globalPos = (clamped / 100) * list.length;
      let idx = Math.floor(globalPos);
      idx = Math.min(list.length - 1, Math.max(0, idx));
      const fraction = Math.min(0.999, globalPos - idx);
      const len = list[idx].text.length || 1;

      if (stateRef.current === "stopped") {
        // Detenido: la barra elige el fragmento desde el que comenzará
        currentChunkRef.current = idx;
        setCurrentChunk(idx);
        setChunkFraction(0);
        return;
      }

      unlockSpeech();
      const startChar = Math.floor(fraction * len);
      const token = ++playTokenRef.current;
      setState("playing");
      startResumeWatchdog();
      lastBoundaryRef.current = { index: idx, charIndex: startChar };
      boundaryPosRef.current = { index: idx, charIndex: startChar, ts: performance.now() };
      setIsLoadingChunk(true);
      speakChunkBrowser(idx, token, startChar);
    },
    [speakChunkBrowser, startResumeWatchdog, unlockSpeech]
  );

  // ---------- Carga y análisis del documento ----------

  const handleFileSelected = useCallback(
    async (file: File) => {
      setIsParsing(true);
      try {
        // Análisis 100% en el dispositivo: funciona incluso sin conexión
        const parsed = await parseFileClient(file);
        stopPlayback(true);
        setDocInfo({
          filename: parsed.filename,
          ext: parsed.ext,
          sizeBytes: parsed.sizeBytes,
          text: parsed.text,
          truncated: parsed.truncated,
          words: parsed.words,
          chars: parsed.chars,
          paragraphs: parsed.paragraphs,
        });
        setChunks(splitTextIntoChunks(parsed.text));
        toast({
          title: "Documento analizado",
          description: `${parsed.words.toLocaleString("es")} palabras listas para escuchar.`,
        });
      } catch (err) {
        toast({
          title: "No se pudo procesar el documento",
          description: err instanceof Error ? err.message : "Intenta con otro archivo.",
          variant: "destructive",
        });
      } finally {
        setIsParsing(false);
      }
    },
    [stopPlayback]
  );

  const handleNewDocument = useCallback(() => {
    stopPlayback(true);
    setWalkingOpen(false);
    setDocInfo(null);
    setChunks([]);
  }, [stopPlayback]);

  // ---------- Auto-scroll al fragmento actual ----------

  useEffect(() => {
    if (state === "stopped" || walkingOpen) return;
    activeChunkElRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentChunk, state, walkingOpen]);

  // ---------- Derivados ----------

  const estimatedSeconds = useMemo(
    () => (docInfo ? estimateSeconds(docInfo.words, speed) : 0),
    [docInfo, speed]
  );

  const progressPercent =
    totalChunks > 0
      ? ((currentChunk + (state !== "stopped" ? chunkFraction : 0)) / totalChunks) * 100
      : 0;


  const phase = !docInfo && !isParsing ? 1 : isParsing ? 2 : 3;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-emerald-950/30 dark:via-zinc-950 dark:to-zinc-950">
      {/* Encabezado */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo propio de LectorVoz */}
            <img
              src="/icons/icon-192.png"
              alt="Logo de LectorVoz"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl shadow-sm"
            />
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight text-foreground">
                LectorVoz
              </h1>
              <p className="text-xs text-muted-foreground">
                Escucha tus documentos · funciona offline
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <OfflineBadge />
            <InstallButton />
            {docInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewDocument}
                className="min-h-[44px] rounded-full"
              >
                <UploadCloud className="mr-1.5 h-4 w-4" />
                Nuevo
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-3xl flex-1 px-4 pt-6", docInfo ? "pb-44" : "pb-10")}>
        {/* Pasos 1-2-3 */}
        <ol className="mb-4 flex items-center justify-center gap-1.5 overflow-x-auto text-xs sm:gap-3 sm:text-sm">
          <Step n={1} label="Cargar documento" shortLabel="Cargar" active={phase === 1} done={phase > 1} />
          <StepConnector done={phase > 1} />
          <Step n={2} label="Análisis" shortLabel="Analizar" active={phase === 2} done={phase > 2} />
          <StepConnector done={phase > 2} />
          <Step
            n={3}
            label="Comenzar lectura"
            shortLabel="Leer"
            active={phase === 3}
            done={state === "stopped" && phase === 3 && currentChunk > 0}
          />
        </ol>

        {/* Paso 1: carga */}
        {!docInfo && <UploadZone onFileSelected={handleFileSelected} isParsing={isParsing} />}

        {docInfo && (
          <div className="space-y-4">
            {/* Tarjeta del documento analizado */}
            <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground" title={docInfo.filename}>
                      {docInfo.filename}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        {docInfo.ext.toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {docInfo.sizeBytes < 1024
                          ? `${docInfo.sizeBytes} B`
                          : `${(docInfo.sizeBytes / 1024).toFixed(0)} KB`}
                      </span>
                    </div>
                  </div>
                  <FileSearch className="h-8 w-8 shrink-0 text-emerald-600/70" strokeWidth={1.5} />
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Stat label="Palabras" value={docInfo.words.toLocaleString("es")} />
                  <Stat label="Caracteres" value={docInfo.chars.toLocaleString("es")} />
                  <Stat label="Párrafos" value={docInfo.paragraphs.toLocaleString("es")} />
                  <Stat label="Duración estimada" value={formatDuration(estimatedSeconds)} />
                </div>

                {docInfo.truncated && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                    El documento es muy extenso: se leerán las primeras{" "}
                    {docInfo.words.toLocaleString("es")} palabras ({docInfo.chars.toLocaleString("es")} caracteres).
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Configuración de voz y velocidad */}
            <section aria-label="Configuración de voz">
              <VoiceSelector
                voice={voice}
                onVoiceChange={handleVoiceChange}
                speed={speed}
                onSpeedChange={handleSpeedChange}
                disabled={state === "playing" && isLoadingChunk}
              />
            </section>

            {/* Botón principal: Comenzar lectura */}
            <Button
              size="lg"
              onClick={state === "playing" ? handleStop : handlePlayPause}
              disabled={totalChunks === 0}
              className={cn(
                "h-14 w-full rounded-2xl text-lg font-semibold shadow-md transition-all active:scale-[0.99] sm:h-16",
                state === "playing"
                  ? "border border-zinc-300 bg-white text-foreground shadow-sm hover:bg-zinc-50"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              {state === "playing" ? (
                <>
                  <Square className="mr-2 h-5 w-5" fill="currentColor" />
                  Detener lectura
                </>
              ) : state === "paused" ? (
                <>
                  <Pause className="mr-2 h-5 w-5" fill="currentColor" />
                  Reanudar lectura
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" fill="currentColor" />
                  Comenzar lectura
                </>
              )}
            </Button>

            {/* Texto sincronizado */}
            <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    Texto del documento
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {totalChunks} fragmentos de audio
                  </span>
                </div>
                <div className="max-h-[45vh] space-y-2 overflow-y-auto rounded-lg bg-zinc-50/70 p-3 dark:bg-zinc-900/50">
                  {chunks.map((chunk) => {
                    const isActive = chunk.index === currentChunk && state !== "stopped";
                    const isPast = chunk.index < currentChunk;
                    return (
                      <p
                        key={chunk.index}
                        ref={isActive ? activeChunkElRef : undefined}
                        onClick={() => {
                          if (state !== "stopped") {
                            unlockSpeech();
                            playChunkRef.current?.(chunk.index);
                          }
                        }}
                        className={cn(
                          "rounded-lg p-3 text-[15px] leading-relaxed transition-colors [content-visibility:auto] [contain-intrinsic-size:auto 96px]",
                          isActive &&
                            "border-l-4 border-emerald-500 bg-emerald-100/80 font-medium text-emerald-950 dark:bg-emerald-500/15 dark:text-emerald-200",
                          isPast && "text-zinc-400 dark:text-zinc-500",
                          !isActive && !isPast && "text-zinc-700 dark:text-zinc-300",
                          state !== "stopped" && "cursor-pointer hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60"
                        )}
                      >
                        {chunk.text}
                      </p>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      {/* Pie */}
      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-muted-foreground dark:border-zinc-800">
        LectorVoz · Convierte cualquier documento en un audiolibro para tus caminatas
      </footer>

      {/* Barra de reproducción fija */}
      {docInfo && totalChunks > 0 && (
        <PlayerBar
          state={state}
          currentChunk={currentChunk}
          totalChunks={totalChunks}
          progressPercent={progressPercent}
          isLoadingChunk={isLoadingChunk}
          voice={voice}
          speed={speed}
          totalSeconds={estimatedSeconds}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onPrev={handlePrev}
          onNext={handleNext}
          onOpenWalkingMode={() => setWalkingOpen(true)}
          onSeek={handleSeek}
        />
      )}

      {/* Modo caminata a pantalla completa */}
      <WalkingMode
        open={walkingOpen}
        onClose={() => setWalkingOpen(false)}
        state={state}
        currentChunk={currentChunk}
        totalChunks={totalChunks}
        progressPercent={progressPercent}
        isLoadingChunk={isLoadingChunk}
        currentText={chunks[currentChunk]?.text ?? ""}
        totalSeconds={estimatedSeconds}
        onPlayPause={handlePlayPause}
        onStop={handleStop}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={handleSeek}
      />
    </div>
  );
}

function Step({
  n,
  label,
  shortLabel,
  active,
  done,
}: {
  n: number;
  label: string;
  shortLabel: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium transition-colors sm:px-3",
        active && "bg-emerald-600 text-white shadow-sm",
        done && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
        !active && !done && "bg-zinc-100 text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-400"
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          active && "bg-white/25 text-white",
          done && "bg-emerald-600 text-white",
          !active && !done && "bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-200"
        )}
      >
        {n}
      </span>
      <span className="whitespace-nowrap">
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
    </li>
  );
}

function StepConnector({ done }: { done: boolean }) {
  return <span aria-hidden className={cn("h-px w-4 sm:w-6", done ? "bg-emerald-500" : "bg-zinc-300")} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 text-center dark:bg-zinc-800/60">
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

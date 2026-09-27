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
import { parseFileClient } from "@/lib/parse-client";
import { InstallButton, OfflineBadge } from "@/components/lector/pwa";
import { ThemeToggle } from "@/components/lector/theme-toggle";
import {
  CHARS_PER_SECOND,
  estimateSeconds,
  formatDuration,
  splitTextIntoChunks,
  type TextChunk,
} from "@/lib/lector";
import { cn } from "@/lib/utils";

/** WAV silencioso de 44 bytes: desbloquea el elemento <audio> en iOS */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** Máximo de audios generados retenidos en memoria a la vez */
const MAX_CACHED_AUDIO = 80;
/** Cuántos fragmentos por delante se pregeneran para evitar silencios */
const PREFETCH_AHEAD = 1;

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

interface CachedAudio {
  url: string;
  duration: number;
}

/** Duración (segundos) de un MP3 desde su URL, sin reproducirlo */
function audioDurationOf(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    const done = (value: number) =>
      resolve(Number.isFinite(value) && value > 0 ? value : 0);
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(0);
    probe.src = url;
  });
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
  const [speed, setSpeed] = useState(1);
  const [walkingOpen, setWalkingOpen] = useState(false);
  /** Reloj estilo reproductor: segundos de contenido consumidos */
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  /** Duración total del contenido (real donde ya se generó audio) */
  const [totalSeconds, setTotalSeconds] = useState(0);

  // ---------- Refs del motor de audio ----------
  const playTokenRef = useRef(0);
  const activeTokenRef = useRef(0);
  const currentChunkRef = useRef(0);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const stateRef = useRef(state);
  const chunksRef = useRef(chunks);
  const consecutiveFailuresRef = useRef(0);
  const activeChunkElRef = useRef<HTMLParagraphElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Caché de audios generados: clave "voz:fragmento" (SIN velocidad) */
  const cacheRef = useRef<Map<string, CachedAudio>>(new Map());
  const inflightRef = useRef<Map<string, Promise<CachedAudio>>>(new Map());
  const unlockedRef = useRef(false);
  /** Voz cambiada en pausa: al reanudar se regenera el fragmento actual */
  const pendingRestartRef = useRef(false);

  voiceRef.current = voice;
  speedRef.current = speed;
  stateRef.current = state;
  chunksRef.current = chunks;

  const totalChunks = chunks.length;

  // ---------- Limpieza al desmontar ----------
  useEffect(() => {
    return () => {
      playTokenRef.current++;
      audioRef.current?.pause();
      for (const entry of cacheRef.current.values()) {
        URL.revokeObjectURL(entry.url);
      }
      cacheRef.current.clear();
    };
  }, []);

  // ---------- Reloj del reproductor ----------

  /** Segundos estimados de contenido de un fragmento aún sin audio real */
  const estimateChunkSeconds = useCallback(
    (index: number) => (chunksRef.current[index]?.text.length ?? 0) / CHARS_PER_SECOND,
    []
  );

  /**
   * Reloj estilo reproductor: transcurrido y duración total del contenido.
   * Usa duraciones REALES de los audios ya generados y estima el resto
   * (el estimado se va reemplazando por duración real a medida que lee).
   */
  const computeClock = useCallback(
    (curIndex: number, curTime: number) => {
      const list = chunksRef.current;
      const cached = new Map<number, number>();
      let before = 0;
      let after = 0;
      let curDur = -1;
      for (const [key, entry] of cacheRef.current) {
        const sep = key.indexOf(":");
        if (key.slice(0, sep) !== voiceRef.current) continue;
        const i = Number(key.slice(sep + 1));
        if (!Number.isFinite(i)) continue;
        cached.set(i, entry.duration);
        if (i < curIndex) before += entry.duration;
        else if (i > curIndex) after += entry.duration;
        else if (entry.duration > 0) curDur = entry.duration;
      }
      const dur = (i: number) => cached.get(i) ?? estimateChunkSeconds(i);
      if (curDur < 0) curDur = dur(curIndex);
      for (let i = 0; i < curIndex; i++) if (!cached.has(i)) before += dur(i);
      for (let i = curIndex + 1; i < list.length; i++) if (!cached.has(i)) after += dur(i);
      const elapsed = Math.max(0, Math.min(before + Math.max(0, curTime), before + curDur));
      return { elapsed, total: Math.max(1, Math.round(before + curDur + after)) };
    },
    [estimateChunkSeconds]
  );

  // ---------- Caché y generación de audio ----------

  const evictFarAudio = useCallback(() => {
    const cache = cacheRef.current;
    const cur = currentChunkRef.current;
    if (cache.size <= MAX_CACHED_AUDIO) return;
    for (const [key, entry] of cache) {
      if (cache.size <= MAX_CACHED_AUDIO) break;
      const i = Number(key.slice(key.indexOf(":") + 1));
      if (i < cur - 2 || i > cur + PREFETCH_AHEAD + 5) {
        URL.revokeObjectURL(entry.url);
        cache.delete(key);
      }
    }
  }, []);

  /** Audio de un fragmento con la voz indicada (cacheado, sin velocidad) */
  const getChunkAudio = useCallback(
    async (voiceKey: VoiceGender, index: number): Promise<CachedAudio> => {
      const key = `${voiceKey}:${index}`;
      const hit = cacheRef.current.get(key);
      if (hit) return hit;
      const running = inflightRef.current.get(key);
      if (running) return running;

      const task = (async () => {
        const text = chunksRef.current[index]?.text ?? "";
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: voiceKey }),
        });
        if (!res.ok) throw new Error(`/api/tts respondió ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const duration = await audioDurationOf(url);
        const entry: CachedAudio = { url, duration };
        cacheRef.current.set(key, entry);
        inflightRef.current.delete(key);
        evictFarAudio();
        return entry;
      })();

      inflightRef.current.set(key, task);
      task.catch(() => inflightRef.current.delete(key));
      return task;
    },
    [evictFarAudio]
  );

  /** Pregenera en silencio el siguiente fragmento (sin cortes entre partes) */
  const prefetchRef = useRef<(voiceKey: VoiceGender, index: number) => void>(() => {});
  const prefetch = useCallback(
    (voiceKey: VoiceGender, index: number) => {
      const list = chunksRef.current;
      if (index < 0 || index >= list.length) return;
      getChunkAudio(voiceKey, index).catch(() => {});
    },
    [getChunkAudio]
  );
  prefetchRef.current = prefetch;

  // ---------- Control de reproducción ----------

  const stopPlayback = useCallback((resetPosition = true) => {
    playTokenRef.current++;
    audioRef.current?.pause();
    if (resetPosition) {
      currentChunkRef.current = 0;
      setCurrentChunk(0);
      setChunkFraction(0);
      setElapsedSeconds(0);
    }
    setState("stopped");
    setIsLoadingChunk(false);
    consecutiveFailuresRef.current = 0;
    pendingRestartRef.current = false;
  }, []);

  const finishPlayback = useCallback(() => {
    playTokenRef.current++;
    audioRef.current?.pause();
    setState("stopped");
    setIsLoadingChunk(false);
    currentChunkRef.current = 0;
    setCurrentChunk(0);
    setChunkFraction(0);
    setElapsedSeconds(0);
    toast({
      title: "Lectura completada",
      description: "Escuchaste el documento de principio a fin.",
    });
  }, []);

  const finishPlaybackRef = useRef<() => void>(() => {});
  finishPlaybackRef.current = finishPlayback;

  const handleChunkFailureRef = useRef<(index: number, message: string) => void>(() => {});

  /**
   * Reproduce un fragmento y encadena el siguiente al terminar.
   * startFraction (0–1) permite empezar a mitad del fragmento (salto con la barra).
   * La velocidad se aplica con playbackRate: NUNCA regenera ni reinicia el audio.
   */
  const playChunk = useCallback(
    async (index: number, startFraction = 0) => {
      const list = chunksRef.current;
      if (list.length === 0) return;
      if (index < 0 || index >= list.length) {
        finishPlaybackRef.current?.();
        return;
      }
      const token = ++playTokenRef.current;
      activeTokenRef.current = token;
      currentChunkRef.current = index;
      setCurrentChunk(index);
      setChunkFraction(startFraction > 0 ? Math.min(0.999, startFraction) : 0);
      setState("playing");
      setIsLoadingChunk(true);

      try {
        const { url } = await getChunkAudio(voiceRef.current, index);
        const audio = audioRef.current;
        if (token !== playTokenRef.current || !audio) return;
        audio.src = url;
        audio.playbackRate = Math.min(2, Math.max(0.5, speedRef.current));
        audio.preservesPitch = true;
        const target = startFraction > 0 ? Math.min(0.999, startFraction) : 0;
        if (target > 0) {
          const seek = () => {
            if (audio.duration > 0) audio.currentTime = target * audio.duration;
          };
          if (audio.readyState >= 1) seek();
          else audio.addEventListener("loadedmetadata", seek, { once: true });
        }
        await audio.play();
        if (token === playTokenRef.current) {
          setIsLoadingChunk(false);
          consecutiveFailuresRef.current = 0;
          for (let ahead = 1; ahead <= PREFETCH_AHEAD; ahead++) {
            prefetchRef.current(voiceRef.current, index + ahead);
          }
        }
      } catch (err) {
        if (token !== playTokenRef.current) return;
        if ((err as DOMException)?.name === "AbortError") return;
        consecutiveFailuresRef.current++;
        if (consecutiveFailuresRef.current <= 2) {
          // Reintento en el MISMO punto: la lectura nunca se reinicia
          setTimeout(() => {
            if (playTokenRef.current === token) {
              playChunkRef.current?.(index, startFraction);
            }
          }, 900);
        } else {
          handleChunkFailureRef.current?.(index, "No se pudo generar el audio del fragmento");
        }
      }
    },
    [getChunkAudio]
  );

  const playChunkRef = useRef<(index: number, startFraction?: number) => void>(() => {});
  playChunkRef.current = playChunk;

  /** Salto interno: carga un fragmento y se posiciona exactamente en él */
  const seekToChunk = useCallback(
    async (index: number, startFraction: number, autoplay: boolean) => {
      const list = chunksRef.current;
      if (list.length === 0) return;
      if (index < 0 || index >= list.length) return;
      const token = ++playTokenRef.current;
      activeTokenRef.current = token;
      currentChunkRef.current = index;
      setCurrentChunk(index);
      setChunkFraction(Math.min(0.999, Math.max(0, startFraction)));
      setState(autoplay ? "playing" : "paused");
      setIsLoadingChunk(true);
      try {
        const { url } = await getChunkAudio(voiceRef.current, index);
        const audio = audioRef.current;
        if (token !== playTokenRef.current || !audio) return;
        audio.src = url;
        audio.playbackRate = Math.min(2, Math.max(0.5, speedRef.current));
        audio.preservesPitch = true;
        const seek = () => {
          if (audio.duration > 0) {
            audio.currentTime = Math.min(0.999, Math.max(0, startFraction)) * audio.duration;
          }
        };
        if (audio.readyState >= 1) seek();
        else audio.addEventListener("loadedmetadata", seek, { once: true });
        if (autoplay) await audio.play();
        if (token === playTokenRef.current) setIsLoadingChunk(false);
      } catch (err) {
        if (token !== playTokenRef.current) return;
        if ((err as DOMException)?.name === "AbortError") return;
        handleChunkFailureRef.current?.(index, "No se pudo saltar a esa parte");
      }
    },
    [getChunkAudio]
  );

  const seekToChunkRef = useRef<(index: number, fraction: number, autoplay: boolean) => void>(
    () => {}
  );
  seekToChunkRef.current = (index, fraction, autoplay) => {
    void seekToChunk(index, fraction, autoplay);
  };

  // ---------- Eventos del elemento <audio> ----------

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const isRealSource = () => audio.src !== "" && !audio.src.startsWith("data:");

    const onTimeUpdate = () => {
      if (stateRef.current === "stopped") return;
      const dur = audio.duration;
      const frac = dur > 0 ? Math.min(0.999, Math.max(0, audio.currentTime / dur)) : 0;
      setChunkFraction(frac);
      const clock = computeClock(currentChunkRef.current, audio.currentTime);
      setElapsedSeconds(clock.elapsed);
      setTotalSeconds((prev) => (Math.abs(prev - clock.total) >= 1 ? clock.total : prev));
    };

    const onEnded = () => {
      if (!isRealSource() || stateRef.current === "stopped") return;
      if (playTokenRef.current !== activeTokenRef.current) return;
      setChunkFraction(0.999);
      const next = currentChunkRef.current + 1;
      if (next < chunksRef.current.length) {
        playChunkRef.current?.(next);
      } else {
        finishPlaybackRef.current?.();
      }
    };

    const onError = () => {
      if (!isRealSource() || stateRef.current === "stopped") return;
      if (playTokenRef.current !== activeTokenRef.current) return;
      handleChunkFailureRef.current?.(
        currentChunkRef.current,
        "Error al reproducir el audio del fragmento"
      );
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [computeClock]);

  // ---------- Acciones del usuario ----------

  /** iOS exige una reproducción dentro del gesto del usuario */
  const unlockAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || unlockedRef.current) return;
    unlockedRef.current = true;
    try {
      audio.src = SILENT_WAV;
      audio.volume = 0;
      const p = audio.play();
      if (p) {
        p.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        }).catch(() => {
          audio.volume = 1;
        });
      }
    } catch {
      audio.volume = 1;
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("paused");
      return;
    }
    if (state === "paused") {
      const audio = audioRef.current;
      if (pendingRestartRef.current) {
        // La voz se cambió en pausa: regenera el fragmento actual en el mismo punto
        pendingRestartRef.current = false;
        const frac = audio && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
        playChunkRef.current?.(currentChunkRef.current, frac);
        return;
      }
      if (audio && audio.src && !audio.src.startsWith("data:")) {
        audio.playbackRate = Math.min(2, Math.max(0.5, speedRef.current));
        audio
          .play()
          .then(() => setState("playing"))
          .catch(() => playChunkRef.current?.(currentChunkRef.current));
      } else {
        playChunkRef.current?.(currentChunkRef.current);
      }
      return;
    }
    // stopped
    unlockAudio();
    playChunkRef.current?.(currentChunkRef.current);
  }, [state, unlockAudio]);

  const handleStop = useCallback(() => {
    stopPlayback(true);
    setWalkingOpen(false);
  }, [stopPlayback]);

  const handlePrev = useCallback(() => {
    const target = Math.max(0, currentChunkRef.current - 1);
    const playing = stateRef.current === "playing";
    if (stateRef.current === "stopped") {
      currentChunkRef.current = target;
      setCurrentChunk(target);
      setChunkFraction(0);
      return;
    }
    seekToChunkRef.current(target, 0, playing);
  }, []);

  const handleNext = useCallback(() => {
    const last = Math.max(0, chunksRef.current.length - 1);
    const target = Math.min(last, currentChunkRef.current + 1);
    const playing = stateRef.current === "playing";
    if (stateRef.current === "stopped") {
      currentChunkRef.current = target;
      setCurrentChunk(target);
      setChunkFraction(0);
      return;
    }
    seekToChunkRef.current(target, 0, playing);
  }, []);

  /** Cambio de voz: EXACTAMENTE una voz por género, neuronal y garantizada.
   *  Mientras lee, regenera el fragmento actual desde el MISMO punto. */
  const handleVoiceChange = useCallback((v: VoiceGender) => {
    if (v === voiceRef.current) return;
    setVoice(v);
    voiceRef.current = v;
    if (stateRef.current === "playing") {
      const audio = audioRef.current;
      const frac = audio && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      playChunkRef.current?.(currentChunkRef.current, frac);
    } else if (stateRef.current === "paused") {
      pendingRestartRef.current = true;
    }
  }, []);

  /**
   * Cambio de velocidad SIN reiniciar la lectura, JAMÁS.
   * Solo ajusta playbackRate del audio en curso: sigue EXACTAMENTE por
   * el mismo punto — nunca vuelve atrás, nunca se repite, nunca se corta.
   */
  const handleSpeedChange = useCallback((s: number) => {
    setSpeed(s);
    speedRef.current = s;
    const audio = audioRef.current;
    if (audio && audio.src && !audio.src.startsWith("data:")) {
      audio.playbackRate = Math.min(2, Math.max(0.5, s));
      audio.preservesPitch = true;
    }
  }, []);

  /** Salto con la barra de audio (0–100). Solo el usuario mueve la posición. */
  const handleSeek = useCallback((percent: number) => {
    const list = chunksRef.current;
    if (list.length === 0) return;
    const clamped = Math.min(100, Math.max(0, percent));
    const globalPos = (clamped / 100) * list.length;
    let idx = Math.floor(globalPos);
    idx = Math.min(list.length - 1, Math.max(0, idx));
    const frac = Math.min(0.999, Math.max(0, globalPos - idx));

    if (stateRef.current === "stopped") {
      // Detenido: la barra elige el fragmento desde el que comenzará
      currentChunkRef.current = idx;
      setCurrentChunk(idx);
      setChunkFraction(0);
      return;
    }
    // Leyendo o en pausa: salta exactamente a ese punto y sigue como estaba
    seekToChunkRef.current(idx, frac, stateRef.current === "playing");
  }, []);

  /** Detiene tras fallos repetidos (p. ej. sin internet) */
  const handleChunkFailure = useCallback(
    (index: number, message: string) => {
      stopPlayback(false);
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      toast({
        title: offline ? "Sin conexión a internet" : "La lectura se detuvo",
        description: offline
          ? "Las voces neuronales se generan por internet. Conéctate y vuelve a comenzar desde donde estabas."
          : `${message}. Revisa tu conexión e intenta de nuevo.`,
        variant: "destructive",
      });
    },
    [stopPlayback]
  );
  handleChunkFailureRef.current = handleChunkFailure;

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
        const nextChunks = splitTextIntoChunks(parsed.text);
        setChunks(nextChunks);
        currentChunkRef.current = 0;
        // Duración total estimada estilo reproductor (se afina con audio real)
        setTotalSeconds(estimateSeconds(parsed.words, 1));
        setElapsedSeconds(0);
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
    setTotalSeconds(0);
    setElapsedSeconds(0);
    for (const entry of cacheRef.current.values()) {
      URL.revokeObjectURL(entry.url);
    }
    cacheRef.current.clear();
  }, [stopPlayback]);

  // ---------- Auto-scroll al fragmento actual ----------

  useEffect(() => {
    if (state === "stopped" || walkingOpen) return;
    activeChunkElRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentChunk, state, walkingOpen]);

  // ---------- Derivados ----------

  const estimatedSeconds = useMemo(
    () => (docInfo ? estimateSeconds(docInfo.words, 1) : 0),
    [docInfo]
  );

  const progressPercent =
    totalChunks > 0
      ? ((currentChunk + (state !== "stopped" ? chunkFraction : 0)) / totalChunks) * 100
      : 0;

  const phase = !docInfo && !isParsing ? 1 : isParsing ? 2 : 3;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50/60 via-white to-white dark:from-emerald-950/30 dark:via-zinc-950 dark:to-zinc-950">
      {/* Elemento de audio real (motor de reproducción) */}
      <audio ref={audioRef} preload="auto" className="hidden" aria-hidden="true" />

      {/* Encabezado */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
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
                Escucha tus documentos · voces neuronales
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
                            seekToChunkRef.current(chunk.index, 0, state === "playing");
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
          elapsedSeconds={elapsedSeconds}
          totalSeconds={totalSeconds}
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
        elapsedSeconds={elapsedSeconds}
        totalSeconds={totalSeconds}
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

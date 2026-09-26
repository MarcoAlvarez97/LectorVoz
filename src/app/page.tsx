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
  type TtsEngine,
  type VoiceGender,
} from "@/components/lector/voice-selector";
import { PlayerBar, type PlayerState } from "@/components/lector/player-bar";
import { WalkingMode } from "@/components/lector/walking-mode";
import {
  pickSpanishVoice,
  supportsSpeech,
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

const MAX_CACHE_ENTRIES = 120;
/** WAV silencioso de 44 bytes para "desbloquear" el audio en iOS Safari */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

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
  const [engine, setEngine] = useState<TtsEngine>("browser");
  const [voice, setVoice] = useState<VoiceGender>("female");
  const [isOffline, setIsOffline] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [walkingOpen, setWalkingOpen] = useState(false);

  // ---------- Refs para la cadena de reproducción ----------
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const playTokenRef = useRef(0);
  const currentChunkRef = useRef(0);
  const hasSrcRef = useRef(false);
  const playingKeyRef = useRef<string>("");
  const engineRef = useRef<TtsEngine>(engine);
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  const stateRef = useRef<PlayerState>(state);
  const chunksRef = useRef(chunks);
  const isOfflineRef = useRef(isOffline);
  const consecutiveFailuresRef = useRef(0);
  const activeChunkElRef = useRef<HTMLParagraphElement | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Última posición de lectura (palabra actual) para cambiar de voz sin volver al inicio */
  const lastBoundaryRef = useRef<{ index: number; charIndex: number }>({ index: 0, charIndex: 0 });
  /** Voz cambiada en pausa: al reanudar se vuelve a hablar desde la palabra actual */
  const pendingRestartRef = useRef(false);

  engineRef.current = engine;
  voiceRef.current = voice;
  speedRef.current = speed;
  stateRef.current = state;
  chunksRef.current = chunks;
  isOfflineRef.current = isOffline;

  const totalChunks = chunks.length;

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
    return audioRef.current;
  }, []);

  const clearCache = useCallback(() => {
    for (const url of cacheRef.current.values()) URL.revokeObjectURL(url);
    cacheRef.current.clear();
    inflightRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      playTokenRef.current++;
      audioRef.current?.pause();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      for (const url of cacheRef.current.values()) URL.revokeObjectURL(url);
      cacheRef.current.clear();
    };
  }, []);

  // ---------- Conexión: al perder internet se fuerza el motor del navegador ----------

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
    if (!isOffline || engineRef.current !== "server") return;
    engineRef.current = "browser";
    setEngine("browser");
    clearCache();
    toast({
      title: "Sin conexión: usando la voz del navegador",
      description:
        "El motor HD requiere internet. La lectura continúa con las voces de tu dispositivo.",
    });
    if (stateRef.current === "playing" || stateRef.current === "paused") {
      playChunkRef.current?.(currentChunkRef.current);
    }
  }, [isOffline, clearCache]);

  /** Desbloquea el elemento de audio con un gesto del usuario (requisito iOS) */
  const unlockAudio = useCallback(() => {
    if (engineRef.current === "browser") return;
    const audio = getAudio();
    if (hasSrcRef.current) return;
    audio.muted = true;
    audio.src = SILENT_WAV;
    audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute("src");
        audio.muted = false;
      })
      .catch(() => {
        audio.muted = false;
        audio.removeAttribute("src");
      });
  }, [getAudio]);

  // ---------- Motor del navegador (Web Speech API) ----------

  const stopResumeWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  /** Fix para el bug de Chrome que corta audios largos (>15 s) */
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

  /** Lee un fragmento con la voz del navegador, ORACIÓN POR ORACIÓN.
   *
   *  Cada oración se crea justo antes de hablarse y toma la velocidad vigente
   *  en ese momento: así, cambiar la velocidad NUNCA reinicia ni corta la
   *  lectura — la oración actual termina a la velocidad anterior y la siguiente
   *  ya va a la nueva. startChar > 0 permite retomar desde una palabra concreta
   *  (cambio de voz o salto con la barra de progreso). */
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
        utterance.pitch = 1;

        const matched = pickSpanishVoice(voiceRef.current, !isOfflineRef.current);
        if (matched) {
          utterance.voice = matched;
          utterance.lang = matched.lang;
        }

        utterance.onstart = () => {
          if (token === playTokenRef.current) setIsLoadingChunk(false);
        };
        utterance.onboundary = (event) => {
          if (token !== playTokenRef.current) return;
          const pos = seg.offset + (event.charIndex || 0);
          lastBoundaryRef.current = { index, charIndex: pos };
          if (fullText.length > 0) {
            setChunkFraction(Math.min(0.999, pos / fullText.length));
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

  // ---------- Motor del servidor (opcional, requiere OPENAI_API_KEY) ----------

  const isNoProviderError = useCallback((message: string) => {
    return message.includes("NO_PROVIDER") || message.includes("proveedor de voz");
  }, []);

  /** Aplica la velocidad actual al elemento de audio (cambio en vivo, sin reiniciar) */
  const applyAudioRate = useCallback(
    (rate: number) => {
      const audio = getAudio();
      try {
        audio.preservesPitch = true;
        (audio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true;
      } catch {
        // Navegador antiguo: la voz sonará un tono más agudo/grave, pero funciona
      }
      audio.playbackRate = Math.min(2, Math.max(0.5, rate));
    },
    [getAudio]
  );

  /** Obtiene (o genera y cachea) el audio de un fragmento desde el servidor.
   *  El audio siempre se genera a velocidad 1: la velocidad se aplica en el
   *  cliente con playbackRate, así el cambio es instantáneo y la caché sirve
   *  para cualquier velocidad. */
  const getChunkAudioUrl = useCallback(
    async (index: number, gender: string): Promise<string> => {
      const key = `${gender}|${index}`;
      const cached = cacheRef.current.get(key);
      if (cached) return cached;

      const inflight = inflightRef.current.get(key);
      if (inflight) return inflight;

      const promise = (async () => {
        const chunkText = chunksRef.current[index]?.text ?? "";
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: chunkText, voice: gender, speed: 1 }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => null);
              const prefix = data?.code === "NO_PROVIDER" ? "NO_PROVIDER:" : "";
              throw new Error(prefix + (data?.error || `Error ${res.status} al generar el audio`));
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            // Limita el tamaño de la caché (nunca evicta el fragmento en reproducción)
            if (cacheRef.current.size >= MAX_CACHE_ENTRIES) {
              for (const oldKey of cacheRef.current.keys()) {
                if (oldKey === playingKeyRef.current) continue;
                const oldUrl = cacheRef.current.get(oldKey);
                if (oldUrl) URL.revokeObjectURL(oldUrl);
                cacheRef.current.delete(oldKey);
                break;
              }
            }
            cacheRef.current.set(key, url);
            inflightRef.current.delete(key);
            return url;
          } catch (err) {
            lastError = err;
            // Sin proveedor no tiene sentido reintentar
            if (err instanceof Error && isNoProviderError(err.message)) break;
            if (attempt === 0) await new Promise((r) => setTimeout(r, 900));
          }
        }
        inflightRef.current.delete(key);
        throw lastError instanceof Error
          ? lastError
          : new Error("Error desconocido al generar el audio");
      })();

      inflightRef.current.set(key, promise);
      return promise;
    },
    [isNoProviderError]
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
      const audio = getAudio();
      audio.pause();
      if (resetPosition) {
        audio.removeAttribute("src");
        audio.load();
        hasSrcRef.current = false;
        currentChunkRef.current = 0;
        setCurrentChunk(0);
      }
      setState("stopped");
      setIsLoadingChunk(false);
      consecutiveFailuresRef.current = 0;
      pendingRestartRef.current = false;
      lastBoundaryRef.current = { index: 0, charIndex: 0 };
    },
    [getAudio, stopResumeWatchdog]
  );

  /** Finaliza la lectura completa */
  const finishPlayback = useCallback(() => {
    playTokenRef.current++;
    stopResumeWatchdog();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const audio = getAudio();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    hasSrcRef.current = false;
    setState("stopped");
    setIsLoadingChunk(false);
    currentChunkRef.current = 0;
    setCurrentChunk(0);
    toast({
      title: "Lectura completada",
      description: "Escuchaste el documento de principio a fin.",
    });
  }, [getAudio, stopResumeWatchdog]);

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
          description: "Ocurrieron varios errores consecutivos al generar el audio. Intenta de nuevo.",
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
   *  startFraction (0–1) permite empezar a mitad del audio del fragmento
   *  (salto con la barra de progreso). */
  const playChunk = useCallback(
    async (index: number, startFraction = 0) => {
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

      // Motor del navegador: sin generación previa
      if (engineRef.current === "browser") {
        lastBoundaryRef.current = { index, charIndex: 0 };
        speakChunkBrowser(
          index,
          token,
          startFraction > 0 ? Math.floor(startFraction * (list[index]?.text.length ?? 0)) : 0
        );
        return;
      }

      setIsLoadingChunk(true);
      try {
        const url = await getChunkAudioUrl(index, voiceRef.current);
        if (token !== playTokenRef.current) return;

        const audio = getAudio();
        hasSrcRef.current = true;
        playingKeyRef.current = `${voiceRef.current}|${index}`;
        audio.src = url;
        // La velocidad se aplica en vivo con playbackRate (el audio se genera a 1x)
        applyAudioRate(speedRef.current);
        // Salto a mitad del fragmento (barra de progreso)
        if (startFraction > 0.001 && startFraction < 0.999) {
          const seekInside = () => {
            try {
              if (Number.isFinite(audio.duration) && audio.duration > 0) {
                audio.currentTime = startFraction * audio.duration;
              }
            } catch {
              // algunos navegadores no permiten seek: se escucha desde el inicio
            }
          };
          if (audio.readyState >= 1) seekInside();
          else audio.addEventListener("loadedmetadata", seekInside, { once: true });
        }
        audio.ontimeupdate = () => {
          if (token !== playTokenRef.current) return;
          if (audio.duration > 0) {
            setChunkFraction(Math.min(0.999, audio.currentTime / audio.duration));
          }
        };
        audio.onended = () => {
          if (token !== playTokenRef.current) return;
          consecutiveFailuresRef.current = 0;
          if (index + 1 < chunksRef.current.length) {
            playChunkRef.current?.(index + 1);
          } else {
            finishPlaybackRef.current?.();
          }
        };
        audio.onerror = () => {
          if (token !== playTokenRef.current) return;
          handleChunkFailureRef.current?.(index, "El audio no se pudo reproducir");
        };
        await audio.play();
        if (token !== playTokenRef.current) return;
        setIsLoadingChunk(false);
        consecutiveFailuresRef.current = 0;

        // Precarga de los próximos 2 fragmentos
        const nextLimit = Math.min(index + 2, chunksRef.current.length - 1);
        for (let i = index + 1; i <= nextLimit; i++) {
          getChunkAudioUrl(i, voiceRef.current).catch(() => {});
        }
      } catch (err) {
        if (token !== playTokenRef.current) return;
        setIsLoadingChunk(false);
        const message = err instanceof Error ? err.message : "Error al generar el audio";
        if (isNoProviderError(message)) {
          // Sin proveedor configurado: cambia al motor del navegador
          engineRef.current = "browser";
          setEngine("browser");
          toast({
            title: "Usando la voz del navegador",
            description:
              "El servidor no tiene OPENAI_API_KEY configurada. Se usa la voz gratuita de tu dispositivo.",
          });
          speakChunkBrowser(index, token);
          return;
        }
        handleChunkFailureRef.current?.(index, message);
      }
    },
    [applyAudioRate, finishPlaybackRef, getAudio, getChunkAudioUrl, handleChunkFailureRef, isNoProviderError, speakChunkBrowser]
  );

  const playChunkRef = useRef<(index: number, startFraction?: number) => void>(() => {});
  playChunkRef.current = playChunk;

  // ---------- Acciones del usuario ----------

  const handlePlayPause = useCallback(() => {
    const audio = getAudio();
    if (state === "playing") {
      if (engineRef.current === "browser") {
        window.speechSynthesis?.pause();
      } else {
        if (isLoadingChunk) {
          playTokenRef.current++;
          hasSrcRef.current = false;
          setIsLoadingChunk(false);
        } else {
          audio.pause();
        }
      }
      setState("paused");
      return;
    }
    if (state === "paused" && engineRef.current === "browser") {
      const synth = window.speechSynthesis;
      // Si se cambió la voz en pausa, retoma desde la palabra actual con la voz nueva
      if (pendingRestartRef.current || !synth?.speaking) {
        pendingRestartRef.current = false;
        const { index, charIndex } = lastBoundaryRef.current;
        const token = ++playTokenRef.current;
        setState("playing");
        startResumeWatchdog();
        speakChunkBrowser(index, token, charIndex);
        return;
      }
      synth?.resume();
      setState("playing");
      startResumeWatchdog();
      return;
    }
    if (state === "paused" && hasSrcRef.current) {
      audio
        .play()
        .then(() => setState("playing"))
        .catch(() => {
          setState("paused");
          toast({
            title: "Toca reproducir otra vez",
            description: "El navegador bloqueó la reproducción automática.",
          });
        });
      return;
    }
    // stopped
    unlockAudio();
    playChunkRef.current?.(currentChunkRef.current);
  }, [state, isLoadingChunk, getAudio, startResumeWatchdog, unlockAudio]);

  const handleStop = useCallback(() => {
    stopPlayback(true);
    setWalkingOpen(false);
  }, [stopPlayback]);

  const handlePrev = useCallback(() => {
    const target = Math.max(0, currentChunkRef.current - 1);
    unlockAudio();
    playChunkRef.current?.(target);
  }, [unlockAudio]);

  const handleNext = useCallback(() => {
    const target = Math.min(chunksRef.current.length - 1, currentChunkRef.current + 1);
    unlockAudio();
    playChunkRef.current?.(target);
  }, [unlockAudio]);

  /** Relee el fragmento actual desde la palabra en curso (motor navegador).
   *  Se usa SOLO al cambiar de voz: hay que reiniciar la oración para que
   *  suene la voz nueva. La velocidad NO pasa por acá (nunca reinicia). */
  const respeakFromCurrentWord = useCallback(() => {
    const { index, charIndex } = lastBoundaryRef.current;
    if (index !== currentChunkRef.current) {
      playChunkRef.current?.(currentChunkRef.current);
      return;
    }
    const token = ++playTokenRef.current;
    speakChunkBrowser(index, token, charIndex);
  }, [speakChunkBrowser]);

  /** Cambio de motor: reinicia el fragmento actual con el nuevo motor */
  const handleEngineChange = useCallback(
    (e: TtsEngine) => {
      if (e === engineRef.current) return;
      setEngine(e);
      engineRef.current = e;
      if (e === "browser") {
        clearCache();
        pendingRestartRef.current = false;
        lastBoundaryRef.current = { index: currentChunkRef.current, charIndex: 0 };
      }
      if (stateRef.current === "playing" || stateRef.current === "paused") {
        playChunkRef.current?.(currentChunkRef.current);
      }
    },
    [clearCache]
  );

  /** Cambio de voz (género): EXACTAMENTE una voz por género. Retoma desde la
   *  palabra actual (navegador) o reinicia el fragmento (servidor). */
  const handleVoiceChange = useCallback(
    (v: VoiceGender) => {
      if (v === voiceRef.current) return;
      setVoice(v);
      voiceRef.current = v;
      if (engineRef.current === "server") clearCache();
      if (stateRef.current === "playing") {
        if (engineRef.current === "browser") {
          respeakFromCurrentWord();
        } else {
          playChunkRef.current?.(currentChunkRef.current);
        }
      } else if (stateRef.current === "paused" && engineRef.current === "browser") {
        // En pausa: cancela y marca para retomar desde la palabra actual con la voz nueva
        window.speechSynthesis?.cancel();
        pendingRestartRef.current = true;
      }
    },
    [clearCache, respeakFromCurrentWord]
  );

  /** Salto de posición con la barra de audio (0–100). Solo el usuario mueve
   *  la posición de lectura; se retoma exactamente desde ese punto. */
  const handleSeek = useCallback(
    (percent: number) => {
      const list = chunksRef.current;
      if (list.length === 0) return;
      const totalChars = list.reduce((acc, c) => acc + c.text.length, 0);
      if (totalChars === 0) return;

      let target = Math.round((Math.min(100, Math.max(0, percent)) / 100) * totalChars);
      target = Math.min(target, totalChars - 1);
      let idx = 0;
      while (idx < list.length - 1 && target >= list[idx].text.length) {
        target -= list[idx].text.length;
        idx += 1;
      }
      const len = list[idx].text.length || 1;
      const fraction = target / len;

      if (stateRef.current === "stopped") {
        // Detenido: la barra elige el fragmento desde el que comenzará
        currentChunkRef.current = idx;
        setCurrentChunk(idx);
        setChunkFraction(0);
        return;
      }

      unlockAudio();
      if (engineRef.current === "server") {
        playChunkRef.current?.(idx, fraction);
        return;
      }
      // Motor navegador: retoma desde ese carácter con la velocidad actual
      const token = ++playTokenRef.current;
      setState("playing");
      startResumeWatchdog();
      speakChunkBrowser(idx, token, Math.floor(fraction * len));
    },
    [speakChunkBrowser, startResumeWatchdog, unlockAudio]
  );

  /** Cambio de velocidad SIN reiniciar la lectura, JAMÁS:
   *  - Motor servidor: playbackRate en vivo sobre el audio actual — instantáneo,
   *    la lectura sigue exactamente por el mismo punto.
   *  - Motor navegador: la oración actual termina a la velocidad anterior y la
   *    siguiente se habla ya con la nueva — sin cortes, saltos ni repeticiones.
   *  La posición de lectura SOLO la cambia el usuario (barra o botones). */
  const handleSpeedChange = useCallback(
    (s: number) => {
      setSpeed(s);
      speedRef.current = s;
      if (engineRef.current === "server") {
        applyAudioRate(s);
      }
      // Motor navegador: nada que hacer — las oraciones se crean al vuelo y
      // toman speedRef.current vigente al empezar cada una.
    },
    [applyAudioRate]
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
    clearCache();
    setDocInfo(null);
    setChunks([]);
  }, [clearCache, stopPlayback]);

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

      <main className={cn("mx-auto w-full max-w-3xl flex-1 px-4 pt-6", docInfo ? "pb-40" : "pb-10")}>
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

            {/* Configuración de motor, voz y velocidad */}
            <section aria-label="Configuración de voz">
              <VoiceSelector
                engine={engine}
                onEngineChange={handleEngineChange}
                voice={voice}
                onVoiceChange={handleVoiceChange}
                offline={isOffline}
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
                            unlockAudio();
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

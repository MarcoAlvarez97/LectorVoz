"use client";

import { useEffect, useRef, useState } from "react";
import { Forward, Maximize2, Pause, Play, Rewind, Square, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/lector";
import type { VoiceGender } from "./voice-selector";

export type PlayerState = "stopped" | "playing" | "paused";

interface PlayerBarProps {
  state: PlayerState;
  currentChunk: number;
  totalChunks: number;
  progressPercent: number;
  isLoadingChunk: boolean;
  voice: VoiceGender;
  speed: number;
  /** Segundos de contenido transcurridos (reloj real del reproductor) */
  elapsedSeconds: number;
  /** Duración total del contenido (real donde ya hay audio generado) */
  totalSeconds: number;
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenWalkingMode: () => void;
  /** Salta a una posición del documento (0–100). Solo se dispara al soltar la barra. */
  onSeek: (percent: number) => void;
}

/**
 * Barra de reproducción fija estilo reproductor de audio:
 * - Reloj transcurrido / duración total estimada de la lectura.
 * - Barra deslizable para volver o saltar a cualquier punto del documento.
 * - Botones de fragmento anterior / siguiente.
 */
export function PlayerBar({
  state,
  currentChunk,
  totalChunks,
  progressPercent,
  isLoadingChunk,
  voice,
  speed,
  elapsedSeconds,
  totalSeconds,
  onPlayPause,
  onStop,
  onPrev,
  onNext,
  onOpenWalkingMode,
  onSeek,
}: PlayerBarProps) {
  // Mientras se arrastra la barra se muestra el valor local; al soltar salta.
  // Radix a veces NO dispara onValueCommit (End/Home, gestos rápidos, pointer
  // capturado por otra capa): si solo confiáramos en él, el reloj quedaría
  // congelado en la posición del arrastre y el salto nunca ocurriría. Por eso
  // el commit se confirma TAMBIÉN con pointerup/touchend/keyup globales.
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const display = scrub ?? progressPercent;
  // Reloj izquierdo: durante el arrastre muestra la posición elegida;
  // el resto del tiempo, el tiempo real consumido del audio.
  const scrubElapsed = scrub !== null ? (scrub / 100) * totalSeconds : elapsedSeconds;

  const setScrubValue = (v: number | null) => {
    scrubRef.current = v;
    setScrub(v);
  };

  const commitScrubRef = useRef<() => void>(() => {});

  const commitScrub = () => {
    draggingRef.current = false;
    const v = scrubRef.current;
    if (v === null) return;
    setScrubValue(null);
    onSeek(v);
  };
  commitScrubRef.current = commitScrub;

  useEffect(() => {
    const finish = () => {
      if (draggingRef.current) commitScrubRef.current();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("touchend", finish);
    window.addEventListener("keyup", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("keyup", finish);
    };
  }, []);

  const statusText =
    isLoadingChunk && state === "playing"
      ? "Preparando la voz…"
      : state === "playing"
        ? "Leyendo…"
        : state === "paused"
          ? "En pausa"
          : "Listo para leer";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto max-w-3xl px-4 py-2.5">
        {/* Barra de progreso deslizable con reloj estilo reproductor */}
        <div className="flex items-center gap-2.5">
          <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-foreground sm:w-14">
            {formatClock(scrubElapsed)}
          </span>
          <Slider
            value={[Math.min(100, Math.max(0, display))]}
            min={0}
            max={100}
            step={0.1}
            aria-label="Barra de audio: arrastrá para volver o avanzar"
            onPointerDown={() => {
              draggingRef.current = true;
            }}
            onKeyDown={() => {
              draggingRef.current = true;
            }}
            onValueChange={(values) => setScrubValue(values[0])}
            onValueCommit={(values) => {
              setScrubValue(null);
              onSeek(values[0]);
            }}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            className="h-5 flex-1 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-zinc-300 dark:[&_[data-slot=slider-track]]:bg-zinc-700 [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-emerald-600 [&_[data-slot=slider-thumb]]:bg-white"
          />
          <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground sm:w-16">
            {formatClock(totalSeconds)}
          </span>
        </div>
        <p className="mb-1.5 mt-0.5 text-center text-[11px] text-muted-foreground sm:hidden">
          Arrastrá la barra para volver o saltar de parte
        </p>

        {/* Controles */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-semibold text-foreground">
              {statusText}
              {state !== "stopped" && (
                <span className="ml-2 font-normal text-muted-foreground">
                  parte {Math.min(currentChunk + 1, totalChunks)} de {totalChunks}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Voz {voice === "female" ? "mujer" : "hombre"} · {speed.toFixed(2).replace(/\.?0+$/, "")}x
            </p>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <ControlButton onClick={onPrev} label="Volver un fragmento" disabled={currentChunk <= 0}>
              <Rewind className="h-5 w-5" />
            </ControlButton>

            <button
              type="button"
              onClick={onPlayPause}
              aria-label={
                state === "playing"
                  ? "Pausar lectura"
                  : state === "paused"
                    ? "Reanudar lectura"
                    : "Iniciar lectura"
              }
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-all hover:bg-emerald-700 active:scale-95"
            >
              {isLoadingChunk && state === "playing" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : state === "playing" ? (
                <Pause className="h-6 w-6" fill="currentColor" />
              ) : (
                <Play className="h-6 w-6 translate-x-[2px]" fill="currentColor" />
              )}
            </button>

            <ControlButton onClick={onStop} label="Detener lectura">
              <Square className="h-5 w-5" fill="currentColor" />
            </ControlButton>

            <ControlButton
              onClick={onNext}
              label="Avanzar un fragmento"
              disabled={currentChunk >= totalChunks - 1}
            >
              <Forward className="h-5 w-5" />
            </ControlButton>

            <ControlButton onClick={onOpenWalkingMode} label="Modo caminata a pantalla completa">
              <Maximize2 className="h-5 w-5" />
            </ControlButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "h-11 w-11 rounded-full text-zinc-700 hover:bg-zinc-100 hover:text-foreground dark:text-zinc-300 dark:hover:bg-zinc-800",
        disabled && "opacity-40"
      )}
    >
      {children}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Forward, Maximize2, Pause, Play, Rewind, Square, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  onPlayPause,
  onStop,
  onPrev,
  onNext,
  onOpenWalkingMode,
  onSeek,
}: PlayerBarProps) {
  // Mientras se arrastra la barra se muestra el valor local; al soltar salta
  const [scrub, setScrub] = useState<number | null>(null);
  const display = scrub ?? progressPercent;

  const statusText =
    isLoadingChunk && state === "playing"
      ? "Generando audio…"
      : state === "playing"
        ? "Leyendo…"
        : state === "paused"
          ? "En pausa"
          : "Listo";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto max-w-3xl px-4 py-3">
        {/* Barra de progreso deslizable (seek) */}
        <div className="mb-1 flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {Math.min(currentChunk + 1, totalChunks)}/{totalChunks}
          </span>
          <Slider
            value={[Math.min(100, Math.max(0, display))]}
            min={0}
            max={100}
            step={0.1}
            aria-label="Barra de audio: arrastrá para volver o avanzar"
            onValueChange={(values) => setScrub(values[0])}
            onValueCommit={(values) => {
              setScrub(null);
              onSeek(values[0]);
            }}
            className="flex-1 [&_[data-slot=slider-track]]:bg-zinc-200 dark:[&_[data-slot=slider-track]]:bg-zinc-800 [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-emerald-600"
          />
          <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
            {Math.round(display)}%
          </span>
        </div>
        <p className="mb-2 text-center text-[11px] text-muted-foreground sm:hidden">
          Arrastrá la barra para volver o saltar de parte
        </p>

        {/* Controles */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-semibold text-foreground">
              {statusText}
              {state !== "stopped" && (
                <span className="ml-2 font-normal text-muted-foreground">
                  fragmento {Math.min(currentChunk + 1, totalChunks)} de {totalChunks}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Voz {voice === "female" ? "mujer" : "hombre"} · {speed.toFixed(2).replace(/\.?0+$/, "")}x
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
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
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : state === "playing" ? (
                <Pause className="h-7 w-7" fill="currentColor" />
              ) : (
                <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" />
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

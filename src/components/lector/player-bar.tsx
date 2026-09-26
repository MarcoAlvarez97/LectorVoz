"use client";

import { Forward, Maximize2, Pause, Play, Rewind, Square, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
}

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
}: PlayerBarProps) {
  const statusText =
    isLoadingChunk && state === "playing"
      ? "Generando audio…"
      : state === "playing"
        ? "Leyendo…"
        : state === "paused"
          ? "En pausa"
          : "Listo";

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto max-w-3xl px-4 py-3">
        {/* Progreso */}
        <div className="mb-2.5 flex items-center gap-3">
          <span className="w-20 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {Math.min(currentChunk + 1, totalChunks)}/{totalChunks}
          </span>
          <Progress
            value={progressPercent}
            className="h-2 flex-1 [&_[data-slot=progress-indicator]]:bg-emerald-500"
          />
          <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>

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
            <ControlButton onClick={onPrev} label="Fragmento anterior" disabled={currentChunk <= 0}>
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
              label="Fragmento siguiente"
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
        "h-11 w-11 rounded-full text-zinc-700 hover:bg-zinc-100 hover:text-foreground",
        disabled && "opacity-40"
      )}
    >
      {children}
    </Button>
  );
}

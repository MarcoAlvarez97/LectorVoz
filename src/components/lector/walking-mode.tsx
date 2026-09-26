"use client";

import { Forward, Pause, Play, Rewind, Square, Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { PlayerState } from "./player-bar";

interface WalkingModeProps {
  open: boolean;
  onClose: () => void;
  state: PlayerState;
  currentChunk: number;
  totalChunks: number;
  progressPercent: number;
  isLoadingChunk: boolean;
  currentText: string;
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function WalkingMode({
  open,
  onClose,
  state,
  currentChunk,
  totalChunks,
  progressPercent,
  isLoadingChunk,
  currentText,
  onPlayPause,
  onStop,
  onPrev,
  onNext,
}: WalkingModeProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Modo caminata"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white"
    >
      {/* Barra superior */}
      <div className="flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
            Modo caminata
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            Fragmento {Math.min(currentChunk + 1, totalChunks)} de {totalChunks} ·{" "}
            {Math.round(progressPercent)}%
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Salir del modo caminata"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <Progress
        value={progressPercent}
        className="mx-5 h-1.5 bg-zinc-800 [&_[data-slot=progress-indicator]]:bg-emerald-400"
      />

      {/* Texto actual en grande */}
      <div className="flex flex-1 items-center overflow-y-auto px-6 py-6">
        <p className="mx-auto max-w-2xl text-balance text-center text-2xl font-medium leading-relaxed text-zinc-100 sm:text-3xl sm:leading-relaxed">
          {currentText}
        </p>
      </div>

      {/* Controles grandes */}
      <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center justify-center gap-7">
          <button
            type="button"
            onClick={onPrev}
            disabled={currentChunk <= 0}
            aria-label="Fragmento anterior"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-all hover:bg-zinc-700 active:scale-95 disabled:opacity-30"
          >
            <Rewind className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={onPlayPause}
            aria-label={state === "playing" ? "Pausar lectura" : "Reanudar lectura"}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_40px_rgba(16,185,129,0.45)] transition-all hover:bg-emerald-400 active:scale-95"
          >
            {isLoadingChunk && state === "playing" ? (
              <Loader2 className="h-9 w-9 animate-spin" />
            ) : state === "playing" ? (
              <Pause className="h-9 w-9" fill="currentColor" />
            ) : (
              <Play className="h-9 w-9 translate-x-[3px]" fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={currentChunk >= totalChunks - 1}
            aria-label="Fragmento siguiente"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 transition-all hover:bg-zinc-700 active:scale-95 disabled:opacity-30"
          >
            <Forward className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onStop}
            aria-label="Detener lectura y salir"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            )}
          >
            <Square className="h-4 w-4" fill="currentColor" />
            Detener lectura
          </button>
        </div>
      </div>
    </div>
  );
}

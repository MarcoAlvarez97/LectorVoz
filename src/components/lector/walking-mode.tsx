"use client";

import { useRef, useState } from "react";
import { Forward, Pause, Play, Rewind, Square, Loader2, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatClock } from "@/lib/lector";
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

  totalSeconds: number;
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Salta a una posición del documento (0–100), al soltar la barra */
  onSeek: (percent: number) => void;
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
  totalSeconds,
  onPlayPause,
  onStop,
  onPrev,
  onNext,
  onSeek,
}: WalkingModeProps) {
  // Mientras se arrastra la barra se muestra el valor local; al soltar salta.
  // scrubRef permite confirmar el salto aunque el navegador no dispare
  // onValueCommit (pasa con End/Home en algunos navegadores).
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  const display = scrub ?? progressPercent;
  const scrubElapsed = (display / 100) * totalSeconds;

  const setScrubValue = (v: number | null) => {
    scrubRef.current = v;
    setScrub(v);
  };
  const commitScrub = () => {
    const v = scrubRef.current;
    if (v === null) return;
    setScrubValue(null);
    onSeek(v);
  };

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

      <div className="mx-5 flex items-center gap-3">
        <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-white">
          {formatClock(scrubElapsed)}
        </span>
        <Slider
          value={[Math.min(100, Math.max(0, display))]}
          min={0}
          max={100}
          step={0.1}
          aria-label="Barra de audio: arrastrá para volver o avanzar"
          onValueChange={(values) => setScrubValue(values[0])}
          onValueCommit={(values) => {
            setScrubValue(null);
            onSeek(values[0]);
          }}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="h-5 flex-1 [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:bg-zinc-700 [&_[data-slot=slider-range]]:bg-emerald-400 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-emerald-400 [&_[data-slot=slider-thumb]]:bg-white"
        />
        <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-400">
          {formatClock(totalSeconds)}
        </span>
      </div>

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

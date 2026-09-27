"use client";

import { SlidersHorizontal, UserRound, UserRoundCheck } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type VoiceGender = "female" | "male";

interface VoiceSelectorProps {
  voice: VoiceGender;
  onVoiceChange: (voice: VoiceGender) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

/**
 * Selector de voz: EXACTAMENTE una voz por género (mujer / hombre).
 * Voces neuronales reales generadas como audio MP3: la mujer es siempre
 * mujer y el hombre es siempre hombre, en cualquier dispositivo — sin
 * voces robóticas del sistema.
 */
export function VoiceSelector({
  voice,
  onVoiceChange,
  speed,
  onSpeedChange,
  disabled,
}: VoiceSelectorProps) {
  return (
    <div className={cn("space-y-4", disabled && "opacity-60 pointer-events-none")}>
      {/* Género de la voz: una sola voz por género */}
      <div className="grid grid-cols-2 gap-3">
        <VoiceCard
          selected={voice === "female"}
          onClick={() => onVoiceChange("female")}
          icon={<UserRoundCheck className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de mujer"
          subtitle="Dalia · cálida y clara"
          selectedClasses="ring-2 ring-rose-500 bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-700"
          iconClasses="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        />
        <VoiceCard
          selected={voice === "male"}
          onClick={() => onVoiceChange("male")}
          icon={<UserRound className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de hombre"
          subtitle="Jorge · grave y clara"
          selectedClasses="ring-2 ring-teal-600 bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:border-teal-700"
          iconClasses="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
        />
      </div>

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Voces neuronales en español (misma calidad en todos los equipos):
        el audio se genera al instante y se guarda en el móvil para volver a
        escucharlo sin regenerarlo. Requiere internet mientras lee.
      </p>

      {/* Velocidad */}
      <div className="rounded-xl border border-zinc-200 bg-card p-3.5 dark:border-zinc-800">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-medium text-foreground">Velocidad de lectura</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {speed.toFixed(2).replace(/\.?0+$/, "")}x
          </span>
        </div>
        <Slider
          value={[speed]}
          min={0.5}
          max={2}
          step={0.05}
          onValueChange={(values) => onSpeedChange(values[0])}
          aria-label="Velocidad de lectura"
        />
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>0.5x · lenta</span>
          <span>1x · normal</span>
          <span>2x · rápida</span>
        </div>
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          El cambio de velocidad es <span className="font-semibold">instantáneo y jamás
          reinicia la lectura</span>: el audio sigue exactamente por el mismo punto,
          solo acelera o frena.
        </p>
      </div>
    </div>
  );
}

interface VoiceCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selectedClasses: string;
  iconClasses: string;
}

function VoiceCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  selectedClasses,
  iconClasses,
}: VoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-[44px] flex-col items-center gap-1.5 rounded-xl border-2 bg-card p-3 transition-all active:scale-[0.98] sm:p-4",
        selected
          ? selectedClasses
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
      )}
    >
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", iconClasses)}>
        {icon}
      </span>
      <span className="space-y-0.5 text-center">
        <span className="flex items-center justify-center gap-1 text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

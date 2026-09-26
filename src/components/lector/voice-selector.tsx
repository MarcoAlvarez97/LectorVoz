"use client";

import { SlidersHorizontal, UserRound, UserRoundCheck, Volume2, CloudCog, WifiOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type VoiceGender = "female" | "male";
export type TtsEngine = "browser" | "server";

interface VoiceSelectorProps {
  engine: TtsEngine;
  onEngineChange: (engine: TtsEngine) => void;
  voice: VoiceGender;
  onVoiceChange: (voice: VoiceGender) => void;
  /** Sin conexión: el motor HD del servidor queda deshabilitado */
  offline: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

/**
 * Selector de voz: EXACTAMENTE una voz por género (mujer / hombre).
 * El dispositivo elige automáticamente la mejor voz en español disponible
 * para el género elegido — sin listas ni opciones extra.
 */
export function VoiceSelector({
  engine,
  onEngineChange,
  voice,
  onVoiceChange,
  offline,
  speed,
  onSpeedChange,
  disabled,
}: VoiceSelectorProps) {
  return (
    <div className={cn("space-y-4", disabled && "opacity-60 pointer-events-none")}>
      {/* Motor de voz */}
      <div className="rounded-xl border border-zinc-200 bg-card p-3 dark:border-zinc-800">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Motor de voz
        </p>
        <div className="grid grid-cols-2 gap-2">
          <EngineOption
            selected={engine === "browser"}
            onClick={() => onEngineChange("browser")}
            icon={<Volume2 className="h-4 w-4" />}
            title="Voz del navegador"
            subtitle="Gratis · sin conexión"
          />
          <EngineOption
            selected={engine === "server" && !offline}
            disabled={offline}
            onClick={() => onEngineChange("server")}
            icon={offline ? <WifiOff className="h-4 w-4" /> : <CloudCog className="h-4 w-4" />}
            title="Voz HD (servidor)"
            subtitle={offline ? "Requiere internet" : "Más natural · opcional"}
          />
        </div>
        {engine === "browser" && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Una voz por género: elegís <span className="font-medium">mujer</span> u{" "}
            <span className="font-medium">hombre</span> y la app toma automáticamente la mejor
            voz en español de tu dispositivo (las «naturales» primero si hay internet, o las
            instaladas que funcionan sin conexión).
          </p>
        )}
        {engine === "server" && !offline && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Voz de audiolibro generada en el servidor. Necesita una clave de OpenAI
            (OPENAI_API_KEY) en tu equipo o en Vercel; sin ella, la app usa
            automáticamente la voz gratuita del navegador.
          </p>
        )}
      </div>

      {/* Género de la voz: una sola voz por género */}
      <div className="grid grid-cols-2 gap-3">
        <VoiceCard
          selected={voice === "female"}
          onClick={() => onVoiceChange("female")}
          icon={<UserRoundCheck className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de mujer"
          subtitle="Cálida y cercana"
          selectedClasses="ring-2 ring-rose-500 bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-700"
          iconClasses="bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
        />
        <VoiceCard
          selected={voice === "male"}
          onClick={() => onVoiceChange("male")}
          icon={<UserRound className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de hombre"
          subtitle="Profesional y clara"
          selectedClasses="ring-2 ring-teal-600 bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:border-teal-700"
          iconClasses="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
        />
      </div>

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
          El cambio de velocidad se aplica al instante y <span className="font-semibold">jamás
          reinicia la lectura</span>: sigue exactamente por donde va, solo acelera o frena.
        </p>
      </div>
    </div>
  );
}

function EngineOption({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        "flex min-h-[44px] items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all",
        selected
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-500/10"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
        disabled && "cursor-not-allowed opacity-55 hover:border-zinc-200 hover:bg-transparent dark:hover:border-zinc-800"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
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

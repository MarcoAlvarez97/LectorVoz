"use client";

import { Mic, SlidersHorizontal, UserRound, UserRoundCheck, Volume2, CloudCog, WifiOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { VoiceOption } from "@/lib/browser-voice";
import { cn } from "@/lib/utils";

export type VoiceGender = "female" | "male";
export type TtsEngine = "browser" | "server";

interface VoiceSelectorProps {
  engine: TtsEngine;
  onEngineChange: (engine: TtsEngine) => void;
  voice: VoiceGender;
  onVoiceChange: (voice: VoiceGender) => void;
  /** Voces en español detectadas en el dispositivo */
  voices: VoiceOption[];
  /** voiceURI elegido manualmente (o null = automático) */
  selectedUri: string | null;
  onVoiceUriChange: (uri: string) => void;
  /** Sin conexión: el motor HD del servidor queda deshabilitado */
  offline: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
}

export function VoiceSelector({
  engine,
  onEngineChange,
  voice,
  onVoiceChange,
  voices,
  selectedUri,
  onVoiceUriChange,
  offline,
  speed,
  onSpeedChange,
  disabled,
}: VoiceSelectorProps) {
  const genderVoices = voices.filter((v) => v.gender === voice || v.gender === "unknown");

  return (
    <div className={cn("space-y-4", disabled && "opacity-60 pointer-events-none")}>
      {/* Motor de voz */}
      <div className="rounded-xl border border-zinc-200 bg-card p-3">
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
            Usa las voces en español de tu dispositivo. Con internet elegimos las más
            naturales (Edge «Natural», Google); las marcadas como «sin conexión» funcionan
            incluso en modo avión.
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

      {/* Género de la voz */}
      <div className="grid grid-cols-2 gap-3">
        <VoiceCard
          selected={voice === "female"}
          onClick={() => onVoiceChange("female")}
          icon={<UserRoundCheck className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de mujer"
          subtitle="Cálida y cercana"
          selectedClasses="ring-2 ring-rose-500 bg-rose-50 border-rose-300"
          iconClasses="bg-rose-100 text-rose-600"
        />
        <VoiceCard
          selected={voice === "male"}
          onClick={() => onVoiceChange("male")}
          icon={<UserRound className="h-7 w-7" strokeWidth={1.6} />}
          title="Voz de hombre"
          subtitle="Profesional y clara"
          selectedClasses="ring-2 ring-teal-600 bg-teal-50 border-teal-300"
          iconClasses="bg-teal-100 text-teal-700"
        />
      </div>

      {/* Voz concreta del dispositivo (motor navegador) */}
      {engine === "browser" && (
        <div className="rounded-xl border border-zinc-200 bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Voz del dispositivo
            </p>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {voices.length} en español
            </span>
          </div>

          {voices.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              No se detectaron voces en español en este dispositivo. Instala un paquete de
              voz español (o abre la app en Chrome/Edge) y recarga la página.
            </p>
          ) : (
            <div className="relative">
              <select
                value={selectedUri ?? ""}
                onChange={(event) => onVoiceUriChange(event.target.value)}
                aria-label="Elegir voz del dispositivo"
                className="h-11 w-full appearance-none rounded-lg border border-zinc-300 bg-white px-3 pr-9 text-sm text-foreground outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="">Automática (recomendada)</option>
                {genderVoices.map((v) => (
                  <option key={v.uri} value={v.uri}>
                    {v.name}
                    {v.natural ? " · natural" : v.local ? " · sin conexión" : " · requiere internet"}
                  </option>
                ))}
              </select>
              <Mic className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          )}
        </div>
      )}

      {/* Velocidad */}
      <div className="rounded-xl border border-zinc-200 bg-card p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-foreground">Velocidad de lectura</span>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-700">
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
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
          El cambio de velocidad se aplica al instante: la lectura sigue por donde va,
          sin reiniciarse ni volver al comienzo.
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
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50",
        disabled && "cursor-not-allowed opacity-55 hover:border-zinc-200 hover:bg-transparent"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-500"
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
          : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
      )}
    >
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", iconClasses)}>
        {icon}
      </span>
      <span className="space-y-0.5 text-center">
        <span className="flex items-center justify-center gap-1 text-sm font-semibold text-foreground">
          <Mic className="h-3.5 w-3.5 opacity-50" />
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

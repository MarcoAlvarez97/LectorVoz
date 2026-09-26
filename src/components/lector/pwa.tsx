"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registra el service worker que habilita el modo offline.
 * Se monta una sola vez desde el layout.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[PWA] No se pudo registrar el service worker:", err));
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Botón "Instalar app":
 *  - Android/Chrome/Edge: usa el prompt nativo de instalación (beforeinstallprompt).
 *  - iOS Safari: muestra cómo añadir a la pantalla de inicio.
 *  - Si la app ya está instalada, no se muestra.
 */
export function InstallButton({ className }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosTip, setShowIosTip] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Ya instalada (o sin posibilidad de instalar y sin ser iOS): no mostrar nada
  if (installed || (isStandalone() && !promptEvent)) return null;

  const handleInstall = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    // Sin prompt nativo (p. ej. iOS): muestra las instrucciones
    setShowIosTip((v) => !v);
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleInstall}
        aria-label="Instalar app en el celular"
        className="min-h-[40px] rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-200"
      >
        {promptEvent ? <Download className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
        <span className="hidden sm:inline">
          {promptEvent ? "Instalar app" : isIos() ? "Instalar" : "Instalar app"}
        </span>
      </Button>

      {showIosTip && !promptEvent && (
        <div
          role="note"
          className="absolute right-0 top-12 z-50 w-64 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <p className="mb-1 font-semibold text-foreground">Instalar en iPhone/iPad</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Toca el botón Compartir de Safari.</li>
            <li>Elige «Añadir a pantalla de inicio».</li>
            <li>Confirma con «Añadir».</li>
          </ol>
          <p className="mt-1.5 text-zinc-500">
            En Android usa Chrome → menú ⋮ → «Instalar aplicación».
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Indicador de conexión: solo aparece cuando NO hay internet,
 * para dejar claro que la app sigue funcionando en modo offline.
 */
export function OfflineBadge() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <span
      role="status"
      className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Sin conexión · modo offline activo</span>
      <span className="sm:hidden">Offline</span>
    </span>
  );
}

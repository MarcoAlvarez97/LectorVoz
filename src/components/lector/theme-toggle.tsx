"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Alternancia modo claro / oscuro.
 * - La preferencia se guarda en localStorage (clave "lectorvoz-theme").
 * - La primera visita respeta la preferencia del sistema.
 * - Un script inline en el layout aplica la clase ANTES de pintar (sin flash).
 * - El icono se intercambia por CSS (dark:) sin estado ni efectos.
 */
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";
    try {
      localStorage.setItem("lectorvoz-theme", next ? "dark" : "light");
    } catch {
      // almacenamiento bloqueado: el cambio igualmente se aplica en esta sesión
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label="Cambiar entre modo claro y modo oscuro"
      title="Modo claro / oscuro"
      className="h-10 w-10 shrink-0 rounded-full"
    >
      <Moon className="h-5 w-5 dark:hidden" />
      <Sun className="hidden h-5 w-5 dark:block" />
    </Button>
  );
}

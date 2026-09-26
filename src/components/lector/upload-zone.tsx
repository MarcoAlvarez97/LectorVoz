"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, FileText, FileType2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isParsing: boolean;
}

const ACCEPTED = ".pdf,.docx,.txt,.md,.csv";

export function UploadZone({ onFileSelected, isParsing }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0 && !isParsing) {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected, isParsing]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Zona para cargar documento"
      onClick={() => !isParsing && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !isParsing) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "group flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed bg-card p-8 text-center transition-all",
        isDragging
          ? "border-emerald-500 bg-emerald-50/60 scale-[1.01]"
          : "border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50/30",
        isParsing && "pointer-events-none opacity-80"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {isParsing ? (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Analizando documento…</p>
            <p className="text-sm text-muted-foreground">
              Extrayendo el texto para prepararlo para la lectura
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 transition-transform group-hover:scale-110">
            <CloudUpload className="h-10 w-10 text-emerald-600" strokeWidth={1.6} />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground sm:text-xl">
              Arrastra tu documento aquí
            </p>
            <p className="text-sm text-muted-foreground">
              o{" "}
              <span className="font-medium text-emerald-600 underline underline-offset-4">
                haz clic para seleccionarlo
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Badge icon={<FileText className="h-3.5 w-3.5" />} label="PDF" />
            <Badge icon={<FileType2 className="h-3.5 w-3.5" />} label="Word DOCX" />
            <Badge icon={<FileText className="h-3.5 w-3.5" />} label="TXT" />
            <Badge icon={<FileText className="h-3.5 w-3.5" />} label="MD" />
            <Badge icon={<FileText className="h-3.5 w-3.5" />} label="CSV" />
          </div>
          <p className="text-xs text-muted-foreground">Máximo 20 MB</p>
        </>
      )}
    </div>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
      {icon}
      {label}
    </span>
  );
}

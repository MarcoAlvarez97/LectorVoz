import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegistrar } from "@/components/lector/pwa";

export const metadata: Metadata = {
  title: "LectorVoz — Escucha tus documentos mientras caminas",
  description:
    "Carga un documento (PDF, Word, TXT), analízalo y escúchalo en voz alta con voz de hombre o mujer. Funciona sin conexión, instalable en el celular.",
  keywords: ["lector de documentos", "texto a voz", "audiolibros", "TTS", "lectura por voz", "offline", "PWA"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LectorVoz",
  },
  openGraph: {
    title: "LectorVoz",
    description: "Convierte cualquier documento en un audiolibro para tus caminatas",
    siteName: "LectorVoz",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#059669",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('lectorvoz-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;if(d){e.classList.add('dark');e.style.colorScheme='dark';}else{e.style.colorScheme='light';}}catch(err){}})();",
          }}
        />
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

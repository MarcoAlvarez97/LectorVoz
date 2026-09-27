# LectorVoz 🎧📖

> **VERSIÓN 1.4.0 — MOTOR NUEVO DE VOZ NEURONAL.** Mujer SIEMPRE mujer (Dalia), hombre SIEMPRE hombre (Jorge), cero voz robótica, adelantar real con la barra, velocidad instantánea que JAMÁS reinicia y reloj de reproductor con tiempo total.

Convierte tus documentos (**PDF, Word DOCX, TXT, MD, CSV**) en audiolibros: cárgalos,
analízalos y escúchalos en voz alta con voz de **hombre o mujer**, mientras caminas,
cocinas o viajas.

> ✨ **Análisis 100 % en tu dispositivo** (funciona sin conexión) y **voz neuronal
> generada al instante** sin claves ni configuración. Para generar la voz se
> necesita internet; cada fragmento generado queda guardado en el navegador
> para volver a escucharlo sin regenerarlo.

---

## Características

| Función | Detalle |
|---|---|
| 📄 Análisis de documentos | **En el navegador** (offline): PDF con `pdfjs-dist`, Word con `mammoth`, texto plano nativo. Sin servidores, sin subir tu archivo a nadie. **Hasta 200 MB** y ~320.000 palabras por documento. |
| 🔊 Lectura por voz | **Voces neuronales reales (audio MP3)** generadas al instante: calidad idéntica en cualquier dispositivo. Sin claves API. Requiere internet mientras lee. |
| 👩 voz de mujer / 👨 voz de hombre | **Exactamente una voz por género, garantizada:** mujer = `es-MX-DaliaNeural`, hombre = `es-MX-JorgeNeural`. Imposible que suenen al revés y sin voces robóticas del sistema. |
| ⏩ Velocidad | 0.5x – 2x. Al mover el slider se ajusta `playbackRate` del audio en curso: **la lectura sigue exactamente por el mismo punto — jamás se reinicia, nunca vuelve atrás, no se corta**. |
| 🎚️ Barra de audio con reloj | Como un reproductor de música: **tiempo transcurrido real / duración total** (duración real de los fragmentos ya generados + estimado del resto) y barra deslizable para **adelantar o volver a cualquier punto exacto** del documento. También en el modo caminata. |
| 🌗 Modo claro / oscuro | Botón en el encabezado; respeta la preferencia del sistema en la primera visita y guarda tu elección. |
| 🚶 Modo caminata | Pantalla completa con texto gigante y controles grandes. |
| 📱 **PWA instalable** | Instálala como app en Android, iPhone, Windows o macOS. Incluye logo propio, pantalla standalone y acceso desde el escritorio. |
| 🌐 **Modo offline** | Service worker que guarda la app completa: abre y analiza documentos sin internet. La voz neuronal necesita internet para generar el audio. |
| 🎯 Sincronización de texto | El párrafo que se lee se resalta y hace scroll automático; toca cualquier párrafo para saltar a él. |

---

## Requisitos

- **Node.js 20.9 o superior** (probado con Node 20+ y Next.js 16)
- npm (viene con Node) — o pnpm/bun si lo prefieres

---

## Abrir el proyecto en VS Code (local)

```bash
# 1. Descomprime el ZIP y entra a la carpeta
cd lectorvoz

# 2. Instala dependencias
npm install

# 3. Arranca en desarrollo
npm run dev
# → abre http://localhost:3000
```

En VS Code: **File → Open Folder…** y selecciona la carpeta del proyecto.
Recomendado: extensión *ESLint* (ya viene configurada con `npm run lint`).

---

## Desplegar en Vercel

### Opción A · Desde GitHub (recomendada)

1. Crea un repositorio en GitHub y sube el proyecto:
   ```bash
   git init
   git add .
   git commit -m "LectorVoz"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/lectorvoz.git
   git push -u origin main
   ```
2. Entra en [vercel.com/new](https://vercel.com/new), importa el repositorio.
3. **No toques nada**: Vercel detecta Next.js automáticamente. Pulsa **Deploy**.
4. Listo: tendrás una URL tipo `https://lectorvoz.vercel.app`.

### Opción B · Con la CLI de Vercel

```bash
npm i -g vercel
vercel          # primer deploy (responde las preguntas)
vercel --prod   # deploy a producción
```

> La app **no necesita ninguna variable de entorno**: la voz la pone tu navegador
> o tu teléfono (Web Speech API). Esto además hace que la lectura funcione
> offline y sin costes.

---

## Instalar la app en el celular (PWA)

1. Abre la URL desplegada en el navegador del celular.
2. **Android (Chrome):** pulsa el botón **«Instalar app»** de la app, o menú ⋮ →
   «Instalar aplicación».
3. **iPhone/iPad (Safari):** botón **Compartir** → **«Añadir a pantalla de inicio»**
   (la app también muestra las instrucciones al pulsar «Instalar»).
4. En **Windows/macOS**: Chrome o Edge muestran el icono de instalación en la barra
   de direcciones.

Tras instalar, LectorVoz abre en su propia ventana, con su logo, sin barra del
navegador — y sigue funcionando **en modo avión**.

### Voces sin conexión

- La app prioriza automáticamente las voces **naturales** cuando hay internet
  (Google/Edge) y las voces **instaladas** del dispositivo cuando no.
- **Android:** Configuración → Sistema → *Síntesis de voz* → Google TTS → descarga
  voces en español (más voces instaladas = mejor calidad).
- **Windows 10/11:** Configuración → Hora e idioma → Voz → añadir voces
  (las *naturales* de Edge son de muy alta calidad, incluidas voces masculinas
  como Álvaro o Dario).
- **iOS/macOS:** ya incluyen voces en español de calidad (Mónica, Paulina, Jorge…).

---

## Estructura del proyecto

```
lectorvoz/
├── public/
│   ├── manifest.json          # Manifest PWA (nombre, iconos, colores)
│   ├── sw.js                  # Service worker (modo offline)
│   └── icons/                 # Logo propio (192, 512, maskable…)
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Metadata PWA + tema claro/oscuro + registro del SW
│   │   ├── page.tsx           # Flujo de 3 pasos + reproductor completo
│   │   ├── icon.png           # Favicon generado
│   │   └── apple-icon.png     # Icono iOS
│   ├── components/lector/
│   │   ├── upload-zone.tsx    # Paso 1: arrastrar documento (hasta 200 MB)
│   │   ├── voice-selector.tsx # Voz (1 por género) y velocidad
│   │   ├── theme-toggle.tsx   # Modo claro / oscuro
│   │   ├── player-bar.tsx     # Barra fija con reloj y barra de audio deslizable
│   │   ├── walking-mode.tsx   # Modo caminata a pantalla completa
│   │   └── pwa.tsx            # Instalar app + indicador offline + SW registrar
│   └── lib/
│       ├── lector.ts          # Fragmentación de texto y utilidades de tiempo
│       ├── parse-client.ts    # Análisis PDF/DOCX/TXT en el navegador (offline)
│       └── browser-voice.ts   # Elección automática de la mejor voz por género
├── next.config.ts
└── package.json
```

---

## Solución de problemas

| Problema | Solución |
|---|---|
| «Navegador sin síntesis de voz» | Usa Chrome, Edge o Safari actualizados. Firefox en algunos sistemas no incluye voces. |
| La voz de mujer/hombre no me gusta | La app elige la mejor voz instalada de tu dispositivo. Instala voces de calidad: en Windows añade las voces *naturales* de Edge; en Android descarga voces de Google TTS. Con más voces instaladas, la app elige mejor. |
| Cambié la velocidad y tarda un instante | La lectura **continúa desde la palabra en curso** con la nueva velocidad (jamás vuelve al inicio). Si estabas a mitad de una oración, se reanuda enseguida en ese punto. |
| La barra de tiempo avanza un poco distinto a la voz | El reloj es una estimación (como en reproductores de música) y se autocorrige con la posición real de lectura que reporta el navegador. |
| Arrastré la barra y saltó a otro lado | Es el salto de posición: suelta la barra y la lectura retoma exactamente desde ese punto del documento. |
| «El documento no contiene texto legible» | El PDF está escaneado como imagen (sin capa de texto). Usa un PDF con texto real. |
| La PWA no muestra «Instalar» | iOS siempre es vía Compartir → Añadir a pantalla de inicio. En Android, abre con Chrome. |
| Tras publicar cambios, la PWA sigue igual | Se actualiza al recargar dos veces. También puedes subir `VERSION` en `public/sw.js` para forzar la renovación de cachés. |
| Error al compilar localmente | Verifica Node ≥ 20.9: `node -v`. Borra `.next` y `node_modules` y repite `npm install`. |

---

## Tecnologías

[Next.js 16](https://nextjs.org) · [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org)
· [Tailwind CSS 4](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com)
· [pdfjs-dist](https://github.com/mozilla/pdf.js) · [mammoth](https://github.com/mwilliamson/mammoth.js)
· Web Speech API · Service Workers / PWA

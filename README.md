# LectorVoz 🎧📖

Convierte tus documentos (**PDF, Word DOCX, TXT, MD, CSV**) en audiolibros: cárgalos,
analízalos y escúchalos en voz alta con voz de **hombre o mujer**, mientras caminas,
cocinas o viajas.

> ✨ **Funciona 100 % sin conexión** después de la primera visita: el análisis de
> documentos y la lectura por voz ocurren en tu propio dispositivo.

---

## Características

| Función | Detalle |
|---|---|
| 📄 Análisis de documentos | **En el navegador** (offline): PDF con `pdfjs-dist`, Word con `mammoth`, texto plano nativo. Sin servidores, sin subir tu archivo a nadie. **Hasta 200 MB** y ~320.000 palabras por documento. |
| 🔊 Lectura por voz | **Web Speech API** con la mejor voz en español de tu dispositivo (gratis, offline). Motor **HD opcional** vía OpenAI si configuras `OPENAI_API_KEY`. |
| 👩 voz de mujer / 👨 voz de hombre | **Exactamente una voz por género**: elegís mujer u hombre y la app toma automáticamente la mejor voz en español disponible (con internet prioriza las voces «naturales» de Edge/Google; sin conexión usa las instaladas). |
| ⏩ Velocidad | 0.5x – 2x y el cambio **se aplica al instante y JAMÁS reinicia la lectura**: sigue exactamente por donde va, solo acelera o frena. La posición solo la cambia el usuario. |
| 🎚️ Barra de audio deslizable | Arrastrá la barra para **volver o saltar a cualquier parte** del documento (retoma exactamente en ese punto) + botones de fragmento anterior/siguiente, también en el modo caminata. |
| 🌗 Modo claro / oscuro | Botón en el encabezado; respeta la preferencia del sistema en la primera visita y guarda tu elección. |
| 🚶 Modo caminata | Pantalla completa con texto gigante y controles grandes. |
| 📱 **PWA instalable** | Instálala como app en Android, iPhone, Windows o macOS. Incluye logo propio, pantalla standalone y acceso desde el escritorio. |
| 🌐 **Modo offline** | Service worker que guarda la app completa: abre, analiza y escucha documentos sin internet. |
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

### Variables de entorno (OPCIONAL)

La app funciona **sin ninguna variable de entorno** gracias al motor de voz del
navegador. Si quieres voces neuronales HD (opcionales, requieren internet):

| Variable | Valor |
|---|---|
| `OPENAI_API_KEY` | Tu clave de OpenAI (en Vercel: *Settings → Environment Variables*) |

---

## ¿Qué es OPENAI_API_KEY? (voz HD, opcional)

`OPENAI_API_KEY` es una **clave privada de la plataforma de OpenAI** que le da a tu
servidor permiso para usar sus voces neuronales TTS. Con ella, el motor
**«Voz HD (servidor)»** genera audio con calidad de audiolibro (modelo
`gpt-4o-mini-tts`, voz femenina *coral* y masculina *onyx*, con instrucciones de
narración en español). Es **totalmente opcional**: sin la clave, la app usa las
voces de tu dispositivo, que son gratis y funcionan offline.

### Cómo conseguirla (5 minutos)

1. Crea una cuenta en [platform.openai.com](https://platform.openai.com) y
   añade un método de pago (menú *Billing* → mínimo recomendado US$5).
2. Ve a *API keys* → **Create new secret key** → cópiala (empieza por `sk-`).
3. **En tu PC (VS Code):** crea un archivo llamado `.env.local` junto a
   `package.json` con esta línea y reinicia `npm run dev`:
   ```
   OPENAI_API_KEY=sk-TU_CLAVE_AQUI
   ```
4. **En Vercel:** entra a tu proyecto → *Settings → Environment Variables* →
   añade `OPENAI_API_KEY` con tu clave → haz **Redeploy**.

### ¿Cuánto cuesta?

- Se paga por uso, sin cuota mensual. El TTS cuesta **≈ US$1,50 por cada
  100.000 caracteres** (~15.000 palabras, unas 30 páginas).
- Escuchar un libro de 300 páginas ronda los **US$10–15** en total.
- Los fragmentos ya escuchados quedan en caché en el navegador: volver a
  escucharlos **no vuelve a cobrar**.
- Sin la clave **no gastas nada**: el motor del navegador es 100 % gratuito.

> 🔒 Seguridad: nunca subas la clave a GitHub ni la compartas. El `.gitignore`
> del proyecto ya excluye los archivos `.env*`.

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

- Las voces marcadas como **«sin conexión»** en la lista están instaladas en el
  dispositivo y funcionan offline. La app las prioriza automáticamente.
- **Android:** Configuración → Sistema → *Síntesis de voz* → Google TTS → descarga
  voces en español.
- **Windows 10/11:** Configuración → Hora e idioma → Voz → añadir voces
  (las *naturales* de Edge son de muy alta calidad).
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
│   │   ├── api/tts/           # Motor HD opcional (OpenAI) — sin key responde 501
│   │   ├── layout.tsx         # Metadata PWA + registro del service worker
│   │   ├── page.tsx           # Flujo de 3 pasos + reproductor
│   │   ├── icon.png           # Favicon generado
│   │   └── apple-icon.png     # Icono iOS
│   ├── components/lector/
│   │   ├── upload-zone.tsx    # Paso 1: arrastrar documento
│   │   ├── voice-selector.tsx # Motor, voz (1 por género) y velocidad
│   │   ├── theme-toggle.tsx   # Modo claro / oscuro
│   │   ├── player-bar.tsx     # Barra fija estilo Spotify con barra de audio deslizable
│   │   ├── walking-mode.tsx   # Modo caminata a pantalla completa
│   │   └── pwa.tsx            # Instalar app + indicador offline + SW registrar
│   └── lib/
│       ├── lector.ts          # Fragmentación de texto y utilidades
│       ├── parse-client.ts    # Análisis PDF/DOCX/TXT en el navegador (offline)
│       └── browser-voice.ts   # Voces españolas del dispositivo (naturales primero)
├── next.config.ts
└── package.json
```

---

## Solución de problemas

| Problema | Solución |
|---|---|
| «No se detectaron voces en español» | Instala un paquete de voz español y recarga. En Chrome/Edge casi siempre hay voces disponibles. La app elige sola la mejor voz del género elegido. |
| Cambié la velocidad y no se nota aún | En el motor «navegador» la nueva velocidad entra con la **siguiente oración** (la actual termina a la velocidad anterior, sin cortes). En el motor HD es instantáneo. |
| Arrastré la barra y saltó a otro lado | Es el salto de posición: suelta la barra y la lectura retoma exactamente desde ese punto del documento. |
| La voz HD dice «El servidor no tiene un proveedor de voz» | Falta `OPENAI_API_KEY` (ver la sección de arriba). La app pasa sola a la voz gratuita del navegador. |
| La voz HD da error HTTP 401 | La clave es inválida o no tiene crédito. Revisa *Billing* en platform.openai.com. |
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

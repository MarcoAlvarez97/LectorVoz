import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // msedge-tts abre un WebSocket hacia el servicio de voces neuronales:
  // debe ejecutarse fuera del bundler para funcionar en serverless (Vercel).
  serverExternalPackages: ["msedge-tts"],
};

export default nextConfig;

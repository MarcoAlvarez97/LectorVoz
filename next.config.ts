import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El análisis de documentos y la lectura por voz se ejecutan 100% en el
  // navegador (pdfjs-dist + mammoth + Web Speech API), por lo que no hay
  // paquetes de servidor que externalizar.
};

export default nextConfig;

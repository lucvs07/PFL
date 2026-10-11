import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173 },
  // O Phaser sozinho tem ~1,2 MB; o aviso padrão de 500 kB não ajuda aqui.
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});

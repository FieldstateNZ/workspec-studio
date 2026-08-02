import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { chunkSizeWarningLimit: 3000 },
  preview: { port: 4517, strictPort: true },
});

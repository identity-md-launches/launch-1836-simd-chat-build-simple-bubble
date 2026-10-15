import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { snapshot: ['./src/data/snapshot.json'] } } },
  },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.FE_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4000' },
  },
});

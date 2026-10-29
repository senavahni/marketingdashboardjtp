import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Satu .env di root project: envDir '..'. Hanya variabel VITE_* yang terekspos ke browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const backend = `http://localhost:${env.PORT || 3000}`;
  return {
    envDir: '..',
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      port: Number(env.FRONTEND_PORT || 5173),
      // Same-origin: /api & /socket.io diteruskan ke backend (cookie refresh token tetap first-party)
      proxy: {
        '/api': { target: backend, changeOrigin: false },
        '/health': backend,
        '/socket.io': { target: backend, ws: true },
      },
    },
    build: { chunkSizeWarningLimit: 3000, sourcemap: true },
  };
});

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const usePlato = env.VITE_LLM_PROVIDER === 'plato';

  // Conditionally resolve the path to the AI service implementation
  const geminiServicePath = usePlato
    ? path.resolve(__dirname, 'services/geminiService.platoAdapter.ts')
    : path.resolve(__dirname, 'services/geminiService.ts');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_PLATO_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    plugins: [react()],
    define: {
      // Keep Gemini key for potential fallback, though it's not used by Plato
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        // This alias ensures that any import of '@/services/geminiService'
        // is correctly routed to the Plato adapter when the env var is set.
        { find: '@/services/geminiService', replacement: geminiServicePath },
      ]
    }
  };
});

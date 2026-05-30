import { defineConfig, loadEnv } from 'vite';
import preact from '@preact/preset-vite';
import pkg from '../package.json';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../');

  const isMockMode = env.VITE_MOCK_MODE === 'true';

  return {
    plugins: [preact()],
    envDir: '../',
    define: {
      'import.meta.env.VERSION': JSON.stringify(pkg.version),
    },
    server: {
      allowedHosts: [
        env.VITE_URL_MAPPING
      ],
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          changeOrigin: true,
          secure: false,
        },
        '/music': 'http://localhost:3001',
        '/game_covers': 'http://localhost:3001',
      },
      hmr: {
        clientPort: isMockMode ? 5173 : 443,
      },
    },
  };
});
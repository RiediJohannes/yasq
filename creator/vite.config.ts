import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { persistPlugin } from './persist/index.js';

export default defineConfig({
  plugins: [preact(), persistPlugin()],
  publicDir: 'src/assets',
  server: {
    port: 5174,
  },
});

import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  server: {
    proxy: {
      '/geminiProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/fmpProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
      '/alpacaProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
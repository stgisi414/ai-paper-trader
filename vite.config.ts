import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // ADDITION 1: Alias for Firebase modules to prevent resolution issues
      'firebase/auth': 'firebase/auth',
      'firebase/firestore': 'firebase/firestore',
    },
  },
  define: {
    // ADDITION 2: Polyfill for Buffer needed by some Firebase dependencies
    'global.Buffer': {} 
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
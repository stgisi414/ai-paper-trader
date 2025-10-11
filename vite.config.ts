import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'firebase/auth': 'firebase/auth',
      'firebase/firestore': 'firebase/firestore',
    },
  },
  define: {
    'global.Buffer': {} 
  },
  server: {
    proxy: {
      // ALL local dev proxies should target the Firebase Hosting emulator
      '/geminiProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
      },
      '/fmpProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
      },
      '/alpacaProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
      },
      '/optionsProxy': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
      },
      '/userSearch': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
      },
    },
  },
});
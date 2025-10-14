// stgisi414/ai-paper-trader/ai-paper-trader-dd0071fea7ca806e72f139841bd4fc8f4062c1d8/vite.config.ts

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
      // FIX: Set the port back to 5000, keeping the correct '127.0.0.1' and rewrite.
      '/geminiProxy': {
        target: 'http://127.0.0.1:5000', // <--- CHANGED PORT TO 5000
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/geminiProxy/, '/signatex-trader/us-central1/geminiProxy') 
      },
      '/fmpProxy': {
        target: 'http://127.0.0.1:5000', // <--- CHANGED PORT TO 5000
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/fmpProxy/, '/signatex-trader/us-central1/fmpProxy') 
      },
      '/alpacaProxy': {
        target: 'http://127.0.0.1:5000', // <--- CHANGED PORT TO 5000
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/alpacaProxy/, '/signatex-trader/us-central1/alpacaProxy') 
      },
      '/optionsProxy': {
        target: 'http://127.0.0.1:5000', // <--- CHANGED PORT TO 5000
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/optionsProxy/, '/signatex-trader/us-central1/optionsProxy') 
      },
      '/userSearch': {
        target: 'http://127.0.0.1:5000', // <--- CHANGED PORT TO 5000
        changeOrigin: true,
        proxyTimeout: 120000, // 2 minutes
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/userSearch/, '/signatex-trader/us-central1/userSearch') 
      },
    },
  },
});
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
      '/geminiProxy': {
        target: 'http://127.0.0.1:5001', // <--- CORRECT PORT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/geminiProxy/, '/signatex-trader/us-central1/geminiProxy')
      },
      '/fmpProxy': {
        target: 'http://127.0.0.1:5001', // <--- CORRECT PORT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fmpProxy/, '/signatex-trader/us-central1/fmpProxy')
      },
      '/alpacaProxy': {
        target: 'http://127.0.0.1:5001', // <--- CORRECT PORT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/alpacaProxy/, '/signatex-trader/us-central1/alpacaProxy')
      },
      '/optionsProxy': {
        target: 'http://127.0.0.1:5001', // <--- CORRECT PORT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/optionsProxy/, '/signatex-trader/us-central1/optionsProxy')
      },
      '/userSearch': {
        target: 'http://127.0.0.1:5001', // <--- CORRECT PORT
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/userSearch/, '/signatex-trader/us-central1/userSearch')
      },
    },
    // Optional logging (keep if you find it helpful)
    configure: (proxy, options) => {
      proxy.on('proxyReq', (proxyReq, req, res) => {
         console.log(`[Vite Proxy Req] Method: ${req.method} | Original URL: ${req.url}`);
         console.log(` -> Target Host: ${proxyReq.host}:${proxyReq.port} | Rewritten Path: ${proxyReq.path}`); // Added port for clarity
       });
       proxy.on('proxyRes', (proxyRes, req, res) => {
          console.log(`[Vite Proxy Res] Status: ${proxyRes.statusCode} | Original URL: ${req.url}`);
       });
       proxy.on('error', (err, req, res) => {
          console.error('[Vite Proxy Error]', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
          }
          res.end(JSON.stringify({ message: 'Proxy Error', error: err.message }));
       });
     }
  },
});
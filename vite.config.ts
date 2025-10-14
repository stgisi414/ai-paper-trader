server: {
    proxy: {
      // MODIFIED: Use port 5000 as confirmed by user
      '/geminiProxy': {
        target: 'http://127.0.0.1:5000', // Changed port to 5000
        changeOrigin: true,
        proxyTimeout: 120000, 
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/geminiProxy/, '/geminiProxy') 
      },
      '/fmpProxy': {
        target: 'http://127.0.0.1:5000', // Changed port to 5000
        changeOrigin: true,
        proxyTimeout: 120000, 
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/fmpProxy/, '/fmpProxy') 
      },
      '/alpacaProxy': {
        target: 'http://127.0.0.1:5000', // Changed port to 5000
        changeOrigin: true,
        proxyTimeout: 120000, 
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/alpacaProxy/, '/alpacaProxy') 
      },
      '/optionsProxy': {
        target: 'http://127.0.0.1:5000', // Changed port to 5000
        changeOrigin: true,
        proxyTimeout: 120000, 
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/optionsProxy/, '/optionsProxy') 
      },
      '/userSearch': {
        target: 'http://127.0.0.1:5000', // Changed port to 5000
        changeOrigin: true,
        proxyTimeout: 120000, 
        timeout: 120000,
        rewrite: (path) => path.replace(/^\/userSearch/, '/userSearch') 
      },
    },
  },
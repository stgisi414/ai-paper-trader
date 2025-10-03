import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.API_KEY),
        'process.env.FMP_API_KEY': JSON.stringify(env.FMP_API_KEY),
        'process.env.ALPACA_API_KEY': JSON.stringify(env.ALPACA_API_KEY),
        'process.env.ALPACA_SECRET_KEY': JSON.stringify(env.ALPACA_SECRET_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
    };
});
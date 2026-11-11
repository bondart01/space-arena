
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5175,

    proxy: {
      '/api/rooms.json': {
        target: 'http://localhost:5175',
        bypass: () => '/api/rooms.json',
      },

      '/api/rooms': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },

      '/ws': {
        target: 'ws://127.0.0.1:3000',
        ws: true,
      },
    },
  },
});

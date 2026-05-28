import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/fund-thai/',
  server: {
    proxy: {
      '/sec-api': {
        target: 'https://api.sec.or.th',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/sec-api/, ''),
      },
    },
  },
});

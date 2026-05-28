import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/fund-thai/' : '/',
  server: {
    proxy: {
      '/api/sec': {
        target: 'https://api.sec.or.th',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sec/, ''),
      },
    },
  },
});

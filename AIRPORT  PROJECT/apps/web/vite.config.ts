import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          const path = id.replaceAll('\\', '/');
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(path)) return 'react-vendor';
          if (path.includes('/node_modules/@supabase/')) return 'supabase-vendor';
          if (path.includes('/node_modules/lucide-react/')) return 'icons-vendor';
        },
      },
    },
  },
});

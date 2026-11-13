import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// LabBoard lives at https://afmn-lab.web.app/update (see ../firebase.json). The build goes straight into
// the website's public/ folder, so the existing deploy workflows publish it with everything else.
// Override with VITE_BASE=/ to serve it from the root of its own site.
const base = process.env.VITE_BASE || '/update/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: '../public/update',
    emptyOutDir: true,
    target: 'es2022', // top-level await in src/lib/firebase.js
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Libraries change rarely, so they get their own long-cached files; an app update then only
        // re-downloads LabBoard's own (small) code.
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
        },
      },
    },
  },
});

import { defineConfig, loadEnv } from 'vite';
import { siteMetadata } from './scripts/site-meta.ts';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({mode})=>({
  plugins: [react(), tailwindcss(), siteMetadata({...loadEnv(mode,process.cwd(),'SITE_'),...process.env})],
  envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/.local/**','**/docs/**','**/scripts/**','**/supabase/**'] } },
  // Open tabs may still need their previous version's lazy export modules.
  build: { chunkSizeWarningLimit: 650, emptyOutDir: false },
}));

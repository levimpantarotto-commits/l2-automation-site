import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// L2 Automation dashboard
// - Dev (npm run dev): base '/' (http://localhost:5173)
// - Build: base '/admin/', output em ../public/admin (servido pelo Express do l2-automation)
export default defineConfig(() => ({
  plugins: [react()],
  base: '/admin/',
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3004',
    },
  },
}))

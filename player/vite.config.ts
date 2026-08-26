import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env from player/ directory
  const env = loadEnv(mode, process.cwd(), '')

  // In dev, proxy /rest directly to Navidrome (bypass Express — faster, no 502s)
  // /api goes to the Express server (companion + Sonos)
  const hifiServer = env.VITE_HIFI_SERVER || 'http://localhost:4321'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // Proxy /rest through the hifi server (which dynamically proxies to Navidrome)
        // This allows runtime reconfiguration of the Navidrome URL via /api/proxy-config
        '/rest': {
          target: hifiServer,
          changeOrigin: true,
        },
        // /api (companion, Sonos) goes through the Express server
        '/api': {
          target: hifiServer,
          changeOrigin: true,
        },
      },
    },
  }
})

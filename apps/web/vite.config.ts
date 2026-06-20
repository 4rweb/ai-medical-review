import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Variáveis de ambiente ficam apenas no processo Node do Vite (lado servidor),
  // NÃO são embutidas no bundle do browser.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.API_TARGET || 'http://localhost:3001'
  const internalApiKey = env.INTERNAL_API_KEY || ''

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    },
    server: {
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? false : {},
      // Proxy BFF: o frontend chama /api/* (mesma origem) e o Vite encaminha
      // para o backend NestJS, injetando o segredo interno no lado do servidor.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          configure: proxy => {
            proxy.on('proxyReq', proxyReq => {
              if (internalApiKey) {
                proxyReq.setHeader('x-internal-api-key', internalApiKey)
              }
            })
          }
        }
      }
    }
  }
})

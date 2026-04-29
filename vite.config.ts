import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'
import type {
  ApplyImportRequest,
  ImportPreviewRequest,
  UpdateCatalogProductRequest,
} from './src/types/catalogSourceApi'
import {
  CatalogSourceError,
  applyImportToSource,
  getCatalogResponse,
  previewImportAgainstSource,
  updateProductInSource,
} from './dev/catalogSource'

const isSelfDestroyingPwa = process.env.PWA_SELF_DESTROYING === 'true'

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

async function readJsonBody<T>(request: IncomingMessage) {
  const bodyChunks: Buffer[] = []

  for await (const chunk of request) {
    bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (bodyChunks.length === 0) {
    return {} as T
  }

  return JSON.parse(Buffer.concat(bodyChunks).toString('utf8')) as T
}

function devCatalogApiPlugin(): Plugin {
  return {
    name: 'dev-catalog-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname

        if (!pathname.startsWith('/api/dev/catalog')) {
          next()
          return
        }

        try {
          if (request.method === 'GET' && pathname === '/api/dev/catalog') {
            sendJson(response, 200, await getCatalogResponse())
            return
          }

          if (request.method === 'POST' && pathname === '/api/dev/catalog/import-preview') {
            const payload = await readJsonBody<ImportPreviewRequest>(request)
            sendJson(response, 200, await previewImportAgainstSource(payload))
            return
          }

          if (request.method === 'POST' && pathname === '/api/dev/catalog/apply-import') {
            const payload = await readJsonBody<ApplyImportRequest>(request)
            sendJson(response, 200, await applyImportToSource(payload))
            return
          }

          if (request.method === 'PUT' && pathname === '/api/dev/catalog/product') {
            const payload = await readJsonBody<UpdateCatalogProductRequest>(request)
            sendJson(response, 200, await updateProductInSource(payload))
            return
          }

          sendJson(response, 404, { message: 'Catalog endpoint not found.' })
        } catch (error) {
          if (error instanceof CatalogSourceError) {
            sendJson(response, error.status, { message: error.message })
            return
          }

          if (error instanceof SyntaxError) {
            sendJson(response, 400, { message: 'The request body was not valid JSON.' })
            return
          }

          sendJson(response, 500, { message: 'The catalog source operation failed.' })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    devCatalogApiPlugin(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      selfDestroying: isSelfDestroyingPwa,
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'Minh Bros Product Catalog',
        short_name: 'Minh Bros',
        description:
          'Browse, filter, and import Minh Bros product catalog exports with offline access after the first online load.',
        theme_color: '#f3eadc',
        background_color: '#f3eadc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    css: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

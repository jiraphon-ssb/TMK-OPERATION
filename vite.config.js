import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { APP_VERSION } from './src/changelog.js'

// ปล่อยไฟล์ version.json (เวอร์ชันที่ deploy) — ให้เว็บที่เปิดค้างเช็คว่ามีบิลด์ใหม่ไหม
// dev: serve สด · build: เขียนลง dist
function versionFile() {
  const payload = () => JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() })
  return {
    name: 'tmk-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(payload())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: payload() })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
})

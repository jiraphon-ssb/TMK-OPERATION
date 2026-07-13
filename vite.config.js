import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { APP_VERSION } from './src/changelog.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // แยก vendor หนักที่ import แบบ eager ออกจาก index → แคชนิ่งข้ามการแก้โค้ดแอป + index เล็กลง
        // (xlsx/pdfjs เป็น dynamic import อยู่แล้ว → แยก chunk เอง ไม่ต้องแตะ)
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('victory-vendor') || /[\\/]d3-/.test(id)) return 'vendor-charts'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('scheduler') || /[\\/]react-dom[\\/]/.test(id) || /[\\/]react[\\/]/.test(id)) return 'vendor-react'
          if (id.includes('date-fns') || id.includes('react-day-picker')) return 'vendor-datefns'
          if (id.includes('lucide-react')) return 'vendor-lucide'
        },
      },
    },
  },
})

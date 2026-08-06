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
        // ใช้ advancedChunks (rolldown native) แทน manualChunks — คุมตำแหน่งโมดูล CJS (react/react-is/prop-types)
        // ได้แม่นกว่า · manualChunks shim ดัน react-core ไปรวมใน vendor-charts (chunk ผู้ require CJS ตัวแรก=recharts)
        // ทำให้ทุกหน้าต้องโหลด recharts 438KB ตั้งแต่แรกทั้งที่หน้าแรกไม่มีกราฟ
        // (xlsx/pdfjs เป็น dynamic import อยู่แล้ว → แยก chunk เอง ไม่ต้องแตะ)
        advancedChunks: {
          groups: [
            // React core ต้องมาก่อน vendor-charts เพื่อกันไม่ให้ recharts ดูด react-core เข้าไป
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-is|use-sync-external-store|object-assign|prop-types|clsx|tailwind-merge|class-variance-authority)[\\/]/ },
            { name: 'vendor-charts', test: /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|internmap|lodash|react-smooth|fast-equals|decimal\.js-light|reduce-css-calc|tiny-invariant|eventemitter3)[\\/]/ },
            { name: 'vendor-radix', test: /[\\/]node_modules[\\/]@radix-ui[\\/]/ },
            { name: 'vendor-supabase', test: /[\\/]node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor-datefns', test: /[\\/]node_modules[\\/](date-fns|react-day-picker)[\\/]/ },
            { name: 'vendor-lucide', test: /[\\/]node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
  },
})

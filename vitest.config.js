import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// default = node (pure logic tests · เร็วสุด · ไม่แตะ DOM/Supabase)
// component/DOM tests = ไฟล์ .test.jsx ที่ประกาศ `// @vitest-environment jsdom` ที่หัวไฟล์ (TEST-1 E2E env · RTL)
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }, // ให้ตรงกับ vite.config.js (component test ต้อง resolve '@/components/ui/*')
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'src/**/*.test.jsx'],
  },
});

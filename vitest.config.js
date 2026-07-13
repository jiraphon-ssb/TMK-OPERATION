import { defineConfig } from 'vitest/config';

// เทสเฉพาะ logic บริสุทธิ์ (ไม่แตะ DOM/Supabase) → environment node เร็วสุด
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 利用者が開く入り口は localhost:3000 の1つだけにする。
    // 詳細は docs/requirements.md の「技術スタック」を参照。
    port: 3000,
    strictPort: true,
    proxy: {
      // /api/* だけをバックエンド（Spring Boot）へ転送する。
      // 同一オリジンから来たように見えるため、CORS の設定が不要になる。
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})

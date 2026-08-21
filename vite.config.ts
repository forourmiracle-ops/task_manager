import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'

// Hosted build services may expose the SHA without including the .git folder.
let commitSha = (
  process.env.VITE_COMMIT_SHA
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || ''
).trim()
if (!commitSha) {
  try {
    commitSha = execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    // Update checking remains unavailable when no build metadata exists.
  }
}
commitSha = commitSha.slice(0, 7)

export default defineConfig({
  define: {
    'import.meta.env.VITE_COMMIT_SHA': JSON.stringify(commitSha),
  },
  plugins: [
    // Dev 模式放宽 CSP script-src 以允许 React Refresh 内联 preamble
    {
      name: 'csp-dev-relax',
      transformIndexHtml(html) {
        return html.replace(
          /script-src\s+'self'\s+https:\/\/tynhqwexdfdtobkmmzdo\.supabase\.co/,
          "script-src 'self' 'unsafe-inline' https://tynhqwexdfdtobkmmzdo.supabase.co",
        )
      },
      apply: 'serve',
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TaskFlow - 任务管理系统',
        short_name: 'TaskFlow',
        description: '多用户任务日志管理，支持跨设备同步',
        theme_color: '#1a56db',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'zh-CN',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        disableDevLogs: true,
        // 禁用 Service Worker 预缓存，确保每次打开页面获取最新版本
        globPatterns: [],
        // 不缓存任何运行时请求，始终从网络获取最新内容
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

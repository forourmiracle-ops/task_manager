/**
 * 用户设置同步 — 从 localStorage 恢复主题/字体等偏好。
 *
 * DeepSeek API Key 已移至服务端 Edge Function 代理，前端不再持有或读写密钥。
 * 设置页面中的偏好项（主题、字体、密度等）由 settings-slice 直接管理。
 */
export function useUserSettings() {
  // 此 hook 保留作为兼容入口，实际设置由 settings-slice 初始化时自动从 localStorage 恢复。
  // 如果未来需要从 Supabase 云端同步用户偏好，可在此处扩展。
}
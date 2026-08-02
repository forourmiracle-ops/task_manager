import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'

/**
 * API Key 仅保存在本地 localStorage 中，不会上传到云端服务器。
 * 每次切换设备时需要重新配置。
 */
export function useUserSettings() {
  const deepseekApiKey = useAppStore((s) => s.deepseekApiKey)
  const setDeepseekApiKey = useAppStore((s) => s.setDeepseekApiKey)
  const syncedRef = useRef(false)
  const lastLocalKeyRef = useRef(deepseekApiKey)

  // 从 localStorage 加载已保存的 API Key（仅首次加载）
  useEffect(() => {
    if (!syncedRef.current) {
      const localKey = localStorage.getItem('taskflow-deepseek-key') || ''
      if (localKey) {
        setDeepseekApiKey(localKey)
        lastLocalKeyRef.current = localKey
      }
      syncedRef.current = true
    }
  }, [setDeepseekApiKey])

  // 当 API Key 变化时，保存到 localStorage
  useEffect(() => {
    if (!syncedRef.current) return
    if (deepseekApiKey === lastLocalKeyRef.current) return

    lastLocalKeyRef.current = deepseekApiKey
    localStorage.setItem('taskflow-deepseek-key', deepseekApiKey)
  }, [deepseekApiKey])
}
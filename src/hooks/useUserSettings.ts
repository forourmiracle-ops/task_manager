import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { decrypt, encrypt } from '@/lib/secure-storage'

/**
 * API Key 安全存储：
 * - 使用 AES-GCM 加密后存入 sessionStorage，关闭标签页后密钥自动销毁
 * - 加密密钥仅存在于当前 JS 闭包中，不写入任何持久化存储
 * - 不会上传到云端服务器
 * - 每次切换设备或重新打开浏览器时需要重新配置
 */
export function useUserSettings() {
  const deepseekApiKey = useAppStore((s) => s.deepseekApiKey)
  const setDeepseekApiKey = useAppStore((s) => s.setDeepseekApiKey)
  const syncedRef = useRef(false)
  const lastLocalKeyRef = useRef(deepseekApiKey)

  // 从 sessionStorage 解密加载已保存的 API Key（仅首次加载）
  useEffect(() => {
    if (!syncedRef.current) {
      const encryptedKey = sessionStorage.getItem('taskflow-deepseek-key') || ''
      if (encryptedKey) {
        decrypt(encryptedKey).then((plainKey) => {
          if (plainKey) {
            setDeepseekApiKey(plainKey)
            lastLocalKeyRef.current = plainKey
          }
        })
      }
      syncedRef.current = true
    }
  }, [setDeepseekApiKey])

  // 当 API Key 变化时，加密保存到 sessionStorage
  useEffect(() => {
    if (!syncedRef.current) return
    if (deepseekApiKey === lastLocalKeyRef.current) return

    lastLocalKeyRef.current = deepseekApiKey
    encrypt(deepseekApiKey).then((encrypted) => {
      sessionStorage.setItem('taskflow-deepseek-key', encrypted)
    })
  }, [deepseekApiKey])
}
import { useState, useEffect, useCallback } from 'react'
import { checkForUpdates, clearUpdateCache } from '@/lib/update-checker'

export function AppUpdateBanner() {
  const [visible, setVisible] = useState(false)
  const [latestSha, setLatestSha] = useState('')
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)

  const doCheck = useCallback(async (silent = false) => {
    setChecking(true)
    try {
      const result = await checkForUpdates()
      if (result.hasUpdate) {
        setLatestSha(result.latestSha)
        setVisible(true)
      } else if (!silent) {
        setVisible(false)
      }
    } finally {
      setChecking(false)
    }
  }, [])

  // Auto-check on mount
  useEffect(() => {
    doCheck(true)
  }, [doCheck])

  const handleUpdate = useCallback(async () => {
    setUpdating(true)
    try {
      // 直接跳转至 Vercel 最新部署地址，确保使用最新版本
      window.location.href = 'https://task-manager-framiracle-ops.vercel.app/'
    } catch {
      // Fallback: just reload
      window.location.reload()
    }
  }, [])

  if (!visible) return null

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl shadow-lg max-w-md animate-in slide-in-from-top-2">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-600 flex-shrink-0">
        <path d="M8 2v8M8 12v.5" strokeWidth="2" />
        <circle cx="8" cy="8" r="6" />
      </svg>
      <p className="text-xs text-blue-800 flex-1">
        发现新版本可用{' '}
        {latestSha && <code className="text-[10px] bg-blue-100 px-1 rounded">{latestSha}</code>}
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleUpdate}
          disabled={updating}
          className="text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {updating ? '更新中...' : '立即更新'}
        </button>
        <button
          onClick={() => setVisible(false)}
          className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  )
}

export function useUpdateCheck() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ hasUpdate: boolean; message: string } | null>(null)

  const check = useCallback(async () => {
    setChecking(true)
    clearUpdateCache()
    try {
      const r = await checkForUpdates()
      setResult({
        hasUpdate: r.hasUpdate,
        message: r.hasUpdate
          ? `发现新版本，最新提交: ${r.latestSha}`
          : '已是最新版本',
      })
    } catch {
      setResult({ hasUpdate: false, message: '检查更新失败，请稍后重试' })
    } finally {
      setChecking(false)
    }
  }, [])

  return { checking, result, check, clearResult: () => setResult(null) }
}
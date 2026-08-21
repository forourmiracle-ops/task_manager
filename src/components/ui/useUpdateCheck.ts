import { useCallback, useState } from 'react'
import { checkForUpdates, clearUpdateCache } from '@/lib/update-checker'

export function useUpdateCheck() {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{
    hasUpdate: boolean
    message: string
    status: 'latest' | 'error' | 'unknown'
  } | null>(null)

  const check = useCallback(async () => {
    setChecking(true)
    clearUpdateCache()
    try {
      const r = await checkForUpdates()
      setResult({
        hasUpdate: r.hasUpdate,
        status: r.status,
        message: r.hasUpdate
          ? `发现新版本，最新提交 ${r.latestSha}`
          : r.unavailableReason === 'missing-build-info'
            ? '当前构建未包含版本信息，暂时无法比较更新'
            : r.unavailableReason === 'network'
              ? '网络异常，暂时无法检查更新'
              : '已是最新版本',
      })
    } catch {
      setResult({ hasUpdate: false, status: 'error', message: '检查更新失败，请稍后重试' })
    } finally {
      setChecking(false)
    }
  }, [])

  return { checking, result, check, clearResult: () => setResult(null) }
}

import { useSyncStatus, getSyncError } from '@/hooks/useTasks'
import { useState } from 'react'

export function SyncStatusBanner() {
  const status = useSyncStatus()
  const [expanded, setExpanded] = useState(false)

  if (status === 'online') return null

  const errorMsg = getSyncError()

  const config: Record<string, { bg: string; border: string; text: string; icon: string; label: string }> = {
    checking: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-700',
      icon: 'animate-spin',
      label: '正在连接云端...',
    },
    offline: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-600',
      icon: '',
      label: '离线模式 — 数据仅保存在本地',
    },
    error: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      icon: '',
      label: '云端同步异常 — 数据仅保存在本地',
    },
  }

  const c = config[status] || config.error

  return (
    <div className={`border-b ${c.bg} ${c.border} px-4 py-2`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status === 'checking' ? 'bg-blue-400 animate-pulse' : status === 'offline' ? 'bg-gray-400' : 'bg-amber-500'}`} />
        <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
        {errorMsg && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-amber-600 underline hover:text-amber-800 ml-auto"
          >
            {expanded ? '收起' : '详情'}
          </button>
        )}
        {status === 'error' && !errorMsg && (
          <span className="text-xs text-amber-600 ml-auto">
            请检查数据库是否正确部署了{' '}
            <code className="bg-amber-100 px-1 rounded text-[11px]">sync_database.sql</code>
          </span>
        )}
      </div>
      {expanded && errorMsg && (
        <div className="mt-1.5 text-[11px] text-amber-800 bg-amber-100/50 rounded-lg p-2 font-mono break-all">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
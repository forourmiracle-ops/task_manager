import type { RemoteUpdate } from './useRemoteUpdateConflict'

/**
 * Non-blocking banner for remote edit conflicts.
 * Shows when another device modifies a task while the current user is editing it.
 */
export function RemoteUpdateBanner({
  update,
  onViewLatest,
  onDismiss,
}: {
  update: RemoteUpdate | null
  onViewLatest: () => void
  onDismiss: () => void
}) {
  if (!update) return null

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl shadow-lg max-w-md animate-in slide-in-from-top-2">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-600 flex-shrink-0">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3M8 11v.5" strokeWidth="2" />
      </svg>
      <p className="text-xs text-amber-800 flex-1">
        检测到 "<span className="font-semibold">{update.taskTitle}</span>" 已被其他设备修改
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onViewLatest}
          className="text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg transition-colors"
        >
          查看最新
        </button>
        <button
          onClick={onDismiss}
          className="text-[11px] text-amber-500 hover:text-amber-700 transition-colors"
        >
          忽略
        </button>
      </div>
    </div>
  )
}

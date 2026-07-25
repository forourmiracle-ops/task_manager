import { useState, useRef, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface RemoteUpdate {
  taskId: string
  taskTitle: string
}

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

/**
 * Hook to manage remote update conflict detection.
 * Tracks when a task being edited receives a remote update, and exposes
 * a banner to display when the user finishes editing.
 */
export function useRemoteUpdateConflict() {
  const queryClient = useQueryClient()
  const [bannerUpdate, setBannerUpdate] = useState<RemoteUpdate | null>(null)
  const pendingRef = useRef<RemoteUpdate | null>(null)
  const editingTaskIdRef = useRef<string | null>(null)

  const setEditingTask = useCallback((taskId: string | null) => {
    const prevId = editingTaskIdRef.current
    editingTaskIdRef.current = taskId

    // When exiting editing, show banner if there's a pending update
    if (prevId && !taskId && pendingRef.current) {
      // If the pending update was for the task we just stopped editing
      if (pendingRef.current.taskId === prevId) {
        setBannerUpdate(pendingRef.current)
        pendingRef.current = null
      } else {
        // For other tasks, just invalidate silently
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        pendingRef.current = null
      }
    }
  }, [queryClient])

  const handleRemoteChange = useCallback((taskId: string, taskTitle: string) => {
    if (editingTaskIdRef.current === taskId) {
      // User is editing this task — buffer the update, don't interrupt
      pendingRef.current = { taskId, taskTitle }
    } else {
      // User is not editing this task — silently refresh
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }
  }, [queryClient])

  const handleViewLatest = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setBannerUpdate(null)
  }, [queryClient])

  const handleDismiss = useCallback(() => {
    setBannerUpdate(null)
  }, [])

  return {
    bannerUpdate,
    setEditingTask,
    handleRemoteChange,
    handleViewLatest,
    handleDismiss,
  }
}
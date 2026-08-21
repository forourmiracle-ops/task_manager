import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface RemoteUpdate {
  taskId: string
  taskTitle: string
  updatedAt?: string
}

export function useRemoteUpdateConflict() {
  const queryClient = useQueryClient()
  const [bannerUpdate, setBannerUpdate] = useState<RemoteUpdate | null>(null)
  const pendingRef = useRef<RemoteUpdate | null>(null)
  const editingTaskIdRef = useRef<string | null>(null)

  const setEditingTask = useCallback((taskId: string | null) => {
    const prevId = editingTaskIdRef.current
    editingTaskIdRef.current = taskId

    if (prevId && pendingRef.current?.taskId === prevId && prevId !== taskId) {
      setBannerUpdate(pendingRef.current)
      pendingRef.current = null
    } else if (prevId && !taskId && pendingRef.current) {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      pendingRef.current = null
    }
  }, [queryClient])

  const handleRemoteChange = useCallback((taskId: string, taskTitle: string, updatedAt?: string) => {
    if (editingTaskIdRef.current === taskId) {
      pendingRef.current = { taskId, taskTitle, updatedAt }
      return true
    } else {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      return false
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

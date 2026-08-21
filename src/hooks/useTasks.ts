import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/localStorage'
import { useAuth } from '@/hooks/useAuth'
import type { Task } from '@/types'
import {
  completeTasksForUser,
  createTaskForUser,
  deleteTaskForUser,
  fetchTasksForUser,
  updateTaskForUser,
  type UpdateTaskInput,
} from '@/lib/task-service'

const TASKS_KEY = 'tasks'
const MIGRATION_NEEDED_KEY = 'taskflow_migration_needed'
const SYNC_ERROR_KEY = 'taskflow_sync_error'

const useLocal = !isSupabaseConfigured()

export const tasksQueryKey = (userId?: string) => [TASKS_KEY, userId] as const

// Check if migration from local → cloud is still needed
export function isMigrationNeeded(): boolean {
  return localStorage.getItem(MIGRATION_NEEDED_KEY) === '1'
}

// Sync status for UI feedback
export type SyncStatus = 'checking' | 'online' | 'offline' | 'error'

let _syncStatusListeners: Array<(s: SyncStatus) => void> = []
let _currentSyncStatus: SyncStatus = 'checking'

export function getSyncStatus(): SyncStatus {
  return _currentSyncStatus
}

function setSyncStatus(status: SyncStatus, errorMsg?: string) {
  _currentSyncStatus = status
  if (errorMsg) {
    localStorage.setItem(SYNC_ERROR_KEY, errorMsg)
  } else {
    localStorage.removeItem(SYNC_ERROR_KEY)
  }
  _syncStatusListeners.forEach((fn) => fn(status))
}

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(_currentSyncStatus)
  useEffect(() => {
    _syncStatusListeners.push(setStatus)
    return () => {
      _syncStatusListeners = _syncStatusListeners.filter((fn) => fn !== setStatus)
    }
  }, [])
  return status
}

export function getSyncError(): string | null {
  return localStorage.getItem(SYNC_ERROR_KEY)
}

async function fetchTasks(userId: string | undefined): Promise<Task[]> {
  if (useLocal) {
    setSyncStatus('offline')
    return fetchTasksForUser(userId || 'local')
  }
  if (!userId) {
    setSyncStatus('checking')
    return []
  }
  try {
    const tasks = await fetchTasksForUser(userId)
    setSyncStatus('online')
    return tasks
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Task fetch failed:', msg)
    setSyncStatus('error', msg)
    throw err
  }
}







export function useTasks(userId?: string) {
  const { userId: authUserId, loading } = useAuth()
  const effectiveUserId = userId ?? authUserId

  return useQuery({
    queryKey: tasksQueryKey(effectiveUserId),
    queryFn: () => fetchTasks(effectiveUserId),
    staleTime: 0, // Always refetch to ensure real-time sync across devices
    gcTime: Infinity,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30_000, // Poll every 30s as fallback if Realtime fails
    retry: 2,
    enabled: (!loading && !!effectiveUserId) || useLocal,
  })
}

type TaskQuerySnapshot = Array<[readonly unknown[], Task[] | undefined]>

function snapshotTaskQueries(queryClient: ReturnType<typeof useQueryClient>): TaskQuerySnapshot {
  return queryClient.getQueriesData<Task[]>({ queryKey: [TASKS_KEY] })
}

function updateTaskQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (tasks: Task[]) => Task[],
): void {
  for (const [queryKey, tasks] of snapshotTaskQueries(queryClient)) {
    if (tasks) queryClient.setQueryData<Task[]>(queryKey, updater(tasks))
  }
}

export function useCreateTask() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: (task: Partial<Task>) => {
      if (!userId) throw new Error('未登录')
      return createTaskForUser(userId, task)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
    onError: (err) => {
      console.error('创建任务失败:', err)
    },
  })
}

export function useUpdateTask() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  const queryKey = tasksQueryKey(userId)

  return useMutation<Task, Error, UpdateTaskInput, {
    previous: Task[] | undefined
    queryKey: typeof queryKey
  }>({
    mutationFn: (updated) => {
      if (!userId) throw new Error('未登录')
      return updateTaskForUser(userId, updated)
    },
    onMutate: (updated) => {
      // Cancel the current user's fetch without waiting for the network
      // request. The title should change before Supabase responds.
      void queryClient.cancelQueries({ queryKey, exact: true })

      const previous = queryClient.getQueryData<Task[]>(queryKey)
      const optimisticChanges = { ...updated } as Partial<Task> & { expectedUpdatedAt?: string }
      delete optimisticChanges.id
      delete optimisticChanges.expectedUpdatedAt

      queryClient.setQueryData<Task[]>(queryKey, (tasks) =>
        tasks?.map((task) =>
          task.id === updated.id ? { ...task, ...optimisticChanges } : task,
        ),
      )

      return { previous, queryKey }
    },
    onSuccess: (savedTask, _variables, context) => {
      // Supabase already returned the authoritative row. Use it directly
      // instead of immediately fetching the whole task list again.
      queryClient.setQueryData<Task[]>(context?.queryKey ?? queryKey, (tasks) =>
        tasks?.map((task) =>
          task.id === savedTask.id ? { ...task, ...savedTask } : task,
        ),
      )
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData<Task[] | undefined>(
        context?.queryKey ?? queryKey,
        context?.previous,
      )
      console.error('更新任务失败:', _err)
    },
    onSettled: (_data, error, _variables, context) => {
      // A failed optimistic update needs a server refresh, especially for
      // conflict errors. Successful updates already contain the latest row.
      if (error) {
        void queryClient.invalidateQueries({
          queryKey: context?.queryKey ?? queryKey,
          exact: true,
        })
      }
    },
  })
}

type DeleteTaskInput = string | { id: string; expectedUpdatedAt?: string }

export function useDeleteTask() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: (input: DeleteTaskInput) => {
      if (!userId) throw new Error('未登录')
      const task = typeof input === 'string' ? { id: input } : input
      return deleteTaskForUser(userId, task.id, task.expectedUpdatedAt)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
    onError: (err) => {
      console.error('删除任务失败:', err)
    },
  })
}

export function useBatchCompleteTasks() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  return useMutation<void, Error, string[], { previous: TaskQuerySnapshot }>({
    mutationFn: (taskIds) => {
      if (!userId) throw new Error('未登录')
      return completeTasksForUser(userId, taskIds)
    },
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: [TASKS_KEY] })
      const previous = snapshotTaskQueries(queryClient)
      updateTaskQueries(queryClient, (tasks) =>
        tasks.map((task) =>
          taskIds.includes(task.id)
            ? { ...task, status: 'done' as const, progress_percent: 100 }
            : task,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      for (const [queryKey, tasks] of context?.previous || []) {
        queryClient.setQueryData<Task[] | undefined>(queryKey, tasks)
      }
      console.error('批量完成任务失败:', _err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
  })
}
// Supabase Realtime subscription for multi-device sync.
// Accepts an optional conflict handler for edit conflict detection.
export function useRealtimeSubscription(
  onRemoteChange?: (taskId: string, taskTitle: string, updatedAt?: string) => boolean,
) {
  const queryClient = useQueryClient()
  const useLocal = !isSupabaseConfigured()
  const { userId } = useAuth()

  useEffect(() => {
    if (useLocal || !userId) return

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        (payload) => {
          const changed = payload.new as { id: string; title: string; updated_at?: string } | null
          const deferRefetch = Boolean(
            onRemoteChange
            && changed
            && payload.eventType === 'UPDATE'
            && onRemoteChange(changed.id, changed.title, changed.updated_at),
          )
          if (deferRefetch) return
          // Force immediate refetch for changes that do not belong to the
          // task currently being edited.
          queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
          queryClient.refetchQueries({ queryKey: [TASKS_KEY] })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] Subscribed to tasks changes')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] Channel error, will rely on polling fallback')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, useLocal, userId, onRemoteChange])
}

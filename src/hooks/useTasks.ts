import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import { useAuth } from '@/hooks/useAuth'
import type { Task } from '@/types'

const TASKS_KEY = 'tasks'
const MIGRATION_NEEDED_KEY = 'taskflow_migration_needed'
const SYNC_ERROR_KEY = 'taskflow_sync_error'

const useLocal = !isSupabaseConfigured()

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
    return localDB.fetchTasks(userId || 'local')
  }
  if (!userId) {
    setSyncStatus('checking')
    return []
  }
  try {
    // 确保携带当前用户 JWT，避免 session 滞后导致 401
    await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
    if (error) throw error
    const tasks = (data as Task[]) || []

    // If Supabase has no tasks, always fall back to localDB so the user
    // can see their data. LocalTaskMigration handles the migration prompt.
    if (tasks.length === 0) {
      try {
        const localTasks = await localDB.fetchTasks(userId)
        if (localTasks.length > 0) {
          localStorage.setItem(MIGRATION_NEEDED_KEY, '1')
          setSyncStatus('online')
          return localTasks
        }
      } catch {
        // localDB unavailable — ignore
      }
      setSyncStatus('online')
    } else {
      localStorage.removeItem(MIGRATION_NEEDED_KEY)
      setSyncStatus('online')
    }

    return tasks
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Supabase fetch failed, using local storage:', msg)
    setSyncStatus('error', msg)
    const localTasks = await localDB.fetchTasks(userId || 'local')
    // 本地无数据时抛出错误，让 React Query 保留 previousData，避免空数据覆盖真实数据
    if (localTasks.length === 0) throw err
    return localTasks
  }
}

async function createTask(task: Partial<Task>): Promise<Task> {
  if (useLocal) return localDB.createTask('local', task)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: task.title || '新任务',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        start_date: task.start_date || null,
        due_date: task.due_date || null,
        progress_percent: task.progress_percent || 0,
        estimated_hours: task.estimated_hours || null,
        parent_id: task.parent_id || null,
        cycle_type: task.cycle_type || 'none',
        cycle_config: task.cycle_config || null,
        depends_on: task.depends_on || [],
        tags: task.tags || [],
        sort_order: task.sort_order || 0,
        user_id: user.id,
      })
      .select()
      .single()
    if (error) throw error
    setSyncStatus('online')
    return data as Task
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Supabase create failed, using local storage:', msg)
    setSyncStatus('error', msg)
    return localDB.createTask(user.id, task)
  }
}

async function updateTask(task: Partial<Task> & { id: string }): Promise<Task> {
  if (useLocal) return localDB.updateTask('local', task)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...task,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (error) throw error
    setSyncStatus('online')
    return data as Task
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Supabase update failed, using local storage:', msg)
    setSyncStatus('error', msg)
    return localDB.updateTask(user.id, task)
  }
}

async function deleteTask(id: string): Promise<void> {
  if (useLocal) return localDB.deleteTask('local', id)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  try {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (error) throw error
    setSyncStatus('online')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Supabase delete failed, using local storage:', msg)
    setSyncStatus('error', msg)
    return localDB.deleteTask(user.id, id)
  }
}

export function useTasks(userId?: string) {
  const { userId: authUserId, loading } = useAuth()
  const effectiveUserId = userId ?? authUserId

  return useQuery({
    queryKey: [TASKS_KEY, effectiveUserId],
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

export function useCreateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTask,
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
  return useMutation<Task, Error, Partial<Task> & { id: string }, { previous: Task[] | undefined }>({
    mutationFn: updateTask,
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: [TASKS_KEY] })
      const previous = queryClient.getQueryData<Task[]>([TASKS_KEY])
      if (previous) {
        queryClient.setQueryData<Task[]>([TASKS_KEY], (old) =>
          old?.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)) ?? []
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([TASKS_KEY], context.previous)
      }
      console.error('更新任务失败:', _err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
    onError: (err) => {
      console.error('删除任务失败:', err)
    },
  })
}

async function batchCompleteTasks(taskIds: string[]): Promise<void> {
  if (useLocal) {
    await localDB.batchUpdateTasks('local', taskIds.map((id) => ({ id, status: 'done' as const })))
    return
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')
  try {
    const { error } = await supabase.rpc('batch_complete_tasks', { p_task_ids: taskIds })
    if (error) throw error
    setSyncStatus('online')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('Supabase batch complete failed, using local storage:', msg)
    setSyncStatus('error', msg)
    await localDB.batchUpdateTasks(user.id, taskIds.map((id) => ({ id, status: 'done' as const })))
  }
}

export function useBatchCompleteTasks() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string[], { previous: Task[] | undefined }>({
    mutationFn: batchCompleteTasks,
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey: [TASKS_KEY] })
      const previous = queryClient.getQueryData<Task[]>([TASKS_KEY])
      if (previous) {
        queryClient.setQueryData<Task[]>([TASKS_KEY], (old) =>
          old?.map((t) =>
            taskIds.includes(t.id) ? { ...t, status: 'done' as const, progress_percent: 100 } : t
          ) ?? []
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([TASKS_KEY], context.previous)
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
  onRemoteChange?: (taskId: string, taskTitle: string) => void,
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
          const changed = payload.new as { id: string; title: string } | null
          if (onRemoteChange && changed && payload.eventType === 'UPDATE') {
            onRemoteChange(changed.id, changed.title)
          }
          // Force immediate refetch for all change types
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
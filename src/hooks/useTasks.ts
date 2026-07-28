import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import { useAuth } from '@/hooks/useAuth'
import type { Task } from '@/types'

const TASKS_KEY = 'tasks'
const useLocal = !isSupabaseConfigured()

async function fetchTasks(userId: string | undefined): Promise<Task[]> {
  if (useLocal) return localDB.fetchTasks()
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
    if (error) throw error
    const tasks = (data as Task[]) || []

    // Auto-claim orphaned tasks (user_id IS NULL) if current user has no tasks yet
    if (tasks.length === 0) {
      try {
        await supabase.rpc('fn_claim_orphaned_tasks')
        const { data: claimed } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', userId)
          .order('sort_order')
        return (claimed as Task[]) || []
      } catch {
        // fn_claim_orphaned_tasks not deployed yet — ignore
      }
    }

    return tasks
  } catch (err) {
    console.warn('Supabase fetch failed, using local storage:', err)
    return localDB.fetchTasks()
  }
}

async function createTask(task: Partial<Task>): Promise<Task> {
  if (useLocal) return localDB.createTask(task)
  try {
    const { data: { user } } = await supabase.auth.getUser()
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
        user_id: user!.id,
      })
      .select()
      .single()
    if (error) throw error
    return data as Task
  } catch (err) {
    console.warn('Supabase create failed, using local storage:', err)
    return localDB.createTask(task)
  }
}

async function updateTask(task: Partial<Task> & { id: string }): Promise<Task> {
  if (useLocal) return localDB.updateTask(task)
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...task,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
      .select()
      .single()
    if (error) throw error
    return data as Task
  } catch (err) {
    console.warn('Supabase update failed, using local storage:', err)
    return localDB.updateTask(task)
  }
}

async function deleteTask(id: string): Promise<void> {
  if (useLocal) return localDB.deleteTask(id)
  try {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
  } catch (err) {
    console.warn('Supabase delete failed, using local storage:', err)
    return localDB.deleteTask(id)
  }
}

export function useTasks(userId?: string) {
  const { userId: authUserId } = useAuth()
  const effectiveUserId = userId ?? authUserId

  return useQuery({
    queryKey: [TASKS_KEY, effectiveUserId],
    queryFn: () => fetchTasks(effectiveUserId),
    staleTime: 60_000,
    gcTime: Infinity,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!effectiveUserId || useLocal,
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
  return useMutation({
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
    await localDB.batchUpdateTasks(taskIds.map((id) => ({ id, status: 'done' as const })))
    return
  }
  try {
    const { error } = await supabase.rpc('batch_complete_tasks', { p_task_ids: taskIds })
    if (error) throw error
  } catch (err) {
    console.warn('Supabase batch complete failed, using local storage:', err)
    await localDB.batchUpdateTasks(taskIds.map((id) => ({ id, status: 'done' as const })))
  }
}

export function useBatchCompleteTasks() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string[]>({
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

// Supabase Realtime subscription for multi-user collaboration.
// Accepts an optional conflict handler for edit conflict detection.
export function useRealtimeSubscription(
  onRemoteChange?: (taskId: string, taskTitle: string) => void,
) {
  const queryClient = useQueryClient()
  const useLocal = !isSupabaseConfigured()

  useEffect(() => {
    if (useLocal) return

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const changed = payload.new as { id: string; title: string } | null
          if (onRemoteChange && changed) {
            onRemoteChange(changed.id, changed.title)
          } else {
            queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, useLocal, onRemoteChange])
}
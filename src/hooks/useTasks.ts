import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import type { Task } from '@/types'

const TASKS_KEY = 'tasks'
const useLocal = !isSupabaseConfigured()

async function fetchTasks(): Promise<Task[]> {
  if (useLocal) return localDB.fetchTasks()
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return (data as Task[]) || []
  } catch (err) {
    console.warn('Supabase fetch failed, using local storage:', err)
    return localDB.fetchTasks()
  }
}

async function createTask(task: Partial<Task>): Promise<Task> {
  if (useLocal) return localDB.createTask(task)
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

export function useTasks() {
  return useQuery({
    queryKey: [TASKS_KEY],
    queryFn: fetchTasks,
    staleTime: 30_000, // 30s cache before refetch
    refetchOnWindowFocus: false,
    retry: 1,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
    onError: (err) => {
      console.error('更新任务失败:', err)
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
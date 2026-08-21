import type { Task } from '@/types'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import { supabase } from '@/lib/supabase'
import {
  applyPendingTaskOperations,
  enqueueTaskOperation,
  getPendingTaskOperations,
  removePendingTaskOperation,
  updatePendingTaskOperation,
  type PendingTaskOperation,
} from '@/lib/task-outbox'

export type UpdateTaskInput = Partial<Task> & {
  id: string
  expectedUpdatedAt?: string
}

export class TaskConflictError extends Error {
  readonly taskId: string
  readonly expectedUpdatedAt?: string

  constructor(taskId: string, expectedUpdatedAt?: string) {
    super('任务已被其他设备修改，请先查看最新版本。')
    this.name = 'TaskConflictError'
    this.taskId = taskId
    this.expectedUpdatedAt = expectedUpdatedAt
  }
}

const TASK_FIELDS = [
  'title', 'description', 'status', 'priority', 'start_date', 'due_date',
  'progress_percent', 'estimated_hours', 'actual_hours', 'cycle_type',
  'cycle_config', 'sprint_id', 'depends_on', 'tags', 'sort_order', 'parent_id',
] as const

function taskRow(task: Partial<Task>, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { user_id: userId }
  for (const field of TASK_FIELDS) {
    if (task[field] !== undefined) row[field] = task[field]
  }
  return row
}

function isConflictError(error: unknown): boolean {
  return error instanceof TaskConflictError
}

async function flushOperation(userId: string, operation: PendingTaskOperation): Promise<void> {
  if (operation.type === 'create') {
    const { error } = await supabase
      .from('tasks')
      .insert({ id: operation.taskId, ...taskRow(operation.payload || {}, userId) })
    if (error) throw error
    return
  }

  if (operation.type === 'update') {
    let query = supabase
      .from('tasks')
      .update({ ...taskRow(operation.payload || {}, userId), updated_at: new Date().toISOString() })
      .eq('id', operation.taskId)
      .eq('user_id', userId)

    if (operation.expectedUpdatedAt) query = query.eq('updated_at', operation.expectedUpdatedAt)

    const { data, error } = await query.select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new TaskConflictError(operation.taskId, operation.expectedUpdatedAt)
    return
  }

  let query = supabase
    .from('tasks')
    .delete()
    .eq('id', operation.taskId)
    .eq('user_id', userId)

  if (operation.expectedUpdatedAt) query = query.eq('updated_at', operation.expectedUpdatedAt)

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw error
  if (operation.expectedUpdatedAt && !data) {
    throw new TaskConflictError(operation.taskId, operation.expectedUpdatedAt)
  }
}

export async function flushTaskOutbox(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return

  const operations = getPendingTaskOperations(userId)
  for (const operation of operations) {
    try {
      await flushOperation(userId, operation)
      removePendingTaskOperation(userId, operation.id)
    } catch (error) {
      updatePendingTaskOperation(userId, operation.id, {
        attempts: operation.attempts + 1,
        lastError: error instanceof Error ? error.message : String(error),
      })
      // Preserve queue order: later operations may depend on this one.
      throw error
    }
  }
}

export async function fetchTasksForUser(userId: string): Promise<Task[]> {
  if (!isSupabaseConfigured()) return localDB.fetchTasks(userId)

  try {
    await flushTaskOutbox(userId)
  } catch (error) {
    console.warn('Task outbox flush failed:', error)
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
    if (error) throw error

    const remoteTasks = (data as Task[]) || []
    const pending = getPendingTaskOperations(userId)
    if (remoteTasks.length === 0) {
      const localTasks = await localDB.fetchTasks(userId)
      if (localTasks.length > 0) {
        localStorage.setItem('taskflow_migration_needed', '1')
        return localTasks
      }
      localStorage.removeItem('taskflow_migration_needed')
      return applyPendingTaskOperations(remoteTasks, pending)
    }
    localStorage.removeItem('taskflow_migration_needed')
    return applyPendingTaskOperations(remoteTasks, pending)
  } catch (error) {
    const localTasks = await localDB.fetchTasks(userId)
    if (localTasks.length === 0) throw error
    return localTasks
  }
}

export async function getTaskForUser(userId: string, taskId: string): Promise<Task | null> {
  const tasks = await fetchTasksForUser(userId)
  return tasks.find((task) => task.id === taskId) || null
}

export async function createTaskForUser(userId: string, task: Partial<Task>): Promise<Task> {
  if (!isSupabaseConfigured()) return localDB.createTask(userId, task)

  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert(taskRow(task, userId))
      .select()
      .single()
    if (error) throw error
    return data as Task
  } catch {
    const localTask = await localDB.createTask(userId, task)
    enqueueTaskOperation({
      userId,
      type: 'create',
      taskId: localTask.id,
      payload: localTask,
    })
    return localTask
  }
}

export async function updateTaskForUser(userId: string, input: UpdateTaskInput): Promise<Task> {
  const { expectedUpdatedAt, id, ...changes } = input
  if (!isSupabaseConfigured()) return localDB.updateTask(userId, { id, ...changes })

  let query = supabase
    .from('tasks')
    .update({ ...taskRow(changes, userId), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  try {
    const { data, error } = await query.select().maybeSingle()
    if (error) throw error
    if (!data) throw new TaskConflictError(id, expectedUpdatedAt)
    return data as Task
  } catch (error) {
    if (isConflictError(error)) throw error
    const localTask = await localDB.updateTask(userId, { id, ...changes })
    enqueueTaskOperation({
      userId,
      type: 'update',
      taskId: id,
      payload: changes,
      expectedUpdatedAt,
    })
    return localTask
  }
}

export async function deleteTaskForUser(
  userId: string,
  taskId: string,
  expectedUpdatedAt?: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return localDB.deleteTask(userId, taskId)

  let query = supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  try {
    const { data, error } = await query.select('id').maybeSingle()
    if (error) throw error
    if (expectedUpdatedAt && !data) throw new TaskConflictError(taskId, expectedUpdatedAt)
  } catch (error) {
    if (isConflictError(error)) throw error
    await localDB.deleteTask(userId, taskId)
    enqueueTaskOperation({ userId, type: 'delete', taskId, expectedUpdatedAt })
  }
}

export async function completeTasksForUser(userId: string, taskIds: string[]): Promise<void> {
  if (!isSupabaseConfigured()) {
    await localDB.batchUpdateTasks(
      userId,
      taskIds.map((id) => ({ id, status: 'done' as const, progress_percent: 100 })),
    )
    return
  }

  try {
    const { error } = await supabase.rpc('batch_complete_tasks', { p_task_ids: taskIds })
    if (error) throw error
  } catch {
    const localTasks = await localDB.fetchTasks(userId)
    await localDB.batchUpdateTasks(
      userId,
      taskIds.map((id) => ({ id, status: 'done' as const, progress_percent: 100 })),
    )
    for (const id of taskIds) {
      const current = localTasks.find((task) => task.id === id)
      enqueueTaskOperation({
        userId,
        type: 'update',
        taskId: id,
        payload: { status: 'done', progress_percent: 100 },
        expectedUpdatedAt: current?.updated_at,
      })
    }
  }
}

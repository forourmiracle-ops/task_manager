import type { Task } from '@/types'
import { indexedDB } from '@/lib/indexedDB'
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY } from '@/lib/supabase'

// Check if Supabase is configured (env vars OR hardcoded defaults)
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY
  return !!(url && key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key')
}

// Primary fallback: IndexedDB (async, large capacity, per-user)
// Secondary fallback: localStorage (sync, limited capacity, per-user)
export const localDB = {
  async fetchTasks(userId: string): Promise<Task[]> {
    try {
      return await indexedDB.fetchTasks(userId)
    } catch (err) {
      console.warn('IndexedDB fetch failed, using localStorage:', err)
      return legacyLocalStorage.fetchTasks(userId)
    }
  },

  async createTask(userId: string, task: Partial<Task>): Promise<Task> {
    try {
      return await indexedDB.createTask(userId, task)
    } catch (err) {
      console.warn('IndexedDB create failed, using localStorage:', err)
      return legacyLocalStorage.createTask(userId, task)
    }
  },

  async updateTask(userId: string, task: Partial<Task> & { id: string }): Promise<Task> {
    try {
      return await indexedDB.updateTask(userId, task)
    } catch (err) {
      console.warn('IndexedDB update failed, using localStorage:', err)
      return legacyLocalStorage.updateTask(userId, task)
    }
  },

  async batchUpdateTasks(userId: string, updates: Array<Partial<Task> & { id: string }>): Promise<Task[]> {
    try {
      return await indexedDB.batchUpdateTasks(userId, updates)
    } catch (err) {
      console.warn('IndexedDB batch update failed, using localStorage:', err)
      return legacyLocalStorage.batchUpdateTasks(userId, updates)
    }
  },

  async deleteTask(userId: string, id: string): Promise<void> {
    try {
      return await indexedDB.deleteTask(userId, id)
    } catch (err) {
      console.warn('IndexedDB delete failed, using localStorage:', err)
      return legacyLocalStorage.deleteTask(userId, id)
    }
  },
}

// Legacy localStorage fallback (kept as last resort, per-user)
function storageKey(userId: string): string {
  return `taskflow_${userId}_tasks`
}

function generateId(): string {
  return crypto.randomUUID()
}

function loadTasks(userId: string): Task[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTasks(userId: string, tasks: Task[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(tasks))
  } catch (err) {
    console.error('localStorage write failed (QuotaExceeded?):', err)
  }
}

const legacyLocalStorage = {
  async fetchTasks(userId: string): Promise<Task[]> {
    return loadTasks(userId).sort((a, b) => a.sort_order - b.sort_order)
  },

  async createTask(userId: string, task: Partial<Task>): Promise<Task> {
    const tasks = loadTasks(userId)
    const now = new Date().toISOString()
    const newTask: Task = {
      id: generateId(),
      parent_id: task.parent_id || null,
      title: task.title || '新任务',
      description: task.description || '',
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      start_date: task.start_date || null,
      due_date: task.due_date || null,
      progress_percent: task.progress_percent || 0,
      estimated_hours: task.estimated_hours || null,
      actual_hours: task.actual_hours || null,
      cycle_type: task.cycle_type || 'none',
      cycle_config: task.cycle_config || null,
      sprint_id: task.sprint_id || null,
      depends_on: task.depends_on || [],
      tags: task.tags || [],
      sort_order: task.sort_order ?? tasks.length,
      user_id: task.user_id || userId,
      created_at: now,
      updated_at: now,
    }
    tasks.push(newTask)
    saveTasks(userId, tasks)
    return newTask
  },

  async updateTask(userId: string, task: Partial<Task> & { id: string }): Promise<Task> {
    const tasks = loadTasks(userId)
    const index = tasks.findIndex((t) => t.id === task.id)
    if (index === -1) throw new Error('Task not found')
    tasks[index] = { ...tasks[index], ...task, updated_at: new Date().toISOString() }
    saveTasks(userId, tasks)
    return tasks[index]
  },

  async batchUpdateTasks(userId: string, updates: Array<Partial<Task> & { id: string }>): Promise<Task[]> {
    const tasks = loadTasks(userId)
    const results: Task[] = []
    const updateMap = new Map(updates.map((u) => [u.id, u]))
    for (let i = 0; i < tasks.length; i++) {
      const update = updateMap.get(tasks[i].id)
      if (update) {
        tasks[i] = { ...tasks[i], ...update, updated_at: new Date().toISOString() }
        results.push(tasks[i])
      }
    }
    saveTasks(userId, tasks)
    return results
  },

  async deleteTask(userId: string, id: string): Promise<void> {
    let tasks = loadTasks(userId)
    const idsToDelete = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const t of tasks) {
        if (t.parent_id && idsToDelete.has(t.parent_id) && !idsToDelete.has(t.id)) {
          idsToDelete.add(t.id)
          changed = true
        }
      }
    }
    tasks = tasks.filter((t) => !idsToDelete.has(t.id))
    saveTasks(userId, tasks)
  },
}

/** 清理指定用户的所有本地存储数据（保留 IndexedDB，分区隔离已足够） */
export async function clearUserLocalData(userId: string): Promise<void> {
  // 清理 localStorage（按用户分区 key 和遗留全局 key）
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`taskflow_${userId}_`)) {
      keysToRemove.push(key)
    }
  }
  // 也清理旧版全局 key（无 userId 前缀的遗留数据）
  const legacyKeys = [
    'taskflow_tasks',
    'taskflow_comments',
    'taskflow-ai-storage',
    'taskflow_migration_needed',
    'taskflow_local_migration_done',
    'taskflow_sync_error',
    'taskflow-update-last-check',
  ]
  for (const key of legacyKeys) {
    localStorage.removeItem(key)
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }

  // 清理 sessionStorage 中的 API Key
  sessionStorage.removeItem('taskflow-deepseek-key')
}
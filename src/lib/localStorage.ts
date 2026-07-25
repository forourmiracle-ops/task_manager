import type { Task } from '@/types'
import { indexedDB } from '@/lib/indexedDB'

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return !!(url && key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key')
}

// Primary fallback: IndexedDB (async, large capacity)
// Secondary fallback: localStorage (sync, limited capacity)
export const localDB = {
  async fetchTasks(): Promise<Task[]> {
    try {
      return await indexedDB.fetchTasks()
    } catch (err) {
      console.warn('IndexedDB fetch failed, using localStorage:', err)
      return legacyLocalStorage.fetchTasks()
    }
  },

  async createTask(task: Partial<Task>): Promise<Task> {
    try {
      return await indexedDB.createTask(task)
    } catch (err) {
      console.warn('IndexedDB create failed, using localStorage:', err)
      return legacyLocalStorage.createTask(task)
    }
  },

  async updateTask(task: Partial<Task> & { id: string }): Promise<Task> {
    try {
      return await indexedDB.updateTask(task)
    } catch (err) {
      console.warn('IndexedDB update failed, using localStorage:', err)
      return legacyLocalStorage.updateTask(task)
    }
  },

  async batchUpdateTasks(updates: Array<Partial<Task> & { id: string }>): Promise<Task[]> {
    try {
      return await indexedDB.batchUpdateTasks(updates)
    } catch (err) {
      console.warn('IndexedDB batch update failed, using localStorage:', err)
      return legacyLocalStorage.batchUpdateTasks(updates)
    }
  },

  async deleteTask(id: string): Promise<void> {
    try {
      return await indexedDB.deleteTask(id)
    } catch (err) {
      console.warn('IndexedDB delete failed, using localStorage:', err)
      return legacyLocalStorage.deleteTask(id)
    }
  },
}

// Legacy localStorage fallback (kept as last resort)
const STORAGE_KEY = 'taskflow_tasks'

function generateId(): string {
  return crypto.randomUUID()
}

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch (err) {
    console.error('localStorage write failed (QuotaExceeded?):', err)
  }
}

const legacyLocalStorage = {
  async fetchTasks(): Promise<Task[]> {
    return loadTasks().sort((a, b) => a.sort_order - b.sort_order)
  },

  async createTask(task: Partial<Task>): Promise<Task> {
    const tasks = loadTasks()
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
      created_at: now,
      updated_at: now,
    }
    tasks.push(newTask)
    saveTasks(tasks)
    return newTask
  },

  async updateTask(task: Partial<Task> & { id: string }): Promise<Task> {
    const tasks = loadTasks()
    const index = tasks.findIndex((t) => t.id === task.id)
    if (index === -1) throw new Error('Task not found')
    tasks[index] = { ...tasks[index], ...task, updated_at: new Date().toISOString() }
    saveTasks(tasks)
    return tasks[index]
  },

  async batchUpdateTasks(updates: Array<Partial<Task> & { id: string }>): Promise<Task[]> {
    const tasks = loadTasks()
    const results: Task[] = []
    const updateMap = new Map(updates.map((u) => [u.id, u]))
    for (let i = 0; i < tasks.length; i++) {
      const update = updateMap.get(tasks[i].id)
      if (update) {
        tasks[i] = { ...tasks[i], ...update, updated_at: new Date().toISOString() }
        results.push(tasks[i])
      }
    }
    saveTasks(tasks)
    return results
  },

  async deleteTask(id: string): Promise<void> {
    let tasks = loadTasks()
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
    saveTasks(tasks)
  },
}
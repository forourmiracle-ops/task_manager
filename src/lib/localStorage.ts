import type { Task } from '@/types'

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

export const localDB = {
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

  async deleteTask(id: string): Promise<void> {
    let tasks = loadTasks()
    // Also delete children recursively
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

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return !!(url && key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key')
}
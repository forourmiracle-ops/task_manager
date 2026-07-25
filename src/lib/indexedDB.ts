import { openDB, type IDBPDatabase } from 'idb'
import type { Task } from '@/types'

const DB_NAME = 'taskflow'
const DB_VERSION = 1
const STORE_NAME = 'tasks'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('parent_id', 'parent_id')
          store.createIndex('sort_order', 'sort_order')
          store.createIndex('status', 'status')
        }
      },
    })
  }
  return dbPromise
}

function generateId(): string {
  return crypto.randomUUID()
}

export const indexedDB = {
  async fetchTasks(): Promise<Task[]> {
    const db = await getDB()
    const tasks = await db.getAll(STORE_NAME)
    return tasks.sort((a, b) => a.sort_order - b.sort_order)
  },

  async createTask(task: Partial<Task>): Promise<Task> {
    const db = await getDB()
    const now = new Date().toISOString()
    const existing = await db.getAll(STORE_NAME)
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
      sort_order: task.sort_order ?? existing.length,
      created_at: now,
      updated_at: now,
    }
    await db.add(STORE_NAME, newTask)
    return newTask
  },

  async updateTask(task: Partial<Task> & { id: string }): Promise<Task> {
    const db = await getDB()
    const existing = await db.get(STORE_NAME, task.id)
    if (!existing) throw new Error('Task not found')
    const updated = { ...existing, ...task, updated_at: new Date().toISOString() }
    await db.put(STORE_NAME, updated)
    return updated
  },

  async batchUpdateTasks(updates: Array<Partial<Task> & { id: string }>): Promise<Task[]> {
    const db = await getDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const results: Task[] = []
    for (const update of updates) {
      const existing = await tx.store.get(update.id)
      if (!existing) throw new Error(`Task ${update.id} not found`)
      const updated = { ...existing, ...update, updated_at: new Date().toISOString() }
      await tx.store.put(updated)
      results.push(updated)
    }
    await tx.done
    return results
  },

  async deleteTask(id: string): Promise<void> {
    const db = await getDB()
    const allTasks = await db.getAll(STORE_NAME)
    const idsToDelete = new Set<string>([id])
    let changed = true
    while (changed) {
      changed = false
      for (const t of allTasks) {
        if (t.parent_id && idsToDelete.has(t.parent_id) && !idsToDelete.has(t.id)) {
          idsToDelete.add(t.id)
          changed = true
        }
      }
    }
    const tx = db.transaction(STORE_NAME, 'readwrite')
    for (const deleteId of idsToDelete) {
      await tx.store.delete(deleteId)
    }
    await tx.done
  },
}
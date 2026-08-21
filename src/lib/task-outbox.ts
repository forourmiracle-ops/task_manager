import type { Task } from '@/types'

export type TaskOperationType = 'create' | 'update' | 'delete'

export interface PendingTaskOperation {
  id: string
  userId: string
  type: TaskOperationType
  taskId: string
  payload?: Partial<Task>
  expectedUpdatedAt?: string
  createdAt: string
  attempts: number
  lastError?: string
}

function storageKey(userId: string): string {
  return `taskflow_${userId}_pending_task_operations`
}

function readOperations(userId: string): PendingTaskOperation[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingTaskOperation[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeOperations(userId: string, operations: PendingTaskOperation[]): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(operations))
}

export function getPendingTaskOperations(userId: string): PendingTaskOperation[] {
  return readOperations(userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function enqueueTaskOperation(
  operation: Omit<PendingTaskOperation, 'id' | 'createdAt' | 'attempts'>,
): PendingTaskOperation {
  const next: PendingTaskOperation = {
    ...operation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  }
  const operations = readOperations(operation.userId)

  // Keep the queue compact when repeated updates target the same task. A
  // create followed by updates must remain ordered, so only merge updates.
  if (next.type === 'update') {
    const previous = [...operations].reverse().find(
      (item) => item.type === 'update' && item.taskId === next.taskId,
    )
    if (previous) {
      previous.payload = { ...previous.payload, ...next.payload }
      previous.expectedUpdatedAt = previous.expectedUpdatedAt || next.expectedUpdatedAt
      previous.lastError = undefined
      writeOperations(operation.userId, operations)
      return previous
    }
  }

  operations.push(next)
  writeOperations(operation.userId, operations)
  return next
}

export function updatePendingTaskOperation(
  userId: string,
  operationId: string,
  patch: Partial<Pick<PendingTaskOperation, 'attempts' | 'lastError'>>,
): void {
  const operations = readOperations(userId)
  const operation = operations.find((item) => item.id === operationId)
  if (!operation) return
  Object.assign(operation, patch)
  writeOperations(userId, operations)
}

export function removePendingTaskOperation(userId: string, operationId: string): void {
  writeOperations(
    userId,
    readOperations(userId).filter((operation) => operation.id !== operationId),
  )
}

export function clearPendingTaskOperations(userId: string): void {
  localStorage.removeItem(storageKey(userId))
}

export function applyPendingTaskOperations(
  remoteTasks: Task[],
  operations: PendingTaskOperation[],
): Task[] {
  const tasks = new Map(remoteTasks.map((task) => [task.id, task]))

  for (const operation of operations) {
    if (operation.type === 'delete') {
      tasks.delete(operation.taskId)
      continue
    }

    if (!operation.payload) continue
    const current = tasks.get(operation.taskId)
    if (operation.type === 'create' || current) {
      tasks.set(operation.taskId, { ...current, ...operation.payload } as Task)
    }
  }

  return Array.from(tasks.values()).sort((a, b) => a.sort_order - b.sort_order)
}

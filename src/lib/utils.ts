import type { Task } from '@/types'

export function cn(...inputs: (string | boolean | undefined)[]) {
  return inputs.filter(Boolean).join(' ')
}

export function buildTaskTree(tasks: Task[]): Task[] {
  const map = new Map<string, Task>()
  const roots: Task[] = []

  tasks.forEach((t) => {
    map.set(t.id, { ...t, children: [], depth: 0 })
  })

  tasks.forEach((t) => {
    const node = map.get(t.id)!
    if (t.parent_id && map.has(t.parent_id)) {
      const parent = map.get(t.parent_id)!
      node.depth = (parent.depth ?? 0) + 1
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots.sort((a, b) => a.sort_order - b.sort_order)
}

export function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  function walk(list: Task[]) {
    for (const t of list) {
      result.push(t)
      if (t.children?.length) walk(t.children)
    }
  }
  walk(tasks)
  return result
}

export function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('zh-CN')
}

export const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '已阻塞',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

/** Collect all unfinished descendants from a tree node (recursive) */
export function collectUnfinishedDescendants(task: Task): Task[] {
  const result: Task[] = []
  function walk(node: Task) {
    if (node.children) {
      for (const child of node.children) {
        if (child.status !== 'done') {
          result.push(child)
        }
        walk(child)
      }
    }
  }
  walk(task)
  return result
}

/** Collect all descendant IDs (including completed) from a tree node */
export function collectAllDescendantIds(task: Task): Set<string> {
  const ids = new Set<string>()
  function walk(node: Task) {
    if (node.children) {
      for (const child of node.children) {
        ids.add(child.id)
        walk(child)
      }
    }
  }
  walk(task)
  return ids
}

/** Analyze blocked descendants for external dependencies */
export function analyzeBlockedDescendants(
  task: Task,
  unfinishedDescendants: Task[],
  allTasks: Task[],
): { blockedCount: number; externalBlockedCount: number } {
  const descendantIds = collectAllDescendantIds(task)
  descendantIds.add(task.id)

  let blockedCount = 0
  let externalBlockedCount = 0

  for (const desc of unfinishedDescendants) {
    if (desc.status === 'blocked') {
      blockedCount++
      const deps = desc.depends_on || []
      for (const depId of deps) {
        const depTask = allTasks.find((t) => t.id === depId)
        // Only count as external if the dependency is unfinished and not in the subtree
        if (depTask && depTask.status !== 'done' && !descendantIds.has(depId)) {
          externalBlockedCount++
          break
        }
      }
    }
  }

  return { blockedCount, externalBlockedCount }
}

/** Collect all descendant IDs from a flat list using parent_id (for Gantt chart) */
export function collectDescendantIdsFromFlat(
  parentId: string,
  allFlatTasks: Task[],
): Set<string> {
  const ids = new Set<string>()
  const children = allFlatTasks.filter((t) => t.parent_id === parentId)
  for (const child of children) {
    ids.add(child.id)
    const grandChildren = collectDescendantIdsFromFlat(child.id, allFlatTasks)
    for (const id of grandChildren) {
      ids.add(id)
    }
  }
  return ids
}

/** Collect all unfinished descendants from a flat list using parent_id (for Gantt chart) */
export function collectUnfinishedDescendantsFromFlat(
  parentId: string,
  allFlatTasks: Task[],
): Task[] {
  const result: Task[] = []
  const children = allFlatTasks.filter((t) => t.parent_id === parentId)
  for (const child of children) {
    if (child.status !== 'done') {
      result.push(child)
    }
    result.push(...collectUnfinishedDescendantsFromFlat(child.id, allFlatTasks))
  }
  return result
}

/**
 * Cycle detection: check if adding `candidateId` as a dependency of `taskId`
 * would create a cycle in the dependency graph.
 * Returns true if a cycle would be created.
 */
export function wouldCreateCycle(
  taskId: string,
  candidateId: string,
  allTasks: Task[],
): boolean {
  // Build dependency adjacency: for each task, which tasks depend on it
  const dependents = new Map<string, Set<string>>()
  for (const t of allTasks) {
    const deps = t.depends_on || []
    for (const depId of deps) {
      if (!dependents.has(depId)) {
        dependents.set(depId, new Set())
      }
      dependents.get(depId)!.add(t.id)
    }
  }

  // BFS: starting from taskId, can we reach candidateId through dependency chains?
  // If candidateId depends on taskId (directly or transitively), then adding
  // candidateId as a dependency of taskId would create a cycle.
  const visited = new Set<string>()
  const queue: string[] = [taskId]
  visited.add(taskId)

  while (queue.length > 0) {
    const current = queue.shift()!
    const deps = dependents.get(current)
    if (!deps) continue
    for (const depId of deps) {
      if (depId === candidateId) return true
      if (!visited.has(depId)) {
        visited.add(depId)
        queue.push(depId)
      }
    }
  }

  return false
}
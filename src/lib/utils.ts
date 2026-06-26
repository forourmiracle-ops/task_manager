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
      if (node.depth < 4) {
        parent.children = parent.children || []
        parent.children.push(node)
      }
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
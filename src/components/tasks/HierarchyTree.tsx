import { useMemo } from 'react'
import { useUpdateTask } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

interface HierarchyTreeProps {
  task: Task
  tasks: Task[]
  onSelect: (id: string) => void
}

export function HierarchyTree({ task, tasks, onSelect }: HierarchyTreeProps) {
  const updateTask = useUpdateTask()

  // Build ancestor chain from current task to root
  const ancestors = useMemo(() => {
    const chain: Task[] = []
    let current = task
    while (current.parent_id) {
      const parent = tasks.find((t) => t.id === current.parent_id)
      if (!parent) break
      chain.unshift(parent)
      current = parent
    }
    return chain
  }, [task, tasks])

  // Get siblings at each level
  const getSiblings = (parentId: string | null) =>
    tasks.filter((t) => t.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)

  // Get children of a task
  const getChildren = (taskId: string) =>
    tasks.filter((t) => t.parent_id === taskId).sort((a, b) => a.sort_order - b.sort_order)

  const promoteOneLevel = (taskId: string) => {
    const t = tasks.find((t) => t.id === taskId)
    if (!t?.parent_id) return
    const parent = tasks.find((p) => p.id === t.parent_id)
    const grandparentId = parent?.parent_id || null
    updateTask.mutate({ id: taskId, parent_id: grandparentId })
  }

  const promoteToRoot = (taskId: string) => {
    updateTask.mutate({ id: taskId, parent_id: null })
  }

  const moveToSibling = (taskId: string, siblingId: string) => {
    const sibling = tasks.find((t) => t.id === siblingId)
    if (!sibling) return
    updateTask.mutate({ id: taskId, parent_id: sibling.id })
  }

  const renderNode = (t: Task, depth: number, isCurrent: boolean, isRoot: boolean) => {
    const children = getChildren(t.id)
    const hasParent = !!t.parent_id
    const canPromote = hasParent && !isRoot && !isCurrent
    const canPromoteToRoot = hasParent && !isCurrent
    const siblings = getSiblings(t.parent_id || null)

    return (
      <div key={t.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 py-1 px-2 rounded-md transition-colors group',
            isCurrent ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent/50 cursor-pointer',
          )}
          style={{ paddingLeft: depth * 18 + 8 }}
          onClick={() => !isCurrent && onSelect(t.id)}
        >
          {/* Tree lines */}
          {depth > 0 && (
            <span className="text-muted-foreground/40 select-none flex-shrink-0">
              {depth > 1 ? '│' : ''}
            </span>
          )}
          <span className="flex-shrink-0 w-3 text-center text-[10px] text-muted-foreground/50">
            {children.length > 0 ? '▸' : '·'}
          </span>

          {/* Title */}
          <span className="truncate text-xs flex-1">{t.title}</span>

          {/* Action buttons */}
          {!isCurrent && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canPromote && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promoteOneLevel(t.id) }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="提升一级"
                >
                  ↑
                </button>
              )}
              {canPromoteToRoot && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promoteToRoot(t.id) }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="提升到顶层"
                >
                  ↗
                </button>
              )}
              {siblings.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    const idx = siblings.findIndex((s) => s.id === t.id)
                    const prev = idx > 0 ? siblings[idx - 1] : null
                    if (prev) moveToSibling(t.id, prev.id)
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="移至同级"
                >
                  →
                </button>
              )}
            </span>
          )}
        </div>

        {/* Children */}
        {children.map((child) => {
          const isCurrentChild = child.id === task.id
          return renderNode(child, depth + 1, isCurrentChild, false)
        })}
      </div>
    )
  }

  // Render: root-level siblings of ancestors, then ancestors, then current task, then children
  const rootSiblings = getSiblings(null)
  const currentSiblings = getSiblings(task.parent_id || null)
  const children = getChildren(task.id)

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 block">
        层级调整
      </label>
      <div className="space-y-0">
        {/* Root-level siblings (ancestors' siblings) */}
        {rootSiblings.map((t) => {
          const isAncestor = ancestors.some((a) => a.id === t.id)
          return renderNode(t, 0, t.id === task.id, isAncestor)
        })}

        {/* Current task's siblings */}
        {currentSiblings
          .filter((t) => !rootSiblings.some((r) => r.id === t.id))
          .map((t) => renderNode(t, 1, t.id === task.id, false))}

        {/* Children of current task */}
        {children.map((child) => renderNode(child, 2, false, false))}
      </div>
    </div>
  )
}
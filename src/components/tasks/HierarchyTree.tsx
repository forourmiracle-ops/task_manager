import { useMemo } from 'react'
import { useUpdateTask } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

interface HierarchyTreeProps {
  task: Task
  tasks: Task[]
  onSelect: (id: string) => void
}

const MAX_DEPTH = 4

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

  // Get children of a task
  const getChildren = (taskId: string) =>
    tasks.filter((t) => t.parent_id === taskId).sort((a, b) => a.sort_order - b.sort_order)

  const promoteToLevel = (taskId: string, targetParentId: string | null) => {
    updateTask.mutate({ id: taskId, parent_id: targetParentId })
  }

  const moveToSibling = (taskId: string, siblingId: string) => {
    updateTask.mutate({ id: taskId, parent_id: siblingId })
  }

  const renderNode = (t: Task, depth: number, isCurrent: boolean) => {
    const nodeChildren = getChildren(t.id)
    const hasParent = !!t.parent_id
    const canPromoteToRoot = hasParent && !isCurrent
    const canPromoteOneLevel = hasParent && depth > 1 && !isCurrent

    // For promotion: find the parent's parent
    const parent = hasParent ? tasks.find((p) => p.id === t.parent_id) : null
    const grandparentId = parent?.parent_id || null

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
          {/* Tree connector */}
          {depth > 0 && (
            <span className="text-muted-foreground/30 select-none flex-shrink-0 text-[10px]">
              {'├'}
            </span>
          )}
          <span className="flex-shrink-0 w-3 text-center text-[10px] text-muted-foreground/50">
            {nodeChildren.length > 0 ? '▸' : '·'}
          </span>

          {/* Title */}
          <span className="truncate text-xs flex-1">{t.title}</span>

          {/* Action buttons — only on non-current nodes */}
          {!isCurrent && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canPromoteOneLevel && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promoteToLevel(t.id, grandparentId) }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="提升一级"
                >
                  ↑
                </button>
              )}
              {canPromoteToRoot && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promoteToLevel(t.id, null) }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="提升到顶层"
                >
                  ↗
                </button>
              )}
              {depth < MAX_DEPTH - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Move current task under this node
                    moveToSibling(task.id, t.id)
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="移至其下"
                >
                  →
                </button>
              )}
            </span>
          )}
        </div>

        {/* Render children recursively — but only expand for ancestors and current task */}
        {(isCurrent || ancestors.some((a) => a.id === t.id)) && nodeChildren.length > 0 && (
          nodeChildren.map((child) => {
            const isCurrentChild = child.id === task.id
            const isAncestor = ancestors.some((a) => a.id === child.id)
            return renderNode(child, depth + 1, isCurrentChild || isAncestor)
          })
        )}
      </div>
    )
  }

  // Build the full chain from root to current task
  // Find the root of the ancestor chain
  const rootId = ancestors.length > 0 ? ancestors[0].id : task.id
  const root = tasks.find((t) => t.id === rootId) || task

  // Render from root, expanding the ancestor chain
  const renderAncestorChain = (t: Task, depth: number): React.ReactNode => {
    const isCurrent = t.id === task.id
    const isAncestor = ancestors.some((a) => a.id === t.id)
    const nodeChildren = getChildren(t.id)

    // Find the next ancestor in the chain
    const nextAncestor = ancestors.find((a) => {
      // Check if this ancestor is a child of the current node
      return a.parent_id === t.id
    })

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
          {depth > 0 && (
            <span className="text-muted-foreground/30 select-none flex-shrink-0 text-[10px]">
              {'├'}
            </span>
          )}
          <span className="flex-shrink-0 w-3 text-center text-[10px] text-muted-foreground/50">
            {nodeChildren.length > 0 ? '▸' : '·'}
          </span>
          <span className="truncate text-xs flex-1">{t.title}</span>

          {/* Action buttons — only on non-current nodes */}
          {!isCurrent && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {depth > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); promoteToLevel(t.id, null) }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="提升到顶层"
                >
                  ↗
                </button>
              )}
              {depth < MAX_DEPTH - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    moveToSibling(task.id, t.id)
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="移至其下"
                >
                  →
                </button>
              )}
            </span>
          )}
        </div>

        {/* Render children: only ancestors and the current task's children */}
        {nodeChildren
          .filter((child) => {
            // Show if it's the next ancestor in the chain, or if it's the current task
            return child.id === nextAncestor?.id || child.id === task.id
          })
          .map((child) => {
            if (child.id === task.id) {
              // Current task: show with its children
              return renderNodeWithChildren(child, depth + 1)
            }
            // Next ancestor: continue the chain
            return renderAncestorChain(child, depth + 1)
          })}
      </div>
    )
  }

  // Render current task with its children
  const renderNodeWithChildren = (t: Task, depth: number) => {
    const nodeChildren = getChildren(t.id)
    const isCurrent = t.id === task.id

    return (
      <div key={t.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 py-1 px-2 rounded-md transition-colors',
            isCurrent ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent/50 cursor-pointer',
          )}
          style={{ paddingLeft: depth * 18 + 8 }}
          onClick={() => !isCurrent && onSelect(t.id)}
        >
          {depth > 0 && (
            <span className="text-muted-foreground/30 select-none flex-shrink-0 text-[10px]">
              {'├'}
            </span>
          )}
          <span className="flex-shrink-0 w-3 text-center text-[10px] text-muted-foreground/50">
            {nodeChildren.length > 0 ? '▸' : '·'}
          </span>
          <span className="truncate text-xs flex-1">{t.title}</span>
        </div>

        {/* Current task's children */}
        {isCurrent && nodeChildren.map((child) => renderNode(child, depth + 1, false))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 block">
        层级调整
      </label>
      <div className="space-y-0">
        {renderAncestorChain(root, 0)}
      </div>
    </div>
  )
}
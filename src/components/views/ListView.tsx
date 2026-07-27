import { memo, useMemo, useState, useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTasks, useBatchCompleteTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import type { DensityMode } from '@/store'
import { buildTaskTree, flattenTasks, formatDate, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/utils'
import type { Task } from '@/types'

const ROW_HEIGHT: Record<DensityMode, number> = { comfortable: 40, compact: 32 }
const OVERSCAN = 10

interface FlattenedNode {
  task: Task
  depth: number
  hasChildren: boolean
  isExpanded: boolean
  path: string[]
}

export const ListView = memo(function ListView() {
  const { data: tasks, isLoading } = useTasks()
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  const selectedTaskId = useAppStore((s) => s.selectedTaskId)
  const density = useAppStore((s) => s.density)
  const batchComplete = useBatchCompleteTasks()

  const rowHeight = ROW_HEIGHT[density]

  const tree = useMemo(() => buildTaskTree(tasks ?? []), [tasks])

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    const walk = (task: Task) => {
      if (task.children && task.children.length > 0) {
        ids.add(task.id)
        task.children.forEach(walk)
      }
    }
    tree.forEach(walk)
    return ids
  })

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Flatten tree with expansion state
  const flattenedNodes = useMemo(() => {
    const result: FlattenedNode[] = []
    const walk = (task: Task, depth: number, path: string[]) => {
      const currentPath = [...path, task.title]
      const hasChildren = (task.children?.length ?? 0) > 0
      const isExpanded = expandedIds.has(task.id)
      result.push({ task, depth, hasChildren, isExpanded, path: currentPath })
      if (hasChildren && isExpanded && task.children) {
        task.children.forEach((child) => walk(child, depth + 1, currentPath))
      }
    }
    tree.forEach((t) => walk(t, 0, []))
    return result
  }, [tree, expandedIds])

  // Virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: flattenedNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  })

  const handleComplete = useCallback(
    (e: React.MouseEvent, taskId: string) => {
      e.stopPropagation()
      batchComplete.mutate([taskId])
    },
    [batchComplete],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, taskId: string) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        toggleExpand(taskId)
      }
    },
    [toggleExpand],
  )

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2">📋</div>
          <p className="text-sm text-muted-foreground">暂无任务</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击顶栏"新建项目"开始创建</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Header */}
      <div
        className="flex items-center border-b border-border bg-muted/20 px-4 flex-shrink-0 text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
        style={{ height: rowHeight }}
      >
        <div className="w-8 flex-shrink-0" />
        <div className="flex-1 min-w-0">任务名称</div>
        <div className="w-16 text-center flex-shrink-0">状态</div>
        <div className="w-16 text-center flex-shrink-0">优先级</div>
        <div className="w-24 text-right flex-shrink-0">截止日期</div>
        <div className="w-10 flex-shrink-0" />
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const node = flattenedNodes[virtualItem.index]
            if (!node) return null
            const { task, depth, hasChildren, isExpanded } = node
            const isSelected = task.id === selectedTaskId
            const indent = Math.min(depth * 14, 80)

            return (
              <div
                key={task.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className={`absolute top-0 left-0 w-full flex items-center border-b border-border/50 transition-colors group ${
                  isSelected
                    ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                    : 'hover:bg-muted/20'
                } ${task.status === 'done' ? 'opacity-60' : ''}`}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                onClick={() => setSelectedTaskId(task.id)}
              >
                {/* Expand/Collapse */}
                <div className="w-8 flex-shrink-0 flex justify-center">
                  {hasChildren ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(task.id)
                      }}
                      onKeyDown={(e) => handleKeyDown(e, task.id)}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground"
                      tabIndex={0}
                      aria-label={isExpanded ? '折叠' : '展开'}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <path
                          d="M3 1l4 4-4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : depth > 4 ? (
                    <span className="text-[10px] text-muted-foreground/50" title={['根', ...node.path].join(' → ')}>
                      ↳
                    </span>
                  ) : null}
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5" style={{ paddingLeft: `${indent}px` }}>
                  {depth > 4 && (
                    <span className="text-[9px] text-muted-foreground/40 flex-shrink-0" title={['根', ...node.path].join(' → ')}>
                      ↳
                    </span>
                  )}
                  <span
                    className={`text-xs truncate ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'} ${hasChildren ? 'font-semibold' : ''}`}
                  >
                    {task.title}
                  </span>
                  {hasChildren && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      ({task.children?.length ?? 0})
                    </span>
                  )}
                </div>

                {/* Status */}
                <div className="w-16 text-center flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[task.status] ?? task.status}</span>
                </div>

                {/* Priority */}
                <div className="w-16 text-center flex-shrink-0">
                  <span className={`text-[10px] font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                    {task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                  </span>
                </div>

                {/* Due date */}
                <div className="w-24 text-right flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {task.due_date ? formatDate(task.due_date) : '-'}
                  </span>
                </div>

                {/* Quick complete */}
                <div className="w-10 flex-shrink-0 flex justify-center">
                  {task.status !== 'done' && (
                    <button
                      onClick={(e) => handleComplete(e, task.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-green-100 hover:text-green-600 transition-colors opacity-0 group-hover:opacity-100 text-muted-foreground"
                      title="快速完成"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
import { memo, useState, useCallback } from 'react'
import { cn, collectUnfinishedDescendantsFromFlat, collectDescendantIdsFromFlat } from '@/lib/utils'
import { useUpdateTask, useBatchCompleteTasks } from '@/hooks/useTasks'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Task } from '@/types'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#6b7280',
}

interface ConfirmState {
  task: Task
  descendants: Task[]
  blockedCount: number
  externalBlockedCount: number
}

interface GanttTaskPanelProps {
  virtualItems: { index: number; start: number; size: number; key: number }[]
  visibleTasks: Task[]
  allFlatTasks: Task[]
  expandedIds: Set<string>
  childCountMap: { countMap: Map<string, number>; hasChildrenMap: Map<string, boolean> }
  parentMap: Map<string, string>
  selectedTaskId: string | null
  dragState: { sourceId: string; targetIdx: number | null } | null
  LABEL_WIDTH: number
  ROW_HEIGHT: number
  updateDragState: (next: any) => void
  onSaveUndoSnapshot: (snapshot: { sourceId: string; oldSortOrder: number; oldParentId: string | null }) => void
  taskListRef: React.RefObject<HTMLDivElement | null>
  onTaskClick: (id: string) => void
  toggleExpanded: (e: React.MouseEvent, id: string) => void
  handleTaskListScroll: (e: React.UIEvent<HTMLDivElement>) => void
  onTaskDrop: (sourceId: string, newParentId: string | null, newSort: number) => void
  virtualizer: any
}

export const GanttTaskPanel = memo(function GanttTaskPanel({
  virtualItems,
  visibleTasks,
  allFlatTasks,
  expandedIds,
  childCountMap,
  parentMap,
  selectedTaskId,
  dragState,
  LABEL_WIDTH,
  ROW_HEIGHT,
  updateDragState,
  onSaveUndoSnapshot,
  taskListRef,
  onTaskClick,
  toggleExpanded,
  handleTaskListScroll,
  onTaskDrop,
  virtualizer,
}: GanttTaskPanelProps) {
  const updateTask = useUpdateTask()
  const batchComplete = useBatchCompleteTasks()
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const handleQuickComplete = useCallback((task: Task) => {
    const descendants = collectUnfinishedDescendantsFromFlat(task.id, allFlatTasks)

    if (descendants.length === 0) {
      // No unfinished descendants — complete directly
      updateTask.mutate({ id: task.id, status: 'done' }, {
        onError: (err) => alert(err.message),
      })
      return
    }

    // Analyze blocked descendants
    const descendantIds = collectDescendantIdsFromFlat(task.id, allFlatTasks)
    descendantIds.add(task.id)

    let blockedCount = 0
    let externalBlockedCount = 0

    for (const desc of descendants) {
      if (desc.status === 'blocked') {
        blockedCount++
        const deps = desc.depends_on || []
        for (const depId of deps) {
          const depTask = allFlatTasks.find((t) => t.id === depId)
          if (depTask && depTask.status !== 'done' && !descendantIds.has(depId)) {
            externalBlockedCount++
            break
          }
        }
      }
    }

    setConfirmState({ task, descendants, blockedCount, externalBlockedCount })
  }, [allFlatTasks, updateTask])

  const handleConfirmComplete = useCallback(() => {
    if (!confirmState) return
    const { task, descendants } = confirmState
    const allIds = [task.id, ...descendants.map((d) => d.id)]
    batchComplete.mutate(allIds, {
      onError: (err) => alert(err.message),
    })
    setConfirmState(null)
  }, [confirmState, batchComplete])

  const handlePartialComplete = useCallback(() => {
    if (!confirmState) return
    updateTask.mutate({ id: confirmState.task.id, status: 'done' }, {
      onError: (err) => alert(err.message),
    })
    setConfirmState(null)
  }, [confirmState, updateTask])

  const confirmMessage = confirmState
    ? confirmState.blockedCount > 0
      ? `该任务有 ${confirmState.descendants.length} 个未完成子任务，其中 ${confirmState.blockedCount} 个处于阻塞状态（${confirmState.externalBlockedCount} 个依赖外部任务）。是否同时完成所有子任务？`
      : `该任务有 ${confirmState.descendants.length} 个未完成子任务。是否同时完成所有子任务？`
    : ''

  return (
    <div
      className="flex-shrink-0 border-r border-border flex flex-col bg-background relative"
      style={{ width: LABEL_WIDTH }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 border-b border-border flex items-center px-3 bg-muted/10"
        style={{ height: 66 }}
      >
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">任务</span>
      </div>

      {/* Virtual task list */}
      <div
        ref={taskListRef}
        className="flex-1 overflow-auto"
        style={{ willChange: 'scroll-position', contain: 'layout style' }}
        onScroll={handleTaskListScroll}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {virtualItems.map((virtualItem) => {
            const task = visibleTasks[virtualItem.index]
            const idx = virtualItem.index
            const isSelected = selectedTaskId === task.id
            const depth = task.depth ?? 0
            const hasChildren = childCountMap.hasChildrenMap.get(task.id) ?? false
            const isExpanded = expandedIds.has(task.id)
            const childCount = childCountMap.countMap.get(task.id) || 0
            const isChild = depth > 0
            const indent = Math.min(depth * 16, 80)
            const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
            const isDone = task.status === 'done'

            return (
              <div
                key={task.id}
                data-task-row
                draggable
                onDragStart={(e) => {
                  const img = new Image()
                  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
                  e.dataTransfer.setDragImage(img, 0, 0)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', task.id)
                  updateDragState({ sourceId: task.id, targetIdx: null })
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  updateDragState((prev: any) => {
                    if (prev?.sourceId !== task.id) {
                      return { sourceId: prev?.sourceId || '', targetIdx: idx }
                    }
                    return prev
                  })
                }}
                onDragLeave={() => {
                  updateDragState((prev: any) => {
                    if (prev?.targetIdx === idx) {
                      return { ...prev, targetIdx: null }
                    }
                    return prev
                  })
                }}
                onDragEnd={() => updateDragState(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  updateDragState(null)
                  const sourceId = e.dataTransfer.getData('text/plain')
                  if (sourceId === task.id) return

                  // Reject drop if target is a descendant of source (prevents self-referencing)
                  let checkId: string | null = task.id
                  while (checkId) {
                    checkId = parentMap.get(checkId) ?? null
                    if (checkId === sourceId) return
                  }

                  // Find source task in full list (visibleTasks may be filtered by viewport)
                  const sourceTask = allFlatTasks.find((t) => t.id === sourceId)
                  if (!sourceTask) return

                  // Save snapshot for undo
                  onSaveUndoSnapshot({
                    sourceId,
                    oldSortOrder: sourceTask.sort_order,
                    oldParentId: sourceTask.parent_id || null,
                  })

                  // Calculate new sort_order: insert between target and previous task
                  const targetIdx = visibleTasks.findIndex((t) => t.id === task.id)
                  const prevTask = targetIdx > 0 ? visibleTasks[targetIdx - 1] : null
                  const newSort = prevTask
                    ? (prevTask.sort_order + task.sort_order) / 2
                    : task.sort_order - 1
                  // Place at same level as target task
                  const newParentId = task.parent_id

                  onTaskDrop(sourceId, newParentId, newSort)
                }}
                className={cn(
                  'flex items-center px-3 gap-1.5 cursor-pointer hover:bg-accent/40 transition-colors border-b border-border/50 flex-shrink-0 relative group',
                  isSelected ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/5',
                  dragState?.sourceId === task.id && 'opacity-40 border-2 border-dashed border-primary',
                )}
                style={{
                  position: 'absolute',
                  top: `${virtualItem.start}px`,
                  left: 0,
                  width: '100%',
                  height: ROW_HEIGHT,
                }}
                onClick={() => onTaskClick(task.id)}
              >
                {/* Drag insertion indicator */}
                {dragState?.targetIdx === idx && dragState.sourceId !== task.id && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-20 rounded-full" />
                )}

                {/* Child tree connector line */}
                {isChild && (
                  <div
                    className="absolute left-0 top-0 bottom-0 border-l-2 border-muted-foreground/20"
                    style={{ left: 12 + (depth - 1) * 16 }}
                  />
                )}

                <span className="w-4 flex-shrink-0 flex justify-center">
                  {hasChildren ? (
                    <button
                      onClick={(e) => toggleExpanded(e, task.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors"
                    >
                      {isExpanded ? (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M4 6l4 4 4-4" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M6 4l4 4-4 4" />
                        </svg>
                      )}
                    </button>
                  ) : null}
                </span>

                <div className="flex items-center flex-1 min-w-0" style={{ paddingLeft: indent }}>
                  {/* Priority marker */}
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-offset-1"
                    style={{
                      backgroundColor: priorityColor,
                      boxShadow: `0 0 0 1px ${priorityColor}33`,
                    }}
                  />
                  <span
                    className={cn(
                      'text-[12px] truncate flex-1 ml-2',
                      hasChildren && 'font-bold',
                    )}
                  >
                    {task.title}
                  </span>
                  {hasChildren && childCount > 0 && (
                    <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">
                      {childCount}
                    </span>
                  )}
                </div>

                {/* Quick complete button */}
                {!isDone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleQuickComplete(task)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-green-500 flex-shrink-0 p-0.5 rounded hover:bg-accent transition-all"
                    title="标记完成"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  </button>
                )}

                {/* Status indicator */}
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1',
                    task.status === 'done' && 'bg-green-500',
                    task.status === 'in_progress' && 'bg-blue-500',
                    task.status === 'blocked' && 'bg-red-500',
                    task.status === 'todo' && 'bg-gray-300',
                  )}
                />

                {/* Progress percentage */}
                {(task.progress_percent || 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0 font-medium ml-1">
                    {task.progress_percent}%
                  </span>
                )}
              </div>
            )
          })}

          {visibleTasks.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
              当前可视范围内没有任务
            </div>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmState !== null}
        message={confirmMessage}
        confirmLabel="同时完成所有子任务"
        partialLabel="仅完成此任务"
        cancelLabel="取消"
        onConfirm={handleConfirmComplete}
        onPartial={handlePartialComplete}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
})
import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#6b7280',
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
  return (
    <div
      className="flex-shrink-0 border-r border-border flex flex-col bg-background"
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
            const indent = depth * 16 + (hasChildren ? 0 : 18)
            const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium

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
                  'flex items-center px-3 gap-1.5 cursor-pointer hover:bg-accent/40 transition-colors border-b border-border/50 flex-shrink-0 relative',
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
    </div>
  )
})
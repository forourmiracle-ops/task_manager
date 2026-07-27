import { useState, useMemo, memo, useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask, useBatchCompleteTasks } from '@/hooks/useTasks'
import { buildTaskTree, cn, collectUnfinishedDescendants, collectAllDescendantIds } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Task } from '@/types'

const DONE_SHOW_LIMIT = 50

interface ConfirmState {
  task: Task
  descendants: Task[]
  blockedCount: number
  externalBlockedCount: number
}

/** Flatten tree into a linear list, respecting expand/collapse state */
function flattenVisibleTree(tasks: Task[], expandedIds: Set<string>, searchQuery: string): Task[] {
  const result: Task[] = []
  const q = searchQuery.toLowerCase()

  function walk(list: Task[]) {
    for (const t of list) {
      const matchesSearch = !q || t.title.toLowerCase().includes(q)
      // If there's a search query, show all matching tasks (flattened)
      if (q) {
        if (matchesSearch) result.push(t)
        if (t.children?.length) walk(t.children)
        continue
      }
      // Normal mode: only show expanded nodes
      result.push(t)
      if (t.children?.length && expandedIds.has(t.id)) {
        walk(t.children)
      }
    }
  }
  walk(tasks)
  return result
}

export const Sidebar = memo(function Sidebar() {
  const { data: tasks, isLoading } = useTasks()
  const {
    selectedTaskId,
    setSelectedTaskId,
    sidebarOpen,
    setSidebarOpen,
    startCreating,
    searchQuery,
    setSearchQuery,
    density,
  } = useAppStore()

  const ROW_HEIGHT = density === 'compact' ? 32 : 36

  const [doneExpanded, setDoneExpanded] = useState(false)
  const [doneShowAll, setDoneShowAll] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const updateTask = useUpdateTask()
  const batchComplete = useBatchCompleteTasks()
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Split tasks into active and completed groups
  const activeTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((t) => t.status !== 'done')
  }, [tasks])

  const doneTasks = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((t) => t.status === 'done')
  }, [tasks])

  const tree = useMemo(() => (activeTasks.length > 0 ? buildTaskTree(activeTasks) : []), [activeTasks])

  // Debounced search
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 150)
  }, [setSearchQuery])

  // Flatten visible tree for virtual scrolling
  const visibleTasks = useMemo(() => {
    return flattenVisibleTree(tree, expandedIds, debouncedQuery)
  }, [tree, expandedIds, debouncedQuery])

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: visibleTasks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const toggleExpanded = useCallback((e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  // Filter done tasks by search
  const filteredDoneTasks = useMemo(() => {
    if (!debouncedQuery) return doneTasks
    return doneTasks.filter((t) =>
      t.title.toLowerCase().includes(debouncedQuery.toLowerCase())
    )
  }, [doneTasks, debouncedQuery])

  const handleSelect = useCallback((id: string) => setSelectedTaskId(id), [setSelectedTaskId])
  const handleAddChild = useCallback((id: string) => {
    startCreating(id)
  }, [startCreating])

  const handleQuickComplete = useCallback((task: Task) => {
    const descendants = collectUnfinishedDescendants(task)

    if (descendants.length === 0) {
      updateTask.mutate({ id: task.id, status: 'done' }, {
        onError: (err) => alert(err.message),
      })
      return
    }

    let blockedCount = 0
    let externalBlockedCount = 0

    if (tasks) {
      const descendantIds = collectAllDescendantIds(task)
      descendantIds.add(task.id)

      for (const desc of descendants) {
        if (desc.status === 'blocked') {
          blockedCount++
          const deps = desc.depends_on || []
          for (const depId of deps) {
            const depTask = tasks.find((t) => t.id === depId)
            if (depTask && depTask.status !== 'done' && !descendantIds.has(depId)) {
              externalBlockedCount++
              break
            }
          }
        }
      }
    }

    setConfirmState({ task, descendants, blockedCount, externalBlockedCount })
  }, [tasks, updateTask])

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

  if (!sidebarOpen) return null

  const hasActiveResults = visibleTasks.length > 0
  const hasDoneResults = filteredDoneTasks.length > 0

  return (
    <aside className="border-r border-border bg-sidebar flex flex-col h-full shadow-elevated min-h-0" style={{ width: 280, minWidth: 280, flexShrink: 0 }}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold tracking-tight">任务列表</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{tasks ? tasks.length : 0} 个任务</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-border rounded-xl bg-background focus:outline-none focus:ring-1.5 focus:ring-ring placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Task List — virtual scrolling */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : !hasActiveResults && !hasDoneResults ? (
          <div className="text-xs text-muted-foreground p-3 text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border">
            <p>暂无任务</p>
            <button
              onClick={() => startCreating(null)}
              className="text-primary hover:underline mt-2 font-medium"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <>
            {/* Active tasks — virtual scrolling */}
            {visibleTasks.length > 0 && (
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const task = visibleTasks[virtualItem.index]
                  const isSelected = selectedTaskId === task.id
                  const hasChildren = task.children && task.children.length > 0
                  const currentDepth = task.depth ?? 0
                  const isExpanded = expandedIds.has(task.id)
                  const isDone = task.status === 'done'
                  const isDeep = currentDepth > 5

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'group flex items-center gap-1.5 px-2 rounded-lg text-xs cursor-pointer transition-all border-b border-border/20',
                        isDeep && 'text-muted-foreground/70',
                        isSelected
                          ? 'bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20'
                          : 'hover:bg-accent text-foreground'
                      )}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: ROW_HEIGHT,
                        transform: `translateY(${virtualItem.start}px)`,
                        paddingLeft: `${10 + Math.min(currentDepth * 14, 80)}px`,
                      }}
                      onClick={() => handleSelect(task.id)}
                      title={isDeep ? `路径: ${task.title}` : undefined}
                    >
                      {/* Expand/Collapse */}
                      <span className="w-4 flex-shrink-0 text-center">
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
                        ) : (
                          <span className="text-muted-foreground/30 inline-block w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </span>

                      {/* Status indicator */}
                      <span
                        className={cn(
                          'w-1.5 h-1.5 rounded-full flex-shrink-0',
                          task.status === 'done' && 'bg-green-500',
                          task.status === 'in_progress' && 'bg-blue-500',
                          task.status === 'blocked' && 'bg-red-500',
                          task.status === 'todo' && 'bg-gray-300'
                        )}
                      />

                      {/* Title */}
                      <span className="flex-1 truncate flex items-center gap-1">
                        {isDeep && <span className="text-muted-foreground/40 flex-shrink-0">↳</span>}
                        {task.title}
                      </span>

                      {/* Progress */}
                      {task.progress_percent > 0 && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 font-medium">
                          {task.progress_percent}%
                        </span>
                      )}

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

                      {/* Add child button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddChild(task.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary flex-shrink-0 p-0.5 rounded hover:bg-accent transition-all"
                        title="添加子任务"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M8 3v10M3 8h10" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Completed tasks */}
            {filteredDoneTasks.length > 0 && (
              <div className="mt-2 border-t border-border pt-2">
                <button
                  onClick={() => setDoneExpanded(!doneExpanded)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                >
                  <span>已完成 ({filteredDoneTasks.length})</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`transition-transform ${doneExpanded ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {doneExpanded && (
                  <div className="mt-1 space-y-0.5 relative">
                    {filteredDoneTasks
                      .slice(0, doneShowAll ? undefined : DONE_SHOW_LIMIT)
                      .map((task) => (
                        <div
                          key={task.id}
                          onClick={() => handleSelect(task.id)}
                          className={cn(
                            'text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-colors flex items-center gap-2',
                            selectedTaskId === task.id
                              ? 'bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20'
                              : 'text-muted-foreground hover:bg-accent'
                          )}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 flex-shrink-0">
                            <path d="M3 8l3.5 3.5L13 5" />
                          </svg>
                          <span className="line-through truncate">{task.title}</span>
                        </div>
                      ))}
                    {filteredDoneTasks.length > DONE_SHOW_LIMIT && !doneShowAll && (
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-sidebar to-transparent pointer-events-none" />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Action */}
      <div className="p-3 border-t border-border bg-muted/10">
        <button
          onClick={() => startCreating(null)}
          className="w-full py-2.5 text-xs font-medium border border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent transition-all flex items-center justify-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M8 3v10M3 8h10" />
          </svg>
          新建项目
        </button>
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
    </aside>
  )
})
import { useState, useMemo, memo, useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn, collectUnfinishedDescendants, collectAllDescendantIds } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { Task } from '@/types'

const MAX_DEPTH = 4

interface ConfirmState {
  task: Task
  descendants: Task[]
  blockedCount: number
  externalBlockedCount: number
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
  } = useAppStore()

  const [doneExpanded, setDoneExpanded] = useState(false)
  const updateTask = useUpdateTask()
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

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

  // Precompute parent map for O(1) depth lookups
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (let i = 0; i < activeTasks.length; i++) {
      map.set(activeTasks[i].id, activeTasks[i].parent_id ?? null)
    }
    return map
  }, [activeTasks])

  const getTaskDepth = useCallback((taskId: string): number => {
    let depth = 0
    let currentId: string | null = parentMap.get(taskId) ?? null
    while (currentId) {
      depth++
      currentId = parentMap.get(currentId) ?? null
    }
    return depth
  }, [parentMap])

  const canAddChild = useCallback((taskId: string): boolean => {
    return getTaskDepth(taskId) < MAX_DEPTH - 1
  }, [getTaskDepth])

  // Debounced search — only update after user stops typing
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 150)
  }, [setSearchQuery])

  // Filter done tasks by search
  const filteredDoneTasks = useMemo(() => {
    if (!debouncedQuery) return doneTasks
    return doneTasks.filter((t) =>
      t.title.toLowerCase().includes(debouncedQuery.toLowerCase())
    )
  }, [doneTasks, debouncedQuery])

  // Stable callbacks
  const handleSelect = useCallback((id: string) => setSelectedTaskId(id), [setSelectedTaskId])
  const handleAddChild = useCallback((id: string) => {
    if (canAddChild(id)) startCreating(id)
  }, [canAddChild, startCreating])

  const handleQuickComplete = useCallback((task: Task) => {
    const descendants = collectUnfinishedDescendants(task)

    if (descendants.length === 0) {
      updateTask.mutate({ id: task.id, status: 'done' }, {
        onError: (err) => alert(err.message),
      })
      return
    }

    // Analyze blocked descendants
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
    updateTask.mutate({ id: task.id, status: 'done' })
    for (const desc of descendants) {
      updateTask.mutate({ id: desc.id, status: 'done' }, {
        onError: (err) => alert(err.message),
      })
    }
    setConfirmState(null)
  }, [confirmState, updateTask])

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

  const hasActiveResults = tree.length > 0 || !debouncedQuery
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

      {/* Task List */}
      <div className="flex-1 overflow-auto p-3">
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
            {tree.length > 0 && (
              <TaskTreeList
                tasks={tree}
                selectedId={selectedTaskId}
                onSelect={handleSelect}
                onAddChild={handleAddChild}
                onQuickComplete={handleQuickComplete}
                searchQuery={debouncedQuery}
                depth={0}
                canAddChild={canAddChild}
              />
            )}
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
                  <div className="mt-1 space-y-0.5">
                    {filteredDoneTasks.map((task) => (
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

const TaskTreeList = memo(function TaskTreeList({
  tasks,
  selectedId,
  onSelect,
  onAddChild,
  onQuickComplete,
  searchQuery,
  depth,
  canAddChild,
}: {
  tasks: Task[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  onQuickComplete: (task: Task) => void
  searchQuery: string
  depth: number
  canAddChild: (id: string) => boolean
}) {
  const filtered = searchQuery
    ? flattenTasks(tasks).filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tasks

  return (
    <ul className="space-y-0.5">
      {filtered.map((task) => (
        <TaskNode
          key={task.id}
          task={task}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onQuickComplete={onQuickComplete}
          searchQuery={searchQuery}
          depth={depth}
          canAddChild={canAddChild}
        />
      ))}
    </ul>
  )
})

const TaskNode = memo(function TaskNode({
  task,
  selectedId,
  onSelect,
  onAddChild,
  onQuickComplete,
  searchQuery,
  depth,
  canAddChild,
}: {
  task: Task
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  onQuickComplete: (task: Task) => void
  searchQuery: string
  depth: number
  canAddChild: (id: string) => boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = selectedId === task.id
  const hasChildren = task.children && task.children.length > 0
  const currentDepth = task.depth ?? depth
  const canAdd = canAddChild(task.id)
  const isDone = task.status === 'done'

  if (currentDepth >= MAX_DEPTH) return null

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-xs cursor-pointer transition-all',
          isSelected
            ? 'bg-primary/10 text-primary font-semibold shadow-sm ring-1 ring-primary/20'
            : 'hover:bg-accent text-foreground'
        )}
        style={{ paddingLeft: `${10 + currentDepth * 14}px` }}
        onClick={() => onSelect(task.id)}
      >
        {/* Expand/Collapse */}
        <span className="w-4 flex-shrink-0 text-center">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setExpanded(!expanded)
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors"
            >
              {expanded ? (
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
        <span className="flex-1 truncate">{task.title}</span>

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
              onQuickComplete(task)
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
        {canAdd && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddChild(task.id)
            }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary flex-shrink-0 p-0.5 rounded hover:bg-accent transition-all"
            title="添加子任务"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <TaskTreeList
          tasks={task.children!}
          selectedId={selectedId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onQuickComplete={onQuickComplete}
          searchQuery={searchQuery}
          depth={currentDepth + 1}
          canAddChild={canAddChild}
        />
      )}
    </li>
  )
})

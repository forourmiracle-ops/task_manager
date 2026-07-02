import { useState, useMemo, memo, useCallback, useRef } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import type { Task } from '@/types'

const MAX_DEPTH = 4

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

  const [hideCompleted, setHideCompleted] = useState(false)

  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    if (!hideCompleted) return tasks
    return tasks.filter((t) => t.status !== 'done')
  }, [tasks, hideCompleted])

  const tree = useMemo(() => (filteredTasks.length > 0 ? buildTaskTree(filteredTasks) : []), [filteredTasks])

  // Precompute parent map for O(1) depth lookups
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (let i = 0; i < filteredTasks.length; i++) {
      map.set(filteredTasks[i].id, filteredTasks[i].parent_id ?? null)
    }
    return map
  }, [filteredTasks])

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

  // Stable callbacks
  const handleSelect = useCallback((id: string) => setSelectedTaskId(id), [setSelectedTaskId])
  const handleAddChild = useCallback((id: string) => {
    if (canAddChild(id)) startCreating(id)
  }, [canAddChild, startCreating])

  if (!sidebarOpen) return null

  return (
    <aside className="border-r border-border bg-sidebar flex flex-col h-full shadow-elevated" style={{ width: 280, minWidth: 280, flexShrink: 0 }}>
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold tracking-tight">任务列表</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">{filteredTasks.length} 个任务</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHideCompleted((v) => !v)}
              className={cn(
                'text-[10px] px-2 py-1 rounded-lg transition-colors',
                hideCompleted
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title={hideCompleted ? '显示已完成任务' : '隐藏已完成任务'}
            >
              {hideCompleted ? '已过滤' : '过滤'}
            </button>
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
        ) : tree.length === 0 ? (
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
          <TaskTreeList
            tasks={tree}
            selectedId={selectedTaskId}
            onSelect={handleSelect}
            onAddChild={handleAddChild}
            searchQuery={debouncedQuery}
            depth={0}
            canAddChild={canAddChild}
          />
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
    </aside>
  )
})

const TaskTreeList = memo(function TaskTreeList({
  tasks,
  selectedId,
  onSelect,
  onAddChild,
  searchQuery,
  depth,
  canAddChild,
}: {
  tasks: Task[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
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
  searchQuery,
  depth,
  canAddChild,
}: {
  task: Task
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  searchQuery: string
  depth: number
  canAddChild: (id: string) => boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = selectedId === task.id
  const hasChildren = task.children && task.children.length > 0
  const currentDepth = task.depth ?? depth
  const canAdd = canAddChild(task.id)

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
          searchQuery={searchQuery}
          depth={currentDepth + 1}
          canAddChild={canAddChild}
        />
      )}
    </li>
  )
})

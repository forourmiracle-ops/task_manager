import { useState } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

const MAX_DEPTH = 4

export function Sidebar() {
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

  const tree = tasks ? buildTaskTree(tasks) : []

  const getTaskDepth = (taskId: string): number => {
    if (!tasks) return 0
    let depth = 0
    let current = tasks.find((t) => t.id === taskId)
    while (current?.parent_id) {
      depth++
      current = tasks.find((t) => t.id === current!.parent_id)
    }
    return depth
  }

  const canAddChild = (taskId: string): boolean => {
    return getTaskDepth(taskId) < MAX_DEPTH - 1
  }

  if (!sidebarOpen) return null

  return (
    <aside className="border-r border-border bg-sidebar flex flex-col h-full" style={{ width: 256, minWidth: 256, flexShrink: 0 }}>
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold tracking-tight">任务列表</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-muted-foreground hover:text-foreground text-xs px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
          >
            收起
          </button>
        </div>
        <div className="relative">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            type="text"
            placeholder="搜索任务..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1.5 focus:ring-ring placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Quick Create Button */}
      <div className="p-2 border-b border-border">
        <button
          onClick={() => startCreating(null)}
          className="w-full py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 shadow-sm transition-all"
        >
          + 新建项目
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-2">加载中...</div>
        ) : tree.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2 text-center py-8">
            <p>暂无任务</p>
            <button
              onClick={() => startCreating(null)}
              className="text-primary hover:underline mt-2"
            >
              创建第一个项目
            </button>
          </div>
        ) : (
          <TaskTreeList
            tasks={tree}
            selectedId={selectedTaskId}
            onSelect={(id) => setSelectedTaskId(id)}
            onAddChild={(id) => {
              if (canAddChild(id)) {
                startCreating(id)
              }
            }}
            searchQuery={searchQuery}
            depth={0}
            canAddChild={canAddChild}
          />
        )}
      </div>

      {/* Bottom Action */}
      <div className="p-3 border-t border-border">
        <button
          onClick={() => startCreating(null)}
          className="w-full py-1.5 text-xs border border-dashed border-border rounded text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          + 新建项目
        </button>
      </div>
    </aside>
  )
}

function TaskTreeList({
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
}

function TaskNode({
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
          'group flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all',
          isSelected
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-accent text-foreground'
        )}
        style={{ paddingLeft: `${8 + currentDepth * 16}px` }}
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
              className="text-muted-foreground hover:text-foreground"
            >
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="text-muted-foreground/30">•</span>
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
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
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
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground flex-shrink-0 px-1"
            title="添加子任务"
          >
            +
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
}
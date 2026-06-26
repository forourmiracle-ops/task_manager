import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useCreateTask } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

export function Sidebar() {
  const { data: tasks, isLoading } = useTasks()
  const createTask = useCreateTask()
  const {
    selectedTaskId,
    setSelectedTaskId,
    sidebarOpen,
    setSidebarOpen,
    creatingParentId,
    setCreatingParentId,
    searchQuery,
    setSearchQuery,
  } = useAppStore()

  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingParentId) {
      inputRef.current?.focus()
    }
  }, [creatingParentId])

  const tree = tasks ? buildTaskTree(tasks) : []

  const handleCreate = () => {
    if (!newTitle.trim()) return
    createTask.mutate(
      { title: newTitle.trim(), parent_id: creatingParentId },
      { onSuccess: () => {
        setNewTitle('')
        setCreatingParentId(null)
      }}
    )
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      setCreatingParentId(null)
      setNewTitle('')
    }
  }

  if (!sidebarOpen) return null

  return (
    <aside className="w-64 min-w-[256px] border-r border-border bg-sidebar flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">任务列表</h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            收起
          </button>
        </div>
        <input
          type="text"
          placeholder="搜索任务..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-2">加载中...</div>
        ) : (
          <TaskTreeList
            tasks={tree}
            selectedId={selectedTaskId}
            onSelect={(id) => setSelectedTaskId(id)}
            onAddChild={(id) => {
              setCreatingParentId(id)
              setNewTitle('')
            }}
            searchQuery={searchQuery}
            depth={0}
          />
        )}
      </div>

      {/* Quick Add */}
      <div className="p-3 border-t border-border">
        {creatingParentId !== null ? (
          <div className="flex gap-1">
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入任务标题..."
              className="flex-1 px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              确定
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setCreatingParentId(null)
              setNewTitle('')
            }}
            className="w-full py-1.5 text-xs border border-dashed border-border rounded text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            + 新建项目
          </button>
        )}
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
}: {
  tasks: Task[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  searchQuery: string
  depth: number
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
}: {
  task: Task
  selectedId: string | null
  onSelect: (id: string) => void
  onAddChild: (id: string) => void
  searchQuery: string
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = selectedId === task.id
  const hasChildren = task.children && task.children.length > 0
  const currentDepth = task.depth ?? depth

  if (currentDepth >= 4) return null

  return (
    <li>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors',
          isSelected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50 text-foreground'
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
        />
      )}
    </li>
  )
}
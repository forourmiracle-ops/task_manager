import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useCreateTask } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus, TaskPriority } from '@/types'

const MAX_DEPTH = 4

export function Sidebar() {
  const { data: tasks, isLoading } = useTasks()
  const createTask = useCreateTask()
  const {
    selectedTaskId,
    setSelectedTaskId,
    sidebarOpen,
    setSidebarOpen,
    isCreating,
    creatingParentId,
    startCreating,
    stopCreating,
    searchQuery,
    setSearchQuery,
  } = useAppStore()

  const [newTitle, setNewTitle] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newPriority, setNewPriority] = useState<TaskPriority>('medium')
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo')
  const [showMoreFields, setShowMoreFields] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isCreating, creatingParentId])

  const resetForm = () => {
    setNewTitle('')
    setNewStartDate('')
    setNewDueDate('')
    setNewPriority('medium')
    setNewStatus('todo')
    setShowMoreFields(false)
  }

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

  const handleCreate = () => {
    if (!newTitle.trim()) return
    createTask.mutate(
      {
        title: newTitle.trim(),
        parent_id: creatingParentId,
        start_date: newStartDate || null,
        due_date: newDueDate || null,
        priority: newPriority,
        status: newStatus,
      },
      {
        onSuccess: (task) => {
          resetForm()
          stopCreating()
          setSelectedTaskId(task.id)
        },
      }
    )
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
    if (e.key === 'Escape') {
      stopCreating()
      resetForm()
    }
  }

  if (!sidebarOpen) return null

  const getCreatingLabel = () => {
    if (!creatingParentId) return '新项目名称'
    const parent = tasks?.find((t) => t.id === creatingParentId)
    return `在「${parent?.title || '...'}」下添加子任务`
  }

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

      {/* Quick Create (Top) */}
      {isCreating && (
        <div className="p-2 border-b border-border bg-accent/30">
          <p className="text-[10px] text-muted-foreground mb-1.5">{getCreatingLabel()}</p>
          <div className="flex gap-1 mb-2">
            <input
              ref={inputRef}
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入名称，回车确认..."
              className="flex-1 px-2 py-1.5 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleCreate}
              className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
            >
              确定
            </button>
          </div>

          {/* Toggle more fields */}
          <button
            onClick={() => setShowMoreFields(!showMoreFields)}
            className="text-[10px] text-muted-foreground hover:text-foreground mb-1"
          >
            {showMoreFields ? '收起字段 ▲' : '展开更多字段 ▼'}
          </button>

          {showMoreFields && (
            <div className="space-y-1.5 mb-1">
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-[10px] text-muted-foreground">开始日期</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full px-1.5 py-1 text-xs border border-border rounded bg-background"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">截止日期</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full px-1.5 py-1 text-xs border border-border rounded bg-background"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-[10px] text-muted-foreground">优先级</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full px-1.5 py-1 text-xs border border-border rounded bg-background"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">状态</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                    className="w-full px-1.5 py-1 text-xs border border-border rounded bg-background"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => {
              stopCreating()
              resetForm()
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
          >
            取消
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground p-2">加载中...</div>
        ) : tree.length === 0 && !isCreating ? (
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
                setNewTitle('')
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
        {!isCreating && (
          <button
            onClick={() => {
              startCreating(null)
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
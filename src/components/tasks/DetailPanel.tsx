import { useState, useRef, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { cn, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, formatDate } from '@/lib/utils'
import type { Task, TaskStatus, TaskPriority } from '@/types'

const MAX_DEPTH = 4

type EditingField = 'title' | 'description' | 'status' | 'priority' | 'start_date' | 'due_date' | 'progress_percent' | 'estimated_hours' | 'tags' | null

export function DetailPanel() {
  const { selectedTaskId, setSelectedTaskId, detailPanelOpen, setDetailPanelOpen, startCreating } = useAppStore()
  const { data: tasks } = useTasks()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const rawTask = tasks?.find((t) => t.id === selectedTaskId)
  // Normalize task data to prevent null reference errors from Supabase
  const task = rawTask ? {
    ...rawTask,
    tags: rawTask.tags || [],
    depends_on: rawTask.depends_on || [],
    children: rawTask.children || [],
  } : null
  const [editingField, setEditingField] = useState<EditingField>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingField, setPendingField] = useState<EditingField>(null)
  const [pendingValue, setPendingValue] = useState<unknown>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLElement>(null)

  // Reset editing when task changes
  useEffect(() => {
    setEditingField(null)
    setShowConfirm(false)
  }, [selectedTaskId])

  // Focus input when editing starts
  useEffect(() => {
    if (editingField && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingField])

  // Click outside to trigger confirm
  useEffect(() => {
    if (!editingField) return
    const handleClickOutside = (e: MouseEvent) => {
      if (detailRef.current && !detailRef.current.contains(e.target as Node)) {
        commitEdit()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [editingField, editValue])

  if (!detailPanelOpen || !task) return null

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

  const currentDepth = getTaskDepth(task.id)
  const canAddChild = currentDepth < MAX_DEPTH - 1

  const startEditing = (field: EditingField, initialValue: string) => {
    setEditingField(field)
    setEditValue(initialValue)
  }

  const commitEdit = useCallback(() => {
    if (!editingField || !task) return
    const newValue = editValue.trim()

    // Build the update payload
    let payload: Partial<Task> = {}
    switch (editingField) {
      case 'title':
        if (!newValue || newValue === task.title) { setEditingField(null); return }
        payload = { title: newValue }
        break
      case 'description':
        if (newValue === (task.description || '')) { setEditingField(null); return }
        payload = { description: newValue || '' }
        break
      case 'status':
        if (newValue === task.status) { setEditingField(null); return }
        payload = { status: newValue as TaskStatus }
        break
      case 'priority':
        if (newValue === task.priority) { setEditingField(null); return }
        payload = { priority: newValue as TaskPriority }
        break
      case 'start_date':
        if (newValue === (task.start_date || '')) { setEditingField(null); return }
        payload = { start_date: newValue || null }
        break
      case 'due_date':
        if (newValue === (task.due_date || '')) { setEditingField(null); return }
        payload = { due_date: newValue || null }
        break
      case 'progress_percent':
        if (Number(newValue) === task.progress_percent) { setEditingField(null); return }
        payload = { progress_percent: Math.max(0, Math.min(100, Number(newValue) || 0)) }
        break
      case 'estimated_hours':
        if ((newValue ? Number(newValue) : null) === task.estimated_hours) { setEditingField(null); return }
        payload = { estimated_hours: newValue ? Number(newValue) : null }
        break
      case 'tags':
        const newTags = newValue.split(',').map((s) => s.trim()).filter(Boolean)
        if (JSON.stringify(newTags) === JSON.stringify(task.tags)) { setEditingField(null); return }
        payload = { tags: newTags }
        break
    }

    setPendingField(editingField)
    setPendingValue({ id: task.id, ...payload })
    setShowConfirm(true)
    setEditingField(null)
  }, [editingField, editValue, task])

  const confirmEdit = () => {
    if (!pendingValue) return
    updateTask.mutate(pendingValue as Task & { id: string })
    setShowConfirm(false)
    setPendingField(null)
    setPendingValue(null)
  }

  const cancelEdit = () => {
    setShowConfirm(false)
    setPendingField(null)
    setPendingValue(null)
    setEditValue('')
  }

  const handleDelete = () => {
    if (confirm('确定删除此任务？子任务将一并删除。')) {
      deleteTask.mutate(task.id, {
        onSuccess: () => {
          setSelectedTaskId(null)
          setDetailPanelOpen(false)
        },
      })
    }
  }

  const handleAddChild = () => {
    if (!canAddChild) return
    startCreating(task.id)
  }

  const subtasks = tasks?.filter((t) => t.parent_id === task.id) || []

  const depthLabels = ['项目', '阶段', '任务组', '子任务']
  const currentLevelLabel = depthLabels[currentDepth] || `第${currentDepth + 1}层`

  const getFieldLabel = (field: EditingField) => {
    const map: Record<string, string> = {
      title: '标题', description: '描述', status: '状态', priority: '优先级',
      start_date: '开始日期', due_date: '截止日期', progress_percent: '进度',
      estimated_hours: '预估工时', tags: '标签',
    }
    return field ? map[field] || field : ''
  }

  const EditableField = ({
    field,
    label,
    displayValue,
    editValue: initialEditValue,
    children,
  }: {
    field: EditingField
    label: string
    displayValue: string
    editValue: string
    children?: React.ReactNode
  }) => {
    const isEditing = editingField === field

    if (isEditing) {
      if (field === 'status') {
        return (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
            <select
              ref={(el) => { editInputRef.current = el }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
              onBlur={() => commitEdit()}
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )
      }
      if (field === 'priority') {
        return (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
            <select
              ref={(el) => { editInputRef.current = el }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
              onBlur={() => commitEdit()}
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
            >
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )
      }
      if (field === 'start_date' || field === 'due_date') {
        return (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
            <input
              ref={(el) => { editInputRef.current = el }}
              type="date"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
              onBlur={() => commitEdit()}
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
            />
          </div>
        )
      }
      if (field === 'description') {
        return (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
            <textarea
              ref={(el) => { editInputRef.current = el }}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); commitEdit() } }}
              onBlur={() => commitEdit()}
              rows={3}
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Ctrl+Enter 确认，点击外部确认</p>
          </div>
        )
      }
      if (field === 'progress_percent' || field === 'estimated_hours') {
        return (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
            <input
              ref={(el) => { editInputRef.current = el }}
              type="number"
              min={field === 'progress_percent' ? 0 : undefined}
              max={field === 'progress_percent' ? 100 : undefined}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
              onBlur={() => commitEdit()}
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
            />
          </div>
        )
      }
      return (
        <div>
          <label className="text-[10px] text-muted-foreground uppercase">{label}</label>
          <input
            ref={(el) => { editInputRef.current = el }}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
            onBlur={() => commitEdit()}
            className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )
    }

    return (
      <div
        onClick={() => startEditing(field, initialEditValue)}
        className="cursor-pointer hover:bg-accent/30 rounded px-1 -mx-1 py-0.5 transition-colors group"
        title="点击修改"
      >
        {children || (
          <>
            <label className="text-[10px] text-muted-foreground uppercase group-hover:text-foreground transition-colors">
              {label} <span className="opacity-0 group-hover:opacity-100 text-primary">✎</span>
            </label>
            <p className="text-xs">{displayValue || '未设置'}</p>
          </>
        )}
      </div>
    )
  }

  return (
    <aside ref={detailRef} className="border-l border-border bg-background flex flex-col h-full overflow-auto" style={{ width: 288, minWidth: 288, flexShrink: 0 }}>
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
            {currentLevelLabel}
          </span>
          <h3 className="text-sm font-semibold">任务详情</h3>
        </div>
        <button
          onClick={() => {
            setDetailPanelOpen(false)
            setSelectedTaskId(null)
          }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          关闭
        </button>
      </div>

      <div className="flex-1 p-3 space-y-4 overflow-auto">
        {/* Confirm Dialog */}
        {showConfirm && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 space-y-2">
            <p className="text-xs text-yellow-800">
              是否确认修改 <strong>{getFieldLabel(pendingField)}</strong>？
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmEdit}
                className="flex-1 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                确认修改
              </button>
              <button
                onClick={cancelEdit}
                className="flex-1 py-1 text-xs border border-yellow-300 rounded hover:bg-yellow-100"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Title */}
        <EditableField
          field="title"
          label="标题"
          displayValue={task.title}
          editValue={task.title}
        >
          <h4 className="text-sm font-semibold group-hover:text-primary transition-colors">
            {task.title}
            <span className="ml-1 opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground">✎</span>
          </h4>
        </EditableField>

        {/* Status & Priority badges */}
        <div className="flex gap-1.5 flex-wrap">
          <EditableField
            field="status"
            label="状态"
            displayValue={STATUS_LABELS[task.status]}
            editValue={task.status}
          >
            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_COLORS[task.status])}>
              {STATUS_LABELS[task.status]}
            </span>
          </EditableField>
          <EditableField
            field="priority"
            label="优先级"
            displayValue={PRIORITY_LABELS[task.priority]}
            editValue={task.priority}
          >
            <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_COLORS[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          </EditableField>
          {task.progress_percent > 0 && (
            <EditableField
              field="progress_percent"
              label="进度"
              displayValue={`${task.progress_percent}%`}
              editValue={String(task.progress_percent)}
            >
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">
                {task.progress_percent}%
              </span>
            </EditableField>
          )}
        </div>

        {/* Description */}
        <EditableField
          field="description"
          label="描述"
          displayValue={task.description || ''}
          editValue={task.description || ''}
        >
          <label className="text-[10px] text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            描述 <span className="opacity-0 group-hover:opacity-100 text-primary">✎</span>
          </label>
          <p className="text-xs mt-1 whitespace-pre-wrap">
            {task.description || '点击添加描述...'}
          </p>
        </EditableField>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <EditableField
            field="start_date"
            label="开始"
            displayValue={formatDate(task.start_date)}
            editValue={task.start_date || ''}
          />
          <EditableField
            field="due_date"
            label="截止"
            displayValue={formatDate(task.due_date)}
            editValue={task.due_date || ''}
          />
        </div>

        {/* Estimated hours */}
        <EditableField
          field="estimated_hours"
          label="预估工时"
          displayValue={task.estimated_hours ? `${task.estimated_hours} 小时` : ''}
          editValue={task.estimated_hours ? String(task.estimated_hours) : ''}
        />

        {/* Tags */}
        <EditableField
          field="tags"
          label="标签"
          displayValue={task.tags.join(', ')}
          editValue={task.tags.join(', ')}
        >
          <label className="text-[10px] text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            标签 <span className="opacity-0 group-hover:opacity-100 text-primary">✎</span>
          </label>
          {task.tags.length > 0 ? (
            <div className="flex gap-1 flex-wrap mt-1">
              {task.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">点击添加标签...</p>
          )}
        </EditableField>

        {/* Subtasks */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-muted-foreground uppercase">
              子任务 ({subtasks.length})
            </label>
            {canAddChild ? (
              <button
                onClick={handleAddChild}
                className="text-[10px] text-primary hover:underline"
              >
                + 添加
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                已达最深层级
              </span>
            )}
          </div>
          {subtasks.length > 0 ? (
            <ul className="space-y-1">
              {subtasks.map((st) => (
                <li
                  key={st.id}
                  className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-accent/50 cursor-pointer group"
                  onClick={() => setSelectedTaskId(st.id)}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      st.status === 'done' && 'bg-green-500',
                      st.status === 'in_progress' && 'bg-blue-500',
                      st.status === 'blocked' && 'bg-red-500',
                      st.status === 'todo' && 'bg-gray-300'
                    )}
                  />
                  <span className="flex-1 truncate">{st.title}</span>
                  {st.progress_percent > 0 && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {st.progress_percent}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">暂无子任务</p>
          )}
        </div>

        {/* Breadcrumb / Path */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase">层级路径</label>
          <TaskBreadcrumb
            taskId={task.id}
            tasks={tasks || []}
            onSelect={(id) => setSelectedTaskId(id)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <button
            onClick={handleDelete}
            className="flex-1 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
          >
            删除
          </button>
        </div>

        {/* Hint */}
        <p className="text-[10px] text-muted-foreground text-center">
          点击任意字段直接修改，回车或点击外部区域确认
        </p>
      </div>
    </aside>
  )
}

function TaskBreadcrumb({
  taskId,
  tasks,
  onSelect,
}: {
  taskId: string
  tasks: Task[]
  onSelect: (id: string) => void
}) {
  const getPath = (): Task[] => {
    const path: Task[] = []
    let current = tasks.find((t) => t.id === taskId)
    while (current) {
      path.unshift(current)
      current = current.parent_id ? tasks.find((t) => t.id === current!.parent_id) : undefined
    }
    return path
  }

  const path = getPath()

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {path.map((t, i) => (
        <div key={t.id} className="flex items-center gap-1">
          <button
            onClick={() => onSelect(t.id)}
            className="text-xs text-primary hover:underline truncate max-w-[100px]"
          >
            {t.title}
          </button>
          {i < path.length - 1 && (
            <span className="text-muted-foreground text-xs">/</span>
          )}
        </div>
      ))}
    </div>
  )
}
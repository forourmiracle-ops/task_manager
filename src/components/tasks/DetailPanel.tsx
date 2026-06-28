import { useState, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { cn, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, formatDate } from '@/lib/utils'
import type { Task, TaskStatus, TaskPriority } from '@/types'

const MAX_DEPTH = 4
type EditableField = 'title' | 'description' | 'status' | 'priority' | 'start_date' | 'due_date' | 'progress_percent' | 'estimated_hours' | 'tags'

export function DetailPanel() {
  const { selectedTaskId, setSelectedTaskId, detailPanelOpen, setDetailPanelOpen, startCreating } = useAppStore()
  const { data: tasks } = useTasks()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const rawTask = useMemo(() => {
    if (!tasks || !selectedTaskId) return null
    return tasks.find((t) => t.id === selectedTaskId) || null
  }, [tasks, selectedTaskId])

  const task = useMemo(() => {
    if (!rawTask) return null
    return {
      ...rawTask,
      tags: rawTask.tags || [],
      depends_on: rawTask.depends_on || [],
      children: rawTask.children || [],
    }
  }, [rawTask])

  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savedField, setSavedField] = useState<EditableField | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Refs to avoid stale closures
  const editingFieldRef = useRef<EditableField | null>(null)
  const editValueRef = useRef('')
  const taskRef = useRef<Task | null>(null)

  useEffect(() => { taskRef.current = task }, [task])
  useEffect(() => { editingFieldRef.current = editingField }, [editingField])
  useEffect(() => { editValueRef.current = editValue }, [editValue])

  // Reset editing state when task changes
  useEffect(() => {
    setEditingField(null)
    setEditValue('')
    setSavedField(null)
  }, [task?.id])

  // Auto-clear saved flash after 1.5s
  useEffect(() => {
    if (!savedField) return
    const timer = setTimeout(() => setSavedField(null), 1500)
    return () => clearTimeout(timer)
  }, [savedField])

  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDetailPanelOpen(false)
        setSelectedTaskId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setDetailPanelOpen, setSelectedTaskId])

  const buildPayload = (field: EditableField, value: string): Partial<Task> & { id: string } | null => {
    const t = taskRef.current
    if (!t) return null

    const payload: Partial<Task> & { id: string } = { id: t.id }
    let changed = false

    try {
      switch (field) {
        case 'title':
          if (value.trim() && value.trim() !== (t.title || '')) {
            payload.title = value.trim()
            changed = true
          }
          break
        case 'description':
          if (value !== (t.description || '')) {
            payload.description = value || ''
            changed = true
          }
          break
        case 'status':
          if (value && value !== t.status) {
            payload.status = value as TaskStatus
            changed = true
          }
          break
        case 'priority':
          if (value && value !== t.priority) {
            payload.priority = value as TaskPriority
            changed = true
          }
          break
        case 'start_date':
          if (value !== (t.start_date || '')) {
            payload.start_date = value || null
            changed = true
          }
          break
        case 'due_date':
          if (value !== (t.due_date || '')) {
            payload.due_date = value || null
            changed = true
          }
          break
        case 'progress_percent': {
          const num = Math.max(0, Math.min(100, Number(value) || 0))
          if (num !== (t.progress_percent || 0)) {
            payload.progress_percent = num
            changed = true
          }
          break
        }
        case 'estimated_hours': {
          const hours = value ? Number(value) : null
          if (hours !== (t.estimated_hours || null)) {
            payload.estimated_hours = hours
            changed = true
          }
          break
        }
        case 'tags': {
          const newTags = (value || '').split(',').map((s) => s.trim()).filter(Boolean)
          const currentTags = t.tags || []
          if (JSON.stringify(newTags) !== JSON.stringify(currentTags)) {
            payload.tags = newTags
            changed = true
          }
          break
        }
      }
    } catch (err) {
      console.error('buildPayload error:', err)
      return null
    }

    return changed ? payload : null
  }

  const commitEdit = (valueOverride?: string) => {
    try {
      const field = editingFieldRef.current
      // Use override (e.g. from select onChange) or fall back to ref
      const value = valueOverride ?? editValueRef.current
      if (!field) return

      const t = taskRef.current
      if (!t) { setEditingField(null); setEditValue(''); return }

      // Validate subtask dates against parent
      if ((field === 'start_date' || field === 'due_date') && t.parent_id && tasks) {
        const parent = tasks.find((p) => p.id === t.parent_id)
        if (parent) {
          if (field === 'start_date' && value && parent.start_date && value < parent.start_date) {
            setValidationError(`不能早于父任务开始日期（${parent.start_date}）`)
            return
          }
          if (field === 'due_date' && value && parent.due_date && value > parent.due_date) {
            setValidationError(`不能晚于父任务截止日期（${parent.due_date}）`)
            return
          }
          // Check start <= due cross-field
          const newStart = field === 'start_date' ? value : (t.start_date || '')
          const newDue = field === 'due_date' ? value : (t.due_date || '')
          if (newStart && newDue && newStart > newDue) {
            setValidationError('开始日期不能晚于截止日期')
            return
          }
        }
      }

      setValidationError(null)

      const payload = buildPayload(field, value)
      setEditingField(null)
      setEditValue('')

      if (payload) {
        updateTask.mutate(payload, {
          onSuccess: () => {
            setSavedField(field)
          },
          onError: (err) => {
            console.error('Save failed:', err)
          },
        })
      }
    } catch (err) {
      console.error('commitEdit error:', err)
      setEditingField(null)
      setEditValue('')
    }
  }

  // Click outside / Enter handler
  useEffect(() => {
    if (!editingField) return

    const handleMouseDown = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement
        if (target.closest('[data-detail-editor]')) return
        // For date fields, rely on onBlur instead of mousedown.
        // The native date picker popup renders in shadow DOM outside the
        // document flow, so clicks on its arrows/calendar would otherwise
        // trigger commitEdit and close the editor prematurely.
        const field = editingFieldRef.current
        if (field === 'start_date' || field === 'due_date') return
        commitEdit()
      } catch (err) {
        console.error('DetailPanel mouseDown error:', err)
        setEditingField(null)
        setEditValue('')
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitEdit()
        } else if (e.key === 'Escape') {
          setEditingField(null)
          setEditValue('')
        }
      } catch (err) {
        console.error('DetailPanel keyDown error:', err)
        setEditingField(null)
        setEditValue('')
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingField])

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
  const subtasks = tasks?.filter((t) => t.parent_id === task.id) || []
  const depthLabels = ['项目', '阶段', '任务组', '子任务']
  const currentLevelLabel = depthLabels[currentDepth] || `第${currentDepth + 1}层`

  const startEditing = (field: EditableField) => {
    if (!task) return
    try {
      // Commit any pending edit before switching to a new field
      if (editingFieldRef.current && editingFieldRef.current !== field) {
        commitEdit()
      }
      let value = ''
      switch (field) {
        case 'title': value = task.title || ''; break
        case 'description': value = task.description || ''; break
        case 'status': value = task.status || 'todo'; break
        case 'priority': value = task.priority || 'medium'; break
        case 'start_date': value = task.start_date || ''; break
        case 'due_date': value = task.due_date || ''; break
        case 'progress_percent': value = String(task.progress_percent || 0); break
        case 'estimated_hours': value = task.estimated_hours ? String(task.estimated_hours) : ''; break
        case 'tags': value = (task.tags || []).join(', '); break
      }
      setEditingField(field)
      setEditValue(value)
      setValidationError(null)
    } catch (err) {
      console.error('startEditing error:', err)
    }
  }

  const handleDelete = () => {
    if (!task) return
    try {
      if (confirm('确定删除此任务？子任务将一并删除。')) {
        deleteTask.mutate(task.id, {
          onSuccess: () => {
            setSelectedTaskId(null)
            setDetailPanelOpen(false)
          },
          onError: (err) => {
            console.error('Delete failed:', err)
          },
        })
      }
    } catch (err) {
      console.error('handleDelete error:', err)
    }
  }

  const renderFieldEditor = (field: EditableField) => {
    const baseClass = 'w-full px-2.5 py-1.5 text-sm border border-primary/40 rounded-md bg-background focus:outline-none focus:ring-1.5 focus:ring-primary'
    const val = editValue || ''

    switch (field) {
      case 'description':
        return (
          <textarea
            data-detail-editor
            autoFocus
            value={val}
            onChange={(e) => setEditValue(e.target.value)}
            rows={3}
            className={`${baseClass} resize-none`}
          />
        )
      case 'status':
        return (
          <select
            data-detail-editor
            autoFocus
            value={val}
            onChange={(e) => commitEdit(e.target.value)}
            className={baseClass}
          >
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )
      case 'priority':
        return (
          <select
            data-detail-editor
            autoFocus
            value={val}
            onChange={(e) => commitEdit(e.target.value)}
            className={baseClass}
          >
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )
      case 'start_date':
      case 'due_date':
        return (
          <div>
            <input
              data-detail-editor
              autoFocus
              type="date"
              value={val}
              onChange={(e) => { setEditValue(e.target.value); setValidationError(null) }}
              onBlur={() => commitEdit()}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitEdit() } }}
              className={cn(
                baseClass,
                !!validationError && 'border-red-400 focus:ring-red-400 bg-red-50/30'
              )}
            />
            {validationError && (
              <p className="text-[10px] text-red-500 mt-1 font-medium">{validationError}</p>
            )}
          </div>
        )
      case 'progress_percent':
      case 'estimated_hours':
        return (
          <input
            data-detail-editor
            autoFocus
            type="number"
            min={0}
            max={field === 'progress_percent' ? 100 : undefined}
            value={val}
            onChange={(e) => setEditValue(e.target.value)}
            className={baseClass}
          />
        )
      case 'tags':
        return (
          <input
            data-detail-editor
            autoFocus
            type="text"
            value={val}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="用逗号分隔"
            className={baseClass}
          />
        )
      default:
        return (
          <input
            data-detail-editor
            autoFocus
            type="text"
            value={val}
            onChange={(e) => setEditValue(e.target.value)}
            className={baseClass}
          />
        )
    }
  }

  const Field = ({
    label,
    field,
    children,
    fullWidth = false,
  }: {
    label: string
    field: EditableField
    children: React.ReactNode
    fullWidth?: boolean
  }) => {
    const isEditing = editingField === field
    const justSaved = savedField === field
    return (
      <div
        className={cn(
          'group rounded-xl border transition-all duration-300',
          fullWidth ? 'col-span-2' : '',
          justSaved
            ? 'border-green-400 bg-green-50/60'
            : isEditing
              ? 'border-primary/30 bg-background'
              : 'border-transparent hover:border-border hover:bg-muted/20'
        )}
        onClick={() => !isEditing && startEditing(field)}
      >
        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-3 pt-2.5 block cursor-pointer">
          {label}
          {justSaved && (
            <span className="ml-1.5 text-green-600 inline-flex items-center gap-0.5">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.8 4.2a.8.8 0 00-1.1 0L6 10.9l-2.7-2.7a.8.8 0 00-1.1 1.1l3.3 3.3a.8.8 0 001.1 0l7.2-7.2a.8.8 0 000-1.1z" />
              </svg>
              已保存
            </span>
          )}
        </label>
        <div className="px-3 pb-2.5">
          {isEditing ? renderFieldEditor(field) : (
            <div className="cursor-pointer min-h-[1.5em]">{children}</div>
          )}
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-700'
  const priorityColor = PRIORITY_COLORS[task.priority] || 'bg-gray-100 text-gray-600'
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

  return (
    <aside className="border-l border-border bg-background flex flex-col h-full overflow-auto shadow-elevated" style={{ width: 340, minWidth: 340, flexShrink: 0 }}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10 sticky top-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wide flex-shrink-0">
            {currentLevelLabel}
          </span>
          <h3 className="text-sm font-bold truncate">{task.title}</h3>
        </div>
        <button
          onClick={() => {
            setDetailPanelOpen(false)
            setSelectedTaskId(null)
          }}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors flex-shrink-0 ml-2"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Title & badges */}
        <div className="bg-muted/20 rounded-xl p-3 border border-border/50">
          <Field label="标题" field="title" fullWidth>
            <h4 className="text-base font-bold leading-tight">{task.title}</h4>
          </Field>
          <div className="flex gap-1.5 flex-wrap mt-2 px-1">
            <span
              className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity', statusColor)}
              onClick={() => startEditing('status')}
            >
              {STATUS_LABELS[task.status] || task.status}
            </span>
            <span
              className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer hover:opacity-80 transition-opacity', priorityColor)}
              onClick={() => startEditing('priority')}
            >
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
            {(task.progress_percent || 0) > 0 && (
              <span
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => startEditing('progress_percent')}
              >
                {task.progress_percent}%
              </span>
            )}
          </div>
        </div>

        {/* Grid fields */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="状态" field="status">
            <span className={cn('text-xs font-semibold', statusColor)}>{STATUS_LABELS[task.status] || task.status}</span>
          </Field>
          <Field label="优先级" field="priority">
            <span className={cn('text-xs font-semibold', priorityColor)}>{PRIORITY_LABELS[task.priority] || task.priority}</span>
          </Field>
          <Field label="开始日期" field="start_date">
            <p className="text-xs font-semibold">{formatDate(task.start_date) || <span className="text-muted-foreground font-normal">未设置</span>}</p>
          </Field>
          <Field label="截止日期" field="due_date">
            <p className={cn('text-xs font-semibold', isOverdue ? 'text-red-500' : '')}>
              {formatDate(task.due_date) || <span className="text-muted-foreground font-normal">未设置</span>}
            </p>
          </Field>
          <Field label="进度 %" field="progress_percent">
            <p className="text-xs font-semibold">{task.progress_percent || 0}%</p>
          </Field>
          <Field label="预估工时" field="estimated_hours">
            <p className="text-xs font-semibold">{task.estimated_hours ? `${task.estimated_hours} 小时` : <span className="text-muted-foreground font-normal">未设置</span>}</p>
          </Field>
        </div>

        <Field label="描述" field="description" fullWidth>
          {task.description ? (
            <p className="text-xs whitespace-pre-wrap leading-relaxed">{task.description}</p>
          ) : (
            <span className="text-xs text-muted-foreground">点击添加描述...</span>
          )}
        </Field>

        <Field label="标签" field="tags" fullWidth>
          {(task.tags || []).length > 0 ? (
            <div className="flex gap-1.5 flex-wrap">
              {task.tags!.map((tag: string) => (
                <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-background border border-border text-foreground">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">点击添加标签...</span>
          )}
        </Field>

        {/* Subtasks */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">子任务 ({subtasks.length})</label>
            {canAddChild ? (
              <button
                onClick={() => startCreating(task.id)}
                className="text-[10px] font-bold text-primary hover:underline"
              >
                + 添加
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">已达最深层级</span>
            )}
          </div>
          {subtasks.length > 0 ? (
            <ul className="space-y-1">
              {subtasks.map((st) => (
                <li
                  key={st.id}
                  className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg hover:bg-accent cursor-pointer group transition-colors"
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
                  {(st.progress_percent || 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{st.progress_percent}%</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">暂无子任务</p>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="rounded-xl border border-border/50 bg-muted/20 p-3.5">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">层级路径</label>
          <TaskBreadcrumb taskId={task.id} tasks={tasks || []} onSelect={(id) => setSelectedTaskId(id)} />
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-muted/10 space-y-2 sticky bottom-0 z-10">
        <button
          onClick={handleDelete}
          className="w-full py-2 text-xs font-bold border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          删除任务
        </button>
        <p className="text-[10px] text-muted-foreground text-center">
          点击任意字段即可编辑，失焦或回车自动保存
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
  const path = useMemo(() => {
    const result: Task[] = []
    let current = tasks.find((t) => t.id === taskId)
    while (current) {
      result.unshift(current)
      current = current.parent_id ? tasks.find((t) => t.id === current!.parent_id) : undefined
    }
    return result
  }, [taskId, tasks])

  if (path.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {path.map((t, i) => (
        <div key={t.id} className="flex items-center gap-1">
          <button
            onClick={() => onSelect(t.id)}
            className="text-xs text-primary hover:underline truncate max-w-[120px] font-semibold"
          >
            {t.title}
          </button>
          {i < path.length - 1 && <span className="text-muted-foreground text-xs">/</span>}
        </div>
      ))}
    </div>
  )
}
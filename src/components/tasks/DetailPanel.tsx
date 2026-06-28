import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useUpdateTask, useDeleteTask } from '@/hooks/useTasks'
import { cn, STATUS_LABELS, PRIORITY_LABELS, STATUS_COLORS, PRIORITY_COLORS, formatDate } from '@/lib/utils'
import type { Task } from '@/types'

const MAX_DEPTH = 4

export function DetailPanel() {
  const { selectedTaskId, setSelectedTaskId, detailPanelOpen, setDetailPanelOpen, startCreating } = useAppStore()
  const { data: tasks } = useTasks()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const rawTask = tasks?.find((t) => t.id === selectedTaskId)
  const task = useMemo(() => {
    if (!rawTask) return null
    return {
      ...rawTask,
      tags: rawTask.tags || [],
      depends_on: rawTask.depends_on || [],
      children: rawTask.children || [],
    }
  }, [rawTask])

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<Task>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (task) {
      setForm({ ...task })
      setIsEditing(false)
      setShowConfirm(false)
      setHasChanges(false)
    }
  }, [task?.id])

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

  const handleChange = (field: keyof Task, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    const payload: Partial<Task> & { id: string } = { id: task.id }
    if (form.title !== task.title) payload.title = form.title
    if (form.description !== task.description) payload.description = form.description || ''
    if (form.status !== task.status) payload.status = form.status
    if (form.priority !== task.priority) payload.priority = form.priority
    if (form.start_date !== task.start_date) payload.start_date = form.start_date || null
    if (form.due_date !== task.due_date) payload.due_date = form.due_date || null
    if (form.progress_percent !== task.progress_percent) {
      payload.progress_percent = Math.max(0, Math.min(100, Number(form.progress_percent) || 0))
    }
    if (form.estimated_hours !== task.estimated_hours) {
      payload.estimated_hours = form.estimated_hours ? Number(form.estimated_hours) : null
    }
    const newTags = (form.tags || []).map((s) => String(s).trim()).filter(Boolean)
    if (JSON.stringify(newTags) !== JSON.stringify(task.tags)) payload.tags = newTags

    if (Object.keys(payload).length <= 1) {
      setIsEditing(false)
      return
    }
    setShowConfirm(true)
  }

  const confirmSave = () => {
    const payload: Partial<Task> & { id: string } = { id: task.id }
    if (form.title !== task.title) payload.title = form.title
    if (form.description !== task.description) payload.description = form.description || ''
    if (form.status !== task.status) payload.status = form.status
    if (form.priority !== task.priority) payload.priority = form.priority
    if (form.start_date !== task.start_date) payload.start_date = form.start_date || null
    if (form.due_date !== task.due_date) payload.due_date = form.due_date || null
    if (form.progress_percent !== task.progress_percent) {
      payload.progress_percent = Math.max(0, Math.min(100, Number(form.progress_percent) || 0))
    }
    if (form.estimated_hours !== task.estimated_hours) {
      payload.estimated_hours = form.estimated_hours ? Number(form.estimated_hours) : null
    }
    const newTags = (form.tags || []).map((s) => String(s).trim()).filter(Boolean)
    if (JSON.stringify(newTags) !== JSON.stringify(task.tags)) payload.tags = newTags

    updateTask.mutate(payload, {
      onSuccess: () => {
        setShowConfirm(false)
        setIsEditing(false)
      },
      onError: () => {
        setShowConfirm(false)
      },
    })
  }

  const cancelSave = () => {
    setShowConfirm(false)
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

  return (
    <aside className="border-l border-border bg-background flex flex-col h-full overflow-auto shadow-card" style={{ width: 304, minWidth: 304, flexShrink: 0 }}>
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide">
            {currentLevelLabel}
          </span>
          <h3 className="text-sm font-semibold">任务详情</h3>
        </div>
        <button
          onClick={() => {
            setDetailPanelOpen(false)
            setSelectedTaskId(null)
          }}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Confirm Dialog */}
        {showConfirm && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2 shadow-sm">
            <p className="text-xs text-amber-800 font-medium">是否确认修改？</p>
            <p className="text-[10px] text-amber-700">保存后变更将同步到所有视图。</p>
            <div className="flex gap-2">
              <button
                onClick={confirmSave}
                className="flex-1 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium"
              >
                确认修改
              </button>
              <button
                onClick={cancelSave}
                className="flex-1 py-1.5 text-xs border border-amber-300 rounded-md hover:bg-amber-100 text-amber-800"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">标题</label>
              <input
                type="text"
                value={form.title || ''}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">描述</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1.5 focus:ring-ring resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">状态</label>
                <select
                  value={form.status || 'todo'}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">优先级</label>
                <select
                  value={form.priority || 'medium'}
                  onChange={(e) => handleChange('priority', e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">开始日期</label>
                <input
                  type="date"
                  value={form.start_date || ''}
                  onChange={(e) => handleChange('start_date', e.target.value || null)}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">截止日期</label>
                <input
                  type="date"
                  value={form.due_date || ''}
                  onChange={(e) => handleChange('due_date', e.target.value || null)}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">进度 %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent || 0}
                  onChange={(e) => handleChange('progress_percent', Number(e.target.value))}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">预估工时(h)</label>
                <input
                  type="number"
                  value={form.estimated_hours || ''}
                  onChange={(e) => handleChange('estimated_hours', e.target.value ? Number(e.target.value) : null)}
                  className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">标签</label>
              <input
                type="text"
                value={(form.tags || []).join(', ')}
                onChange={(e) =>
                  handleChange(
                    'tags',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="用逗号分隔"
                className="w-full mt-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
            </div>
          </div>
        ) : (
          <>
            <div>
              <h4 className="text-base font-bold leading-tight">{task.title}</h4>
              <div className="flex gap-1.5 flex-wrap mt-2">
                <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-medium', STATUS_COLORS[task.status])}>
                  {STATUS_LABELS[task.status]}
                </span>
                <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-medium', PRIORITY_COLORS[task.priority])}>
                  {PRIORITY_LABELS[task.priority]}
                </span>
                {task.progress_percent > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-100 text-blue-700">
                    {task.progress_percent}%
                  </span>
                )}
              </div>
            </div>

            {task.description && (
              <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">描述</label>
                <p className="text-xs mt-1 whitespace-pre-wrap leading-relaxed">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">开始</label>
                <p className="text-xs font-medium mt-1">{formatDate(task.start_date) || '未设置'}</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">截止</label>
                <p className="text-xs font-medium mt-1">{formatDate(task.due_date) || '未设置'}</p>
              </div>
            </div>

            {task.estimated_hours && (
              <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">预估工时</label>
                <p className="text-xs font-medium mt-1">{task.estimated_hours} 小时</p>
              </div>
            )}

            <div className="bg-muted/20 rounded-lg p-3 border border-border/50">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">标签</label>
              {task.tags.length > 0 ? (
                <div className="flex gap-1.5 flex-wrap mt-1.5">
                  {task.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-background border border-border text-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">暂无标签</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  子任务 ({subtasks.length})
                </label>
                {canAddChild ? (
                  <button
                    onClick={() => startCreating(task.id)}
                    className="text-[10px] font-medium text-primary hover:underline"
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
                      className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer group transition-colors"
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
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{st.progress_percent}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">暂无子任务</p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">层级路径</label>
              <TaskBreadcrumb taskId={task.id} tasks={tasks || []} onSelect={(id) => setSelectedTaskId(id)} />
            </div>
          </>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-border bg-muted/10 space-y-2">
        {isEditing ? (
          <div className="flex gap-2">
            <button
            onClick={() => { setIsEditing(false); setForm({ ...task }); setHasChanges(false); }}
            className="flex-1 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 shadow-sm transition-all"
          >
            保存
          </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="flex-1 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 shadow-sm transition-all"
            >
              编辑
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              删除
            </button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground text-center">
          点击编辑按钮修改任务，保存后弹出确认提示
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
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {path.map((t, i) => (
        <div key={t.id} className="flex items-center gap-1">
          <button
            onClick={() => onSelect(t.id)}
            className="text-xs text-primary hover:underline truncate max-w-[120px] font-medium"
          >
            {t.title}
          </button>
          {i < path.length - 1 && <span className="text-muted-foreground text-xs">/</span>}
        </div>
      ))}
    </div>
  )
}
import { useState, type FormEvent } from 'react'
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

  const task = tasks?.find((t) => t.id === selectedTaskId)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<Task>>({})

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

  const startEdit = () => {
    setForm({ ...task })
    setIsEditing(true)
  }

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    updateTask.mutate({ id: task.id, ...form } as Task & { id: string }, {
      onSuccess: () => setIsEditing(false),
    })
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

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const subtasks = tasks?.filter((t) => t.parent_id === task.id) || []

  const depthLabels = ['项目', '阶段', '任务组', '子任务']
  const currentLevelLabel = depthLabels[currentDepth] || `第${currentDepth + 1}层`

  return (
    <aside className="w-72 min-w-[288px] border-l border-border bg-background flex flex-col h-full overflow-auto">
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
        {isEditing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">标题</label>
              <input
                type="text"
                value={form.title || ''}
                onChange={(e) => updateField('title', e.target.value)}
                className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">描述</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">状态</label>
                <select
                  value={form.status || 'todo'}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">优先级</label>
                <select
                  value={form.priority || 'medium'}
                  onChange={(e) => updateField('priority', e.target.value)}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                >
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">开始日期</label>
                <input
                  type="date"
                  value={form.start_date || ''}
                  onChange={(e) => updateField('start_date', e.target.value || null)}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">截止日期</label>
                <input
                  type="date"
                  value={form.due_date || ''}
                  onChange={(e) => updateField('due_date', e.target.value || null)}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">进度 %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress_percent || 0}
                  onChange={(e) => updateField('progress_percent', Number(e.target.value))}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">预估工时</label>
                <input
                  type="number"
                  value={form.estimated_hours || ''}
                  onChange={(e) => updateField('estimated_hours', e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">标签</label>
              <input
                type="text"
                value={(form.tags || []).join(', ')}
                onChange={(e) =>
                  updateField(
                    'tags',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="用逗号分隔"
                className="w-full px-2 py-1 text-sm border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 py-1.5 text-xs border border-border rounded hover:bg-accent"
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Title & Status */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold flex-1">{task.title}</h4>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_COLORS[task.status])}>
                  {STATUS_LABELS[task.status]}
                </span>
                <span className={cn('px-1.5 py-0.5 rounded text-[10px]', PRIORITY_COLORS[task.priority])}>
                  {PRIORITY_LABELS[task.priority]}
                </span>
                {task.progress_percent > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">
                    {task.progress_percent}%
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">描述</label>
                <p className="text-xs mt-1 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">开始</label>
                <p className="text-xs">{formatDate(task.start_date) || '未设置'}</p>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">截止</label>
                <p className="text-xs">{formatDate(task.due_date) || '未设置'}</p>
              </div>
            </div>

            {/* Estimated hours */}
            {task.estimated_hours && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">预估工时</label>
                <p className="text-xs">{task.estimated_hours} 小时</p>
              </div>
            )}

            {/* Tags */}
            {task.tags.length > 0 && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">标签</label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {task.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                onClick={startEdit}
                className="flex-1 py-1.5 text-xs border border-border rounded hover:bg-accent"
              >
                编辑
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
              >
                删除
              </button>
            </div>
          </>
        )}
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
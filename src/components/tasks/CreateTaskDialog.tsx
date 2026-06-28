import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useAppStore } from '@/store'
import { useTasks, useCreateTask } from '@/hooks/useTasks'
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/utils'
import type { TaskStatus, TaskPriority } from '@/types'

export function CreateTaskDialog() {
  const { isCreating, creatingParentId, stopCreating } = useAppStore()
  const { data: tasks } = useTasks()
  const createTask = useCreateTask()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [progress, setProgress] = useState(0)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [tags, setTags] = useState('')

  const titleRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isCreating && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 50)
    }
  }, [isCreating])

  const parentTask = creatingParentId ? tasks?.find((t) => t.id === creatingParentId) : null
  const isSubtask = !!creatingParentId

  const resetForm = () => {
    setTitle('')
    setDescription('')
    setStartDate('')
    setDueDate('')
    setPriority('medium')
    setStatus('todo')
    setProgress(0)
    setEstimatedHours('')
    setTags('')
  }

  const handleSubmit = () => {
    if (!title.trim()) return
    createTask.mutate(
      {
        title: title.trim(),
        parent_id: creatingParentId,
        description: description.trim() || undefined,
        start_date: startDate || null,
        due_date: dueDate || null,
        priority,
        status,
        progress_percent: progress,
        estimated_hours: estimatedHours ? Number(estimatedHours) : null,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          resetForm()
          stopCreating()
        },
      }
    )
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === 'Escape') {
      stopCreating()
      resetForm()
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      stopCreating()
      resetForm()
    }
  }

  if (!isCreating) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-background/80 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 24px 60px -12px hsl(var(--foreground) / 0.18)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/10">
          <h3 className="text-sm font-bold">
            {isSubtask ? '新建子任务' : '新建项目'}
          </h3>
          <button
            onClick={() => { stopCreating(); resetForm() }}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Parent indicator */}
        {parentTask && (
          <div className="px-4 py-2.5 bg-primary/5 border-b border-border">
            <span className="text-[10px] text-primary font-medium">
              父级：{parentTask.title}
            </span>
          </div>
        )}

        {/* Form */}
        <div className="p-4 space-y-3.5 max-h-[60vh] overflow-auto">
          {/* Title */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              标题 <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入任务名称"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="可选描述"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring resize-none"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">截止日期</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
            </div>
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">优先级</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Progress + Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">进度 ({progress}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">预估工时(h)</label>
              <input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="可选"
                min={0}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">标签（逗号分隔）</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="如：重要, 前端, 紧急"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3.5 border-t border-border bg-muted/10">
          <button
            onClick={() => { stopCreating(); resetForm() }}
            className="flex-1 py-2 text-xs font-medium border border-border rounded-lg hover:bg-accent transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || createTask.isPending}
            className="flex-1 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 shadow-sm transition-all"
          >
            {createTask.isPending ? '创建中...' : '创建'}
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pb-2.5">
          Ctrl+Enter 快速创建 · Esc 取消
        </p>
      </div>
    </div>
  )
}
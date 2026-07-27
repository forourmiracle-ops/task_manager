import { useState, memo } from 'react'
import { useCreateTemplate } from '@/hooks/useTemplates'
import type { Task, TemplateContent } from '@/types'

interface SaveAsTemplateProps {
  open: boolean
  onClose: () => void
  task: Task | null
  /** Called after successful save with the target path */
  onSaved?: () => void
}

function extractTemplateContent(task: Task): TemplateContent {
  const content: TemplateContent = {
    version: 1,
    title: task.title,
    description: task.description || '',
    defaultValues: {
      priority: task.priority,
      status: 'todo',
      estimated_hours: task.estimated_hours ?? undefined,
      tags: task.tags.length > 0 ? task.tags : undefined,
    },
  }

  if (task.children && task.children.length > 0) {
    content.children = task.children.map(extractTemplateContent)
  }

  return content
}

const EMOJI_OPTIONS = ['📋', '📝', '💻', '🐛', '✨', '📊', '📈', '🎯', '🔧', '🚀', '✅', '⚠️']

export const SaveAsTemplate = memo(function SaveAsTemplate({
  open,
  onClose,
  task,
  onSaved,
}: SaveAsTemplateProps) {
  const createTemplate = useCreateTemplate()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('📋')

  if (!open || !task) return null

  const content = extractTemplateContent(task)
  const hasChildren = task.children && task.children.length > 0
  const defaultType = hasChildren ? 'project' : 'task'

  const handleSave = async () => {
    await createTemplate.mutateAsync({
      name: name || task.title,
      description: task.description || '',
      type: defaultType,
      icon,
      content,
    })
    onClose()
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl border border-border p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold mb-1">另存为模板</h2>
        <p className="text-xs text-muted-foreground mb-4">
          将当前任务的结构和字段预设保存为模板，方便日后复用
        </p>

        {/* Name */}
        <div className="mb-3">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            模板名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={task.title}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
          />
        </div>

        {/* Icon */}
        <div className="mb-3">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            图标
          </label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${
                  icon === emoji ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div className="mb-3">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            类型
          </label>
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
            {defaultType === 'project' ? '项目模板（含子任务层级）' : '任务模板'}
          </div>
        </div>

        {/* Preview */}
        <div className="mb-4">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
            结构预览
          </label>
          <div className="bg-muted/30 rounded-lg p-3 border border-border/50 max-h-32 overflow-auto">
            <div className="text-xs font-medium">{content.title}</div>
            {content.children?.map((child) => (
              <div key={child.title} className="text-xs text-muted-foreground ml-3 mt-0.5">
                └ {child.title}
                {child.children?.map((grandchild) => (
                  <div key={grandchild.title} className="ml-3">
                    └ {grandchild.title}
                  </div>
                ))}
              </div>
            ))}
            {content.children && content.children.length > 3 && (
              <div className="text-xs text-muted-foreground mt-1">
                ... 共 {content.children.length} 个子任务
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs border border-border rounded-lg hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={createTemplate.isPending}
            className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {createTemplate.isPending ? '保存中...' : '保存模板'}
          </button>
        </div>
      </div>
    </div>
  )
})
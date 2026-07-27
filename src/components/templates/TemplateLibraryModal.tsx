import { useState, memo } from 'react'
import { useTemplates } from '@/hooks/useTemplates'
import type { Template, TemplateType } from '@/types'

interface TemplateLibraryModalProps {
  open: boolean
  onClose: () => void
  onSelect: (template: Template) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
}

const TYPE_LABELS: Record<TemplateType, string> = {
  project: '项目模板',
  task: '任务模板',
  recurring: '重复任务',
}

export const TemplateLibraryModal = memo(function TemplateLibraryModal({
  open,
  onClose,
  onSelect,
  onDelete,
  onDuplicate,
}: TemplateLibraryModalProps) {
  const { data: templates } = useTemplates()
  const [search, setSearch] = useState('')
  const [activeType, setActiveType] = useState<TemplateType | 'all'>('all')
  const [previewId, setPreviewId] = useState<string | null>(null)

  if (!open) return null

  const filtered = (templates || []).filter((t) => {
    if (activeType !== 'all' && t.type !== activeType) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const preview = templates?.find((t) => t.id === previewId) || filtered[0]

  const renderPreview = (t: Template) => {
    const c = t.content
    if (t.type === 'project') {
      const renderTree = (node: typeof c, depth = 0) => (
        <div key={node.title} style={{ paddingLeft: depth * 16 }}>
          <div className="flex items-center gap-1.5 py-1">
            <span className="text-[10px] text-muted-foreground">📋</span>
            <span className="text-sm">{node.title}</span>
            {node.defaultValues && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {node.defaultValues.priority && `⚡${node.defaultValues.priority}`}
                {node.defaultValues.estimated_hours && ` ${node.defaultValues.estimated_hours}h`}
              </span>
            )}
          </div>
          {node.children?.map((child) => renderTree(child, depth + 1))}
        </div>
      )
      return (
        <div className="space-y-0.5">
          <div className="text-sm font-semibold mb-2">{c.title}</div>
          {c.children?.map((child) => renderTree(child, 1))}
        </div>
      )
    }
    if (t.type === 'recurring') {
      return (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{c.title}</div>
          <div className="text-xs text-muted-foreground">重复任务，按设置的频率自动生成</div>
          {c.children && (
            <div className="mt-2 space-y-0.5">
              {c.children.map((child) => (
                <div key={child.title} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>☐</span>
                  <span>{child.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">{c.title}</div>
        {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
        {c.defaultValues && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {c.defaultValues.priority && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{c.defaultValues.priority}</span>
            )}
            {c.defaultValues.status && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{c.defaultValues.status}</span>
            )}
            {c.defaultValues.tags?.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{tag}</span>
            ))}
            {c.defaultValues.estimated_hours && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{c.defaultValues.estimated_hours}h</span>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-background rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
        style={{ width: 'min(90vw, 720px)', height: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <h2 className="text-sm font-bold">模板库</h2>
          <div className="flex-1" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模板..."
            className="px-3 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring w-48"
          />
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left sidebar */}
          <div className="w-48 border-r border-border p-3 space-y-1 overflow-auto flex-shrink-0">
            <button
              onClick={() => { setActiveType('all'); setPreviewId(null) }}
              className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors ${
                activeType === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent'
              }`}
            >
              全部模板
            </button>
            {(['project', 'task', 'recurring'] as TemplateType[]).map((type) => (
              <button
                key={type}
                onClick={() => { setActiveType(type); setPreviewId(null) }}
                className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  activeType === type ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent'
                }`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Template list */}
          <div className="w-56 border-r border-border overflow-auto flex-shrink-0">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">暂无模板</div>
            ) : (
              filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPreviewId(t.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 border-b border-border/50 ${
                    preview?.id === t.id ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <span>{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">{t.scope === 'builtin' ? '内置' : '自定义'}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Preview + actions */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 p-4 overflow-auto">
              {preview ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{preview.icon}</span>
                    <div>
                      <div className="text-sm font-bold">{preview.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {TYPE_LABELS[preview.type]} · {preview.scope === 'builtin' ? '内置' : '自定义'}
                      </div>
                    </div>
                  </div>
                  {preview.description && (
                    <p className="text-xs text-muted-foreground mb-3">{preview.description}</p>
                  )}
                  <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                    {renderPreview(preview)}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  选择左侧模板查看预览
                </div>
              )}
            </div>
            {/* Actions */}
            {preview && (
              <div className="p-3 border-t border-border flex items-center gap-2">
                <button
                  onClick={() => { onSelect(preview); onClose() }}
                  className="px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                >
                  使用模板
                </button>
                {preview.scope === 'builtin' && onDuplicate && (
                  <button
                    onClick={() => onDuplicate(preview.id)}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent"
                  >
                    复制为自定义
                  </button>
                )}
                {preview.scope === 'custom' && onDelete && (
                  <button
                    onClick={() => onDelete(preview.id)}
                    className="px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 border border-border rounded-lg ml-auto"
                  >
                    删除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
import { useState, useRef, useEffect, memo } from 'react'
import { useTemplates } from '@/hooks/useTemplates'
import type { Template } from '@/types'

interface TemplateDropdownProps {
  onSelect: (template: Template | null) => void
  onBrowseAll: () => void
  selectedId?: string | null
}

const RECENT_TEMPLATES_KEY = 'taskflow-recent-templates'

function getRecentTemplateIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_TEMPLATES_KEY) || '[]')
  } catch {
    return []
  }
}

function addRecentTemplate(id: string) {
  const ids = getRecentTemplateIds().filter((i) => i !== id)
  ids.unshift(id)
  localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(ids.slice(0, 5)))
}

export const TemplateDropdown = memo(function TemplateDropdown({
  onSelect,
  onBrowseAll,
  selectedId,
}: TemplateDropdownProps) {
  const { data: templates } = useTemplates()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!templates) return null

  const recentIds = getRecentTemplateIds()
  const recent = templates.filter((t) => recentIds.includes(t.id))
  const taskTemplates = templates.filter((t) => t.type === 'task')
  const projectTemplates = templates.filter((t) => t.type === 'project')
  const selected = templates.find((t) => t.id === selectedId)

  const handleSelect = (t: Template | null) => {
    onSelect(t)
    if (t) addRecentTemplate(t.id)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
      >
        <span>{selected?.icon || '📋'}</span>
        <span>{selected ? `模板：${selected.name}` : '模板：无'}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-background border border-border rounded-xl shadow-lg z-50 py-1 overflow-hidden">
          {/* None option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
          >
            <span className="text-muted-foreground">✕</span>
            <span>不使用模板</span>
          </button>

          {/* Recent templates */}
          {recent.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                最近使用
              </div>
              {recent.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <span>{t.icon}</span>
                  <span>{t.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {t.type === 'project' ? '项目' : t.type === 'recurring' ? '重复' : '任务'}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Task templates */}
          {taskTemplates.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                任务模板
              </div>
              {taskTemplates.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <span>{t.icon}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </>
          )}

          {/* Project templates */}
          {projectTemplates.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                项目模板
              </div>
              {projectTemplates.slice(0, 5).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                >
                  <span>{t.icon}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </>
          )}

          {/* Browse all */}
          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onBrowseAll()
              }}
              className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h4v4H2V4zM10 4h4v4h-4V4zM2 10h4v4H2v-4zM10 10h4v4h-4v-4z" />
              </svg>
              <span>浏览全部模板库...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
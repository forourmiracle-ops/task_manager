import { useState, useMemo, useRef, useEffect } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { cn, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils'

interface DependencyPickerProps {
  taskId: string
  selected: string[]
  onChange: (dependsOn: string[]) => void
}

export function DependencyPicker({ taskId, selected, onChange }: DependencyPickerProps) {
  const { data: tasks = [] } = useTasks()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get all descendant IDs to exclude them (prevent circular deps)
  const descendantIds = useMemo(() => {
    const ids = new Set<string>()
    const walk = (id: string) => {
      tasks.filter((t) => t.parent_id === id).forEach((t) => {
        ids.add(t.id)
        walk(t.id)
      })
    }
    walk(taskId)
    return ids
  }, [taskId, tasks])

  // Filter available tasks: exclude self, descendants, and already-selected
  const available = useMemo(() => {
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.id !== taskId &&
        !descendantIds.has(t.id) &&
        t.title.toLowerCase().includes(q),
    )
  }, [tasks, taskId, descendantIds, search])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id]
    onChange(next)
  }

  const remove = (id: string) => {
    onChange(selected.filter((s) => s !== id))
  }

  const selectedTasks = useMemo(
    () => tasks.filter((t) => selected.includes(t.id)),
    [tasks, selected],
  )

  return (
    <div ref={containerRef} className="relative" data-detail-editor>
      {/* Selected chips */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {selectedTasks.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary"
          >
            {t.title}
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="hover:text-red-500 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="搜索依赖任务..."
        className="w-full px-2.5 py-1.5 text-xs border border-primary/30 rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          {available.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {search ? '无匹配任务' : '无可用任务'}
            </p>
          ) : (
            available.map((t) => {
              const isChecked = selected.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent transition-colors',
                    isChecked && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                      isChecked
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-muted-foreground/30',
                    )}
                  >
                    {isChecked && (
                      <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M13.8 4.2a.8.8 0 00-1.1 0L6 10.9l-2.7-2.7a.8.8 0 00-1.1 1.1l3.3 3.3a.8.8 0 001.1 0l7.2-7.2a.8.8 0 000-1.1z" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate flex-1">{t.title}</span>
                  <span
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0',
                      STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {STATUS_LABELS[t.status] || t.status}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
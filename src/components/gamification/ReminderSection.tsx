import { useState } from 'react'
import { useReminderStore } from '@/store/reminder-store'
import type { Task } from '@/types'

function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Reminder picker embedded in the task detail panel. Offers quick presets
 * relative to the due date (15 min / 1 hour / 1 day before) plus a custom
 * datetime. Reminders are stored locally and fire as in-app toasts +
 * browser notifications.
 */
export function ReminderSection({ task }: { task: Task }) {
  const reminder = useReminderStore((s) => s.reminders[task.id])
  const setReminder = useReminderStore((s) => s.setReminder)
  const clearReminder = useReminderStore((s) => s.clearReminder)
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')

  if (task.status === 'done') return null

  const dueMs = task.due_date ? new Date(`${task.due_date}T23:59:00`).getTime() : null

  const presets: Array<{ label: string; offsetMs: number }> = [
    { label: '截止前 15 分钟', offsetMs: 15 * 60_000 },
    { label: '截止前 1 小时', offsetMs: 60 * 60_000 },
    { label: '截止前 1 天', offsetMs: 24 * 60 * 60_000 },
  ]

  const applyPreset = (offsetMs: number) => {
    if (!dueMs) return
    const at = dueMs - offsetMs
    setReminder({ taskId: task.id, taskTitle: task.title, remindAt: new Date(at).toISOString() })
    setCustomOpen(false)
  }

  const applyCustom = () => {
    if (!customValue) return
    const at = new Date(customValue)
    if (Number.isNaN(at.getTime())) return
    setReminder({ taskId: task.id, taskTitle: task.title, remindAt: at.toISOString() })
    setCustomOpen(false)
  }

  return (
    <div className="bg-muted/20 rounded-xl border border-border/50 overflow-hidden">
      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">提醒</span>
      </div>
      <div className="px-3 pb-2.5 space-y-2">
        {reminder ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5 min-w-0">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="flex-shrink-0">
                <path d="M8 2a4 4 0 00-4 4c0 3-1 4-1.5 4.5h11C13 10 12 9 12 6a4 4 0 00-4-4z" />
                <path d="M6.5 13a1.5 1.5 0 003 0" />
              </svg>
              <span className="truncate">{new Date(reminder.remindAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <button
              onClick={() => clearReminder(task.id)}
              className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
            >
              清除
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.offsetMs)}
                  disabled={!dueMs}
                  className="px-2 py-1 text-[10px] font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={dueMs ? undefined : '先设置截止日期'}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => {
                  setCustomOpen((v) => !v)
                  if (!customValue) {
                    const fallback = dueMs ?? Date.now() + 60 * 60_000
                    setCustomValue(toLocalInputValue(new Date(fallback).toISOString()))
                  }
                }}
                className="px-2 py-1 text-[10px] font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
              >
                自定义
              </button>
            </div>
            {!dueMs && (
              <p className="text-[10px] text-muted-foreground">设置截止日期后可使用快捷提醒</p>
            )}
            {customOpen && (
              <div className="flex items-center gap-1.5">
                <input
                  type="datetime-local"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
                />
                <button
                  onClick={applyCustom}
                  disabled={!customValue}
                  className="px-2.5 py-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 transition-all flex-shrink-0"
                >
                  确定
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

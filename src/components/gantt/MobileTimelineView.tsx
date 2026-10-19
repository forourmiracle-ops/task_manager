import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'

const DAY_MS = 86400000
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#6b7280',
}

const STATUS_TEXT: Record<string, string> = {
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
  blocked: '已阻塞',
}

/** Parse "YYYY-MM-DD" as a LOCAL date (new Date(s) would be UTC) */
function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function mondayOfWeek(d: Date): Date {
  const s = startOfDay(d)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}

function fmtMD(d: Date): string {
  return `${d.getMonth() + 1}.${d.getDate()}`
}

interface WeekGroup {
  start: Date
  label: string
  tasks: Task[]
}

interface MobileTimelineViewProps {
  tasks: Task[]
  isLoading: boolean
  selectedTaskId: string | null
  onTaskClick: (id: string) => void
  /** Jump to the Today view (overdue tasks are handled there, not listed here) */
  onOpenToday: () => void
}

/**
 * Mobile-native replacement for the two-panel Gantt chart.
 * Vertical-scroll agenda: a slim overdue notice (detail lives in the Today
 * view), then 4 week-groups whose rows carry a mini bar positioned on a
 * shared Mon–Sun scale, then a plain "later" list.
 */
export function MobileTimelineView({ tasks, isLoading, selectedTaskId, onTaskClick, onOpenToday }: MobileTimelineViewProps) {
  const { overdue, weeks, later, todayDow } = useMemo(() => {
    const today = startOfDay(new Date())
    const monday = mondayOfWeek(today)
    const weekStarts = [0, 1, 2, 3].map((i) => new Date(monday.getTime() + i * 7 * DAY_MS))

    const overdue: Task[] = []
    const later: Task[] = []
    const weeks: WeekGroup[] = weekStarts.map((start, i) => ({
      start,
      label: i === 0 ? '本周' : i === 1 ? '下周' : `${fmtMD(start)} 起的一周`,
      tasks: [],
    }))

    for (const t of tasks) {
      const s = parseLocal(t.start_date!)
      const e = parseLocal(t.due_date!)
      if (t.status !== 'done' && e < today) {
        overdue.push(t)
        continue
      }
      let placed = false
      for (const w of weeks) {
        const wEnd = new Date(w.start.getTime() + 6 * DAY_MS)
        if (s <= wEnd && e >= w.start) {
          w.tasks.push(t)
          placed = true
          break
        }
      }
      // Past completed tasks that overlap no shown week are hidden —
      // the mobile timeline is forward-looking.
      if (!placed && e >= today) later.push(t)
    }

    // Overdue first by most-overdue; week groups by start date
    overdue.sort((a, b) => (a.due_date! < b.due_date! ? 1 : -1))
    for (const w of weeks) w.tasks.sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))

    return { overdue, weeks, later, todayDow: (today.getDay() + 6) % 7 }
  }, [tasks])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const isEmpty = overdue.length === 0 && later.length === 0 && weeks.every((w) => w.tasks.length === 0)
  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center bg-muted/20 rounded-2xl p-8 border border-dashed border-border">
          <p className="text-sm font-semibold text-foreground mb-1">暂无含日期的任务</p>
          <p className="text-xs text-muted-foreground">创建任务时设置开始和截止日期即可在时间线中显示</p>
        </div>
      </div>
    )
  }

  const today = startOfDay(new Date())

  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-3 pt-3 space-y-4" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
      {/* ── Overdue: slim notice only — the actionable list lives in the
             Today view ("近期任务"), no duplicated point-check list here ── */}
      {overdue.length > 0 && (
        <button
          onClick={onOpenToday}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-red-200/60 bg-red-50/40 text-left active:bg-red-50 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          <span className="flex-1 text-xs font-medium text-red-600">
            {overdue.length} 项任务已逾期
          </span>
          <span className="text-[10px] text-red-500 flex-shrink-0">去「今日」处理 →</span>
        </button>
      )}

      {/* ── Week groups with mini bars ──────────────────────────── */}
      {weeks.map((w) => {
        if (w.tasks.length === 0) return null
        const wEnd = new Date(w.start.getTime() + 6 * DAY_MS)
        return (
          <section key={w.start.getTime()}>
            <h3 className="text-xs font-bold text-foreground mb-1">
              {w.label}
              <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                {fmtMD(w.start)} – {fmtMD(wEnd)}
              </span>
            </h3>
            {/* Day-of-week scale header */}
            <div className="grid grid-cols-7 mb-1 px-1">
              {WEEKDAY_LABELS.map((label, i) => {
                const d = new Date(w.start.getTime() + i * DAY_MS)
                const isToday = i === todayDow && w.start.getTime() === mondayOfWeek(today).getTime()
                return (
                  <div key={i} className={cn('text-center', isToday && 'relative')}>
                    <span className={cn('text-[9px]', i >= 5 ? 'text-red-400/80' : 'text-muted-foreground/60')}>{label}</span>
                    <span className={cn('block text-[10px] leading-tight', isToday ? 'text-primary font-bold' : i >= 5 ? 'text-red-400' : 'text-muted-foreground')}>
                      {d.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="space-y-1.5">
              {w.tasks.map((t) => (
                <TimelineRow
                  key={t.id}
                  task={t}
                  weekStart={w.start}
                  isCurrentWeek={w.start.getTime() === mondayOfWeek(today).getTime()}
                  todayDow={todayDow}
                  selected={selectedTaskId === t.id}
                  onClick={() => onTaskClick(t.id)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* ── Later (beyond the 4-week window) ────────────────────── */}
      {later.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-muted-foreground mb-2">更晚 · {later.length}</h3>
          <div className="space-y-1.5">
            {later.map((t) => (
              <button
                key={t.id}
                onClick={() => onTaskClick(t.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors',
                  selectedTaskId === t.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card active:bg-accent/40',
                )}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium }} />
                <span className="flex-1 min-w-0 text-[13px] font-medium text-foreground truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {t.start_date!.slice(5).replace('-', '.')} 起
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** One task row inside a week group: title line + 7-column scale with the bar clipped to this week */
function TimelineRow({
  task,
  weekStart,
  isCurrentWeek,
  todayDow,
  selected,
  onClick,
}: {
  task: Task
  weekStart: Date
  isCurrentWeek: boolean
  todayDow: number
  selected: boolean
  onClick: () => void
}) {
  const s = parseLocal(task.start_date!)
  const e = parseLocal(task.due_date!)
  const clampedStart = Math.max(0, Math.round((s.getTime() - weekStart.getTime()) / DAY_MS))
  const clampedEnd = Math.min(6, Math.round((e.getTime() - weekStart.getTime()) / DAY_MS))
  const left = (clampedStart / 7) * 100
  const width = ((clampedEnd - clampedStart + 1) / 7) * 100
  const isDone = task.status === 'done'
  const progress = task.progress_percent || 0
  const isOverdue = !isDone && e < startOfDay(new Date())

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-2 rounded-xl border transition-colors',
        selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-card active:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn('flex-1 min-w-0 text-[13px] font-medium truncate', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
          {task.title}
        </span>
        <span className={cn(
          'text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0',
          isDone ? 'bg-muted/60 text-muted-foreground' : 'bg-primary/10 text-primary font-medium',
        )}>
          {STATUS_TEXT[task.status] || task.status}
        </span>
      </div>

      {/* 7-column shared scale with clipped bar */}
      <div className="relative h-6 rounded-md overflow-hidden bg-muted/20">
        <div className="absolute inset-0 grid grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={cn(
                'border-r border-border/30 last:border-r-0',
                i >= 5 && 'bg-red-50/30',
                isCurrentWeek && i === todayDow && 'bg-primary/10',
              )}
            />
          ))}
        </div>
        <div
          className={cn('absolute top-1 bottom-1 rounded-md', isOverdue && 'gantt-overdue-pulse')}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background: isDone ? '#9ca3af' : PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium,
            opacity: isDone ? 0.5 : 0.9,
          }}
        >
          {progress > 0 && !isDone && (
            <div className="absolute inset-y-0 left-0 rounded-l-md bg-white/35" style={{ width: `${progress}%` }} />
          )}
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
        <span>{task.start_date!.slice(5).replace('-', '.')} ~ {task.due_date!.slice(5).replace('-', '.')}</span>
        {!isDone && progress > 0 && <span>{progress}%</span>}
      </div>
    </button>
  )
}

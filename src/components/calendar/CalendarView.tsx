import { useState, useMemo } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { cn, STATUS_COLORS } from '@/lib/utils'
import type { Task } from '@/types'

// Chinese holidays 2026
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-05', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
])

function isHoliday(y: number, m: number, d: number): boolean {
  const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return HOLIDAYS_2026.has(ds)
}

function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6
}

type CalendarMode = 'month' | 'week' | 'day'

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

export function CalendarView() {
  const { setSelectedTaskId } = useAppStore()
  const { data: tasks } = useTasks()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [mode, setMode] = useState<CalendarMode>('month')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const tasksWithDates = useMemo(() => {
    if (!tasks) return []
    return tasks.filter((t) => t.start_date || t.due_date)
  }, [tasks])

  const getTasksForDate = (dateStr: string): Task[] => {
    return tasksWithDates.filter((t) => {
      if (!t.start_date && !t.due_date) return false
      const start = t.start_date || t.due_date!
      const end = t.due_date || t.start_date!
      return dateStr >= start && dateStr <= end
    })
  }

  const navigate = (delta: number) => {
    const d = new Date(currentDate)
    if (mode === 'month') {
      d.setMonth(d.getMonth() + delta)
    } else if (mode === 'week') {
      d.setDate(d.getDate() + delta * 7)
    } else {
      d.setDate(d.getDate() + delta)
    }
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  const titleText = () => {
    if (mode === 'month') return `${year}年${month + 1}月`
    if (mode === 'week') {
      const start = new Date(currentDate)
      start.setDate(start.getDate() - start.getDay())
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      return `${start.getMonth() + 1}月${start.getDate()}日 - ${end.getMonth() + 1}月${end.getDate()}日`
    }
    return `${year}年${month + 1}月${currentDate.getDate()}日`
  }

  const renderMonthView = () => {
    const firstDay = new Date(year, month, 1)
    const startDayOfWeek = firstDay.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevMonthDays = new Date(year, month, 0).getDate()

    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const cells: React.ReactNode[] = []

    // Previous month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i
      const m = month === 0 ? 12 : month
      const y = month === 0 ? year - 1 : year
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayTasks = getTasksForDate(dateStr)
      cells.push(
        <div key={`prev-${i}`} className="border-r border-b border-border bg-muted/20 p-1 min-h-[80px] opacity-50">
          <span className="text-[10px] text-muted-foreground">{day}</span>
          {dayTasks.slice(0, 2).map((t) => (
            <div
              key={t.id}
              className="text-[10px] truncate mt-0.5 px-1 py-0.5 rounded cursor-pointer hover:opacity-80"
              style={{ backgroundColor: getStatusColor(t.status) }}
              onClick={() => setSelectedTaskId(t.id)}
            >
              {t.title}
            </div>
          ))}
          {dayTasks.length > 2 && (
            <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 2}</span>
          )}
        </div>
      )
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const isToday = dateStr === todayStr
      const dayOfWeek = new Date(year, month, day).getDay()
      const weekend = isWeekend(dayOfWeek)
      const holiday = isHoliday(year, month + 1, day)
      const dayTasks = getTasksForDate(dateStr)

      cells.push(
        <div
          key={day}
          className={cn(
            'border-r border-b border-border p-1 min-h-[80px] hover:bg-accent/20 transition-colors',
            isToday && 'bg-blue-50/60',
            !isToday && weekend && !holiday && 'bg-red-50/20',
            !isToday && holiday && 'bg-amber-50/40'
          )}
        >
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'text-[10px] w-5 h-5 flex items-center justify-center rounded-full',
                isToday && 'bg-blue-500 text-white font-bold',
                !isToday && weekend && 'text-red-400',
                !isToday && holiday && 'text-amber-600',
                !isToday && !weekend && !holiday && 'text-muted-foreground'
              )}
            >
              {day}
            </span>
            {holiday && <span className="text-[9px] text-amber-500">休</span>}
          </div>
          <div className="space-y-0.5 mt-1">
            {dayTasks.slice(0, 3).map((t) => (
              <div
                key={t.id}
                className="text-[10px] truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-80 text-white"
                style={{ backgroundColor: getStatusColor(t.status) }}
                onClick={() => setSelectedTaskId(t.id)}
                title={`${t.title}\n${t.start_date || ''} → ${t.due_date || ''}`}
              >
                {t.title}
              </div>
            ))}
            {dayTasks.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{dayTasks.length - 3} 更多</span>
            )}
          </div>
        </div>
      )
    }

    // Fill remaining cells
    const totalCells = startDayOfWeek + daysInMonth
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
    for (let i = 1; i <= remaining; i++) {
      const m = month === 11 ? 1 : month + 2
      const y = month === 11 ? year + 1 : year
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      const dayTasks = getTasksForDate(dateStr)
      cells.push(
        <div key={`next-${i}`} className="border-r border-b border-border bg-muted/20 p-1 min-h-[80px] opacity-50">
          <span className="text-[10px] text-muted-foreground">{i}</span>
          {dayTasks.slice(0, 2).map((t) => (
            <div
              key={t.id}
              className="text-[10px] truncate mt-0.5 px-1 py-0.5 rounded cursor-pointer hover:opacity-80"
              style={{ backgroundColor: getStatusColor(t.status) }}
              onClick={() => setSelectedTaskId(t.id)}
            >
              {t.title}
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-7">
        {WEEKDAY_NAMES.map((name, i) => (
          <div
            key={name}
            className={cn(
              'text-center text-xs py-1.5 border-b border-border font-medium',
              i === 0 || i === 6 ? 'text-red-400' : 'text-muted-foreground'
            )}
          >
            {name}
          </div>
        ))}
        {cells}
      </div>
    )
  }

  const renderWeekView = () => {
    const startOfWeek = new Date(currentDate)
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const days: React.ReactNode[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek)
      d.setDate(d.getDate() + i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const isToday = dateStr === todayStr
      const weekend = isWeekend(d.getDay())
      const holiday = isHoliday(d.getFullYear(), d.getMonth() + 1, d.getDate())
      const dayTasks = getTasksForDate(dateStr)

      days.push(
        <div
          key={i}
          className={cn(
            'flex-1 border-r border-border last:border-r-0 p-1 min-h-[200px]',
            isToday && 'bg-blue-50/60',
            !isToday && weekend && !holiday && 'bg-red-50/20',
            !isToday && holiday && 'bg-amber-50/40'
          )}
        >
          <div className="flex items-center gap-1 mb-1">
            <span
              className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                isToday && 'bg-blue-500 text-white',
                !isToday && weekend && 'text-red-400',
                !isToday && holiday && 'text-amber-600'
              )}
            >
              {d.getDate()}
            </span>
            <span className={cn('text-[10px]', weekend ? 'text-red-400' : 'text-muted-foreground')}>
              {WEEKDAY_NAMES[d.getDay()]}
            </span>
            {holiday && <span className="text-[9px] text-amber-500">休</span>}
          </div>
          {dayTasks.map((t) => (
            <div
              key={t.id}
              className="text-[10px] truncate px-1 py-0.5 rounded cursor-pointer hover:opacity-80 text-white mb-0.5"
              style={{ backgroundColor: getStatusColor(t.status) }}
              onClick={() => setSelectedTaskId(t.id)}
              title={`${t.title}\n${t.start_date || ''} → ${t.due_date || ''}`}
            >
              {t.title}
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="flex flex-1">
        {days}
      </div>
    )
  }

  const renderDayView = () => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    const dayTasks = getTasksForDate(dateStr)
    const dayOfWeek = currentDate.getDay()
    const weekend = isWeekend(dayOfWeek)
    const holiday = isHoliday(year, month + 1, currentDate.getDate())

    return (
      <div className="flex-1 p-4 space-y-3 overflow-auto">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium',
            weekend && 'text-red-400',
            holiday && 'text-amber-600'
          )}>
            {WEEKDAY_NAMES[dayOfWeek]}曜日
          </span>
          {holiday && <span className="text-xs text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">假日</span>}
        </div>
        {dayTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">当天无任务</p>
        ) : (
          dayTasks.map((t) => (
            <div
              key={t.id}
              className="p-2 border border-border rounded-lg cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setSelectedTaskId(t.id)}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', getStatusDot(t.status))} />
                <span className="text-sm font-medium">{t.title}</span>
                <span className={cn('px-1.5 py-0.5 rounded text-[10px]', STATUS_COLORS[t.status])}>
                  {t.status === 'todo' ? '待办' : t.status === 'in_progress' ? '进行中' : t.status === 'done' ? '已完成' : '已阻塞'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t.start_date || '?'} → {t.due_date || '?'}
                {t.progress_percent > 0 && ` · ${t.progress_percent}%`}
              </p>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="text-xs px-1.5 py-0.5 hover:bg-accent rounded">◀</button>
          <span className="text-sm font-medium">{titleText()}</span>
          <button onClick={() => navigate(1)} className="text-xs px-1.5 py-0.5 hover:bg-accent rounded">▶</button>
          <button onClick={goToday} className="text-xs px-2 py-0.5 border border-border rounded hover:bg-accent">今天</button>
        </div>
        <div className="flex gap-0.5">
          {(['month', 'week', 'day'] as CalendarMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2 py-0.5 text-xs rounded',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {m === 'month' ? '月' : m === 'week' ? '周' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-border text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-50/40 border border-red-200" /> 周末
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-50/50 border border-amber-200" /> 假日
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-50/60 border border-blue-200" /> 今天
        </span>
      </div>

      {/* Calendar content */}
      {mode === 'month' && renderMonthView()}
      {mode === 'week' && renderWeekView()}
      {mode === 'day' && renderDayView()}
    </div>
  )
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'done': return '#22c55e'
    case 'in_progress': return '#3b82f6'
    case 'blocked': return '#ef4444'
    case 'todo': return '#9ca3af'
    default: return '#9ca3af'
  }
}

function getStatusDot(status: string): string {
  switch (status) {
    case 'done': return 'bg-green-500'
    case 'in_progress': return 'bg-blue-500'
    case 'blocked': return 'bg-red-500'
    case 'todo': return 'bg-gray-300'
    default: return 'bg-gray-300'
  }
}
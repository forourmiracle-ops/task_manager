import { useMemo, useRef, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import type { Task } from '@/types'

const DAY_WIDTH = 40
const ROW_HEIGHT = 32
const HEADER_HEIGHT = 60
const LABEL_WIDTH = 200
const MONTH_HEADER_HEIGHT = 24

// Chinese holidays 2026 (simplified - major holidays)
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // 元旦
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // 春节
  '2026-04-05', // 清明节
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', // 劳动节
  '2026-06-19', '2026-06-20', '2026-06-21', // 端午节
  '2026-09-25', '2026-09-26', '2026-09-27', // 中秋节
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', // 国庆节
])

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function isHoliday(date: Date): boolean {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return HOLIDAYS_2026.has(`${y}-${m}-${d}`)
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

interface MonthHeader {
  label: string
  startDay: number
  days: number
}

export function GanttView() {
  const { selectedTaskId, setSelectedTaskId } = useAppStore()
  const { data: tasks, isLoading } = useTasks()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewMonths, setViewMonths] = useState(3) // default 3 months view

  const flatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  const { startDate, totalDays, monthHeaders, todayOffset } = useMemo(() => {
    if (flatTasks.length === 0) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const start = new Date(today)
      start.setMonth(start.getMonth() - 1)
      const end = new Date(today)
      end.setMonth(end.getMonth() + viewMonths)
      const total = daysBetween(start, end) + 1
      const months = buildMonthHeaders(start, end)
      const offset = daysBetween(start, today)
      return { startDate: start, endDate: end, totalDays: total, monthHeaders: months, todayOffset: offset }
    }

    let start = new Date(flatTasks[0].start_date!)
    let end = new Date(flatTasks[0].due_date!)
    for (const t of flatTasks) {
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      if (s < start) start = s
      if (e > end) end = e
    }
    // Add padding
    start.setDate(start.getDate() - 2)
    end.setDate(end.getDate() + 2)

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (today < start) start = new Date(today)
    if (today > end) end = new Date(today)

    const total = daysBetween(start, end) + 1
    const months = buildMonthHeaders(start, end)
    const offset = daysBetween(start, today)
    return { startDate: start, endDate: end, totalDays: total, monthHeaders: months, todayOffset: offset }
  }, [flatTasks, viewMonths])

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current && totalDays > 0) {
      const scrollLeft = todayOffset * DAY_WIDTH - 200
      scrollRef.current.scrollLeft = Math.max(0, scrollLeft)
    }
  }, [totalDays, todayOffset])

  const totalWidth = totalDays * DAY_WIDTH

  const getTaskBarStyle = (task: Task) => {
    const s = new Date(task.start_date!)
    const e = new Date(task.due_date!)
    const left = daysBetween(startDate, s) * DAY_WIDTH
    const width = Math.max((daysBetween(s, e) + 1) * DAY_WIDTH, DAY_WIDTH)
    return { left, width }
  }

  const renderDayHeaders = () => {
    const headers: React.ReactNode[] = []
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const weekend = isWeekend(d)
      const holiday = isHoliday(d)
      const isToday = i === todayOffset

      headers.push(
        <div
          key={i}
          className={cn(
            'flex-shrink-0 flex flex-col items-center justify-center border-r border-border',
            weekend && !holiday && 'bg-red-50/30',
            holiday && 'bg-amber-50/50',
            isToday && 'bg-blue-50/60'
          )}
          style={{ width: DAY_WIDTH, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }}
        >
          <span
            className={cn(
              'text-[10px]',
              isToday
                ? 'text-blue-600 font-bold'
                : weekend
                  ? 'text-red-400'
                  : holiday
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
            )}
          >
            {d.getDate()}
          </span>
          <span
            className={cn(
              'text-[9px]',
              isToday
                ? 'text-blue-600 font-bold'
                : weekend
                  ? 'text-red-400'
                  : holiday
                    ? 'text-amber-600'
                    : 'text-muted-foreground'
            )}
          >
            {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
          </span>
          {holiday && (
            <span className="text-[8px] text-amber-500 leading-none">休</span>
          )}
        </div>
      )
    }
    return headers
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-xs text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (flatTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">暂无含日期的任务</p>
          <p className="text-xs text-muted-foreground">创建任务时设置开始日期和截止日期即可在甘特图中显示</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* View controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border">
        <span className="text-xs text-muted-foreground">显示范围：</span>
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            onClick={() => setViewMonths(m)}
            className={cn(
              'px-2 py-0.5 text-xs rounded',
              viewMonths === m
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {m}个月
          </button>
        ))}
        <button
          className="px-2 py-0.5 text-xs text-primary hover:bg-accent rounded"
          onClick={() => {
            if (scrollRef.current && todayOffset >= 0) {
              scrollRef.current.scrollLeft = todayOffset * DAY_WIDTH - 200
            }
          }}
        >
          回到今天
        </button>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div style={{ minWidth: LABEL_WIDTH + totalWidth }}>
          {/* Month headers */}
          <div className="flex border-b border-border sticky top-0 z-10 bg-background">
            <div className="flex-shrink-0 border-r border-border bg-muted/30" style={{ width: LABEL_WIDTH, height: MONTH_HEADER_HEIGHT }}>
              <span className="text-[10px] text-muted-foreground px-2 leading-6">任务</span>
            </div>
            <div className="flex">
              {monthHeaders.map((mh, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 flex items-center justify-center border-r border-border bg-muted/20 font-medium text-xs"
                  style={{ width: mh.days * DAY_WIDTH, height: MONTH_HEADER_HEIGHT }}
                >
                  {mh.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day headers */}
          <div className="flex border-b border-border sticky top-[24px] z-10 bg-background">
            <div className="flex-shrink-0 border-r border-border bg-muted/30" style={{ width: LABEL_WIDTH, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }} />
            <div className="flex">{renderDayHeaders()}</div>
          </div>

          {/* Today line */}
          {todayOffset >= 0 && todayOffset < totalDays && (
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none"
              style={{
                left: LABEL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                width: 2,
              }}
            >
              <div className="h-full w-full bg-red-500 opacity-80" />
              <div
                className="absolute top-0 text-[10px] font-bold text-red-500 whitespace-nowrap"
                style={{ transform: 'translateX(-50%)', marginTop: 2 }}
              >
                今天
              </div>
            </div>
          )}

          {/* Task rows */}
          <div className="relative">
            {flatTasks.map((task, idx) => {
              const { left, width } = getTaskBarStyle(task)
              const isSelected = selectedTaskId === task.id
              const progressPercent = task.progress_percent || 0
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

              // Get color based on status
              const barColor = (() => {
                switch (task.status) {
                  case 'done': return 'bg-green-500'
                  case 'in_progress': return 'bg-blue-500'
                  case 'blocked': return 'bg-red-500'
                  default: return 'bg-gray-400'
                }
              })()

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex border-b border-border hover:bg-accent/30 transition-colors',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Task label */}
                  <div
                    className="flex-shrink-0 border-r border-border flex items-center px-2 gap-1.5 cursor-pointer"
                    style={{ width: LABEL_WIDTH }}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        task.status === 'done' && 'bg-green-500',
                        task.status === 'in_progress' && 'bg-blue-500',
                        task.status === 'blocked' && 'bg-red-500',
                        task.status === 'todo' && 'bg-gray-300'
                      )}
                    />
                    <span className="text-xs truncate flex-1">
                      {task.title}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] text-red-500 flex-shrink-0">逾期</span>
                    )}
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative" style={{ width: totalWidth }}>
                    {/* Weekend shading */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(startDate)
                      d.setDate(d.getDate() + i)
                      const weekend = isWeekend(d)
                      const holiday = isHoliday(d)
                      if (!weekend && !holiday) return null
                      return (
                        <div
                          key={i}
                          className={cn(
                            'absolute top-0 bottom-0',
                            holiday ? 'bg-amber-50/30' : 'bg-red-50/20'
                          )}
                          style={{
                            left: i * DAY_WIDTH,
                            width: DAY_WIDTH,
                          }}
                        />
                      )
                    })}

                    {/* Task bar */}
                    {left >= 0 && (
                      <div
                        className={cn(
                          'absolute top-1 bottom-1 rounded cursor-pointer transition-opacity hover:opacity-80 group',
                          barColor,
                          isSelected && 'ring-2 ring-offset-1 ring-primary'
                        )}
                        style={{ left, width: Math.max(width, 4) }}
                        onClick={() => setSelectedTaskId(task.id)}
                        title={`${task.title}\n${task.start_date} → ${task.due_date}\n进度: ${progressPercent}%`}
                      >
                        {/* Progress fill */}
                        {progressPercent > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 rounded-l bg-white/30"
                            style={{ width: `${progressPercent}%` }}
                          />
                        )}
                        {/* Label */}
                        <span className="absolute inset-0 flex items-center px-1 text-[10px] text-white truncate drop-shadow-sm">
                          {task.title}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildMonthHeaders(start: Date, end: Date): MonthHeader[] {
  const result: MonthHeader[] = []
  const current = new Date(start.getFullYear(), start.getMonth(), 1)

  while (current <= end) {
    const year = current.getFullYear()
    const month = current.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // Calculate startDay relative to the global start date
    const monthStart = new Date(year, month, 1)
    const startDay = daysBetween(start, monthStart)

    result.push({
      label: `${year}年${month + 1}月`,
      startDay: Math.max(0, startDay),
      days: daysInMonth,
    })

    // Safe month increment: set to 1st of next month
    current.setMonth(current.getMonth() + 1)
  }

  return result
}
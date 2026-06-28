import { useMemo, useRef, useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import type { Task } from '@/types'

// Chinese holidays 2026
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-05', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21', '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
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
  const aStart = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bStart = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bStart.getTime() - aStart.getTime()) / (1000 * 60 * 60 * 24))
}

interface MonthHeader {
  label: string
  days: number
}

function buildMonthHeaders(start: Date, end: Date): MonthHeader[] {
  const result: MonthHeader[] = []
  const totalDays = daysBetween(start, end)
  let i = 0
  while (i <= totalDays) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const year = d.getFullYear()
    const month = d.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const remainingInMonth = daysInMonth - d.getDate() + 1
    const remainingTotal = totalDays - i + 1
    const visibleDays = Math.min(remainingInMonth, remainingTotal)
    result.push({ label: `${year}年${month + 1}月`, days: visibleDays })
    i += visibleDays
  }
  return result
}

function overlapsRange(start: string, due: string, rangeStart: Date, rangeEnd: Date): boolean {
  const s = new Date(start)
  const e = new Date(due)
  return s <= rangeEnd && e >= rangeStart
}

export function GanttView() {
  const { selectedTaskId, setSelectedTaskId, fontSize } = useAppStore()
  const { data: tasks, isLoading } = useTasks()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewMonths, setViewMonths] = useState(3)

  // Scale dimensions by font size (1-8). At 4 -> 1.0
  const scale = useMemo(() => 0.85 + (fontSize - 1) * 0.065, [fontSize])
  const DAY_WIDTH = useMemo(() => Math.round(40 * scale), [scale])
  const ROW_HEIGHT = useMemo(() => Math.round(36 * scale), [scale])
  const LABEL_WIDTH = useMemo(() => Math.round(260 * scale), [scale])
  const HEADER_HEIGHT = useMemo(() => Math.round(66 * scale), [scale])
  const MONTH_HEADER_HEIGHT = useMemo(() => Math.round(28 * scale), [scale])

  const allFlatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  const { startDate, endDate, totalDays, monthHeaders, todayOffset } = useMemo<{
    startDate: Date
    endDate: Date
    totalDays: number
    monthHeaders: MonthHeader[]
    todayOffset: number
  }>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let start = new Date(today)
    start.setMonth(start.getMonth() - 1)
    let end = new Date(start)
    end.setMonth(end.getMonth() + viewMonths + 1)

    for (const t of allFlatTasks) {
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      if (s < start) start = new Date(s)
      if (e > end) end = new Date(e)
    }

    start.setDate(start.getDate() - 2)
    end.setDate(end.getDate() + 2)

    const total = daysBetween(start, end) + 1
    const months = buildMonthHeaders(start, end)
    const offset = daysBetween(start, today)
    return { startDate: start, endDate: end, totalDays: total, monthHeaders: months, todayOffset: offset }
  }, [allFlatTasks, viewMonths])

  // Filter visible tasks by date overlap, then rebuild a visible tree preserving hierarchy
  const visibleTasks = useMemo(() => {
    const visibleIds = new Set(
      allFlatTasks
        .filter((t) => overlapsRange(t.start_date!, t.due_date!, startDate, endDate))
        .map((t) => t.id)
    )

    const map = new Map<string, Task & { children?: Task[] }>()
    allFlatTasks.forEach((t) => {
      if (visibleIds.has(t.id)) {
        map.set(t.id, { ...t, children: [] })
      }
    })

    const roots: Task[] = []
    map.forEach((node) => {
      if (node.parent_id && map.has(node.parent_id)) {
        const parent = map.get(node.parent_id)!
        parent.children = parent.children || []
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    })

    return flattenTasks(roots)
  }, [allFlatTasks, startDate, endDate])

  // Scroll to today on first load / when view range changes
  useEffect(() => {
    if (scrollRef.current && totalDays > 0) {
      const scrollLeft = todayOffset * DAY_WIDTH - 200
      scrollRef.current.scrollLeft = Math.max(0, scrollLeft)
    }
  }, [totalDays, todayOffset, DAY_WIDTH])

  const totalWidth = totalDays * DAY_WIDTH

  const getTaskBarStyle = (task: Task) => {
    const s = new Date(task.start_date!)
    const e = new Date(task.due_date!)
    const left = daysBetween(startDate, s) * DAY_WIDTH
    const width = Math.max((daysBetween(s, e) + 1) * DAY_WIDTH, 4)
    return { left, width }
  }

  const handleTaskClick = (id: string) => {
    try {
      setSelectedTaskId(id)
    } catch (err) {
      console.error('Gantt click error:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (allFlatTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center bg-muted/20 rounded-2xl p-8 border border-dashed border-border">
          <p className="text-sm font-medium text-foreground mb-1">暂无含日期的任务</p>
          <p className="text-xs text-muted-foreground">创建任务时设置开始和截止日期即可在甘特图中显示</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/10 flex-shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">时间范围</span>
        {[1, 3, 6, 12].map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setViewMonths(m)}
            className={cn(
              'px-3 py-1 text-[11px] rounded-full font-medium transition-all',
              viewMonths === m
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {m}个月
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          className="px-3 py-1 text-[11px] font-medium text-primary border border-primary/20 rounded-full hover:bg-primary/5 transition-colors"
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
      <div className="flex-1 overflow-auto relative" ref={scrollRef}>
        <div style={{ minWidth: LABEL_WIDTH + totalWidth }}>
          {/* Month headers */}
          <div className="flex border-b border-border sticky top-0 z-20 bg-muted/10">
            <div
              className="flex-shrink-0 border-r border-border flex items-center px-3 sticky left-0 z-30 bg-muted/10"
              style={{ width: LABEL_WIDTH, height: MONTH_HEADER_HEIGHT }}
            >
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">任务</span>
            </div>
            <div className="flex">
              {monthHeaders.map((mh, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 flex items-center justify-center border-r border-border font-bold text-[11px] text-foreground/80"
                  style={{ width: mh.days * DAY_WIDTH, height: MONTH_HEADER_HEIGHT, minWidth: mh.days * DAY_WIDTH }}
                >
                  {mh.label}
                </div>
              ))}
            </div>
          </div>

          {/* Day headers */}
          <div className="flex border-b border-border sticky z-20 bg-background" style={{ top: MONTH_HEADER_HEIGHT }}>
            <div
              className="flex-shrink-0 border-r border-border sticky left-0 z-30 bg-background"
              style={{ width: LABEL_WIDTH, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }}
            />
            <div className="flex">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(startDate)
                d.setDate(d.getDate() + i)
                const w = isWeekend(d)
                const h = isHoliday(d)
                const isToday = i === todayOffset
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex-shrink-0 flex flex-col items-center justify-center border-r border-border/60',
                      w && !h && 'bg-red-50/20',
                      h && 'bg-amber-50/30',
                      isToday && 'bg-blue-50/50'
                    )}
                    style={{ width: DAY_WIDTH, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }}
                  >
                    <span className={cn('text-[11px] font-semibold leading-tight', isToday ? 'text-blue-600' : w ? 'text-red-400' : h ? 'text-amber-600' : 'text-foreground/60')}>
                      {d.getDate()}
                    </span>
                    <span className={cn('text-[9px] leading-tight', isToday ? 'text-blue-500 font-semibold' : w ? 'text-red-300' : h ? 'text-amber-500' : 'text-muted-foreground/60')}>
                      {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
                    </span>
                    {h && <span className="text-[8px] text-amber-500 leading-none mt-0.5">休</span>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Today marker line */}
          {todayOffset >= 0 && todayOffset < totalDays && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{
                left: LABEL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                top: 0,
                bottom: 0,
                width: 2,
              }}
            >
              <div className="absolute inset-0 bg-red-500" />
              <div
                className="absolute text-[10px] font-bold text-white whitespace-nowrap bg-red-500 px-2 py-0.5 rounded-full shadow-md"
                style={{ top: 6, left: '50%', transform: 'translateX(-50%)' }}
              >
                今天
              </div>
            </div>
          )}

          {/* Task rows */}
          <div>
            {visibleTasks.map((task, idx) => {
              const { left, width } = getTaskBarStyle(task)
              const isSelected = selectedTaskId === task.id
              const progressPercent = task.progress_percent || 0
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'
              const depth = task.depth ?? 0

              const barColor = (() => {
                switch (task.status) {
                  case 'done': return 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)'
                  case 'in_progress': return 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)'
                  case 'blocked': return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)'
                  default: return 'linear-gradient(180deg, #9ca3af 0%, #6b7280 100%)'
                }
              })()

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex border-b border-border/50 transition-colors',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Task label — sticky left column */}
                  <div
                    className={cn(
                      'flex-shrink-0 border-r border-border flex items-center px-3 gap-2 cursor-pointer hover:bg-accent/40 transition-colors sticky left-0 z-20',
                      isSelected ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'
                    )}
                    style={{ width: LABEL_WIDTH }}
                    onClick={() => handleTaskClick(task.id)}
                  >
                    <div className="flex items-center flex-1 min-w-0" style={{ paddingLeft: depth * 14 }}>
                      {/* Hierarchy connector */}
                      {depth > 0 && (
                        <span className="w-2 h-px bg-border flex-shrink-0 mr-1" />
                      )}
                      <span
                        className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-offset-1',
                          task.status === 'done' && 'bg-green-500 ring-green-200',
                          task.status === 'in_progress' && 'bg-blue-500 ring-blue-200',
                          task.status === 'blocked' && 'bg-red-500 ring-red-200',
                          task.status === 'todo' && 'bg-gray-300 ring-gray-200'
                        )}
                      />
                      <span className="text-[12px] truncate flex-1 font-medium ml-2">{task.title}</span>
                    </div>
                    {isOverdue && (
                      <span className="text-[10px] text-red-500 font-semibold flex-shrink-0 bg-red-50 px-1.5 py-0.5 rounded">逾期</span>
                    )}
                  </div>

                  {/* Bar area */}
                  <div className="flex-1 relative" style={{ width: totalWidth }}>
                    {/* Weekend/holiday shading */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(startDate)
                      d.setDate(d.getDate() + i)
                      const w = isWeekend(d)
                      const h = isHoliday(d)
                      if (!w && !h) return null
                      return (
                        <div
                          key={i}
                          className={cn('absolute top-0 bottom-0', h ? 'bg-amber-50/25' : 'bg-red-50/15')}
                          style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      )
                    })}

                    {/* Task bar */}
                    <div
                      className={cn(
                        'absolute rounded-md cursor-pointer transition-all hover:brightness-110 hover:shadow-md group',
                        isSelected && 'ring-2 ring-primary ring-offset-1'
                      )}
                      style={{
                        left: Math.max(left, 0),
                        width: Math.max(width, 4),
                        top: 4,
                        bottom: 4,
                        background: barColor,
                        boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      onClick={() => handleTaskClick(task.id)}
                      title={`${task.title}\n${task.start_date} → ${task.due_date}\n进度: ${progressPercent}%`}
                    >
                      {progressPercent > 0 && (
                        <div className="absolute inset-y-0 left-0 rounded-l-md bg-white/25" style={{ width: `${progressPercent}%` }} />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center px-2 text-[11px] text-white font-medium truncate drop-shadow">
                        {task.title}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {visibleTasks.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                当前时间范围内没有任务
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

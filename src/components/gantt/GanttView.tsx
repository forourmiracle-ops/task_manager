import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import type { Task } from '@/types'

type Dimension = 'week' | 'month' | 'quarter' | 'halfyear' | 'year'

const DIMENSION_DAYS: Record<Dimension, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  halfyear: 180,
  year: 365,
}

const DIMENSION_LABELS: { key: Dimension; label: string }[] = [
  { key: 'week', label: '一周' },
  { key: 'month', label: '当月' },
  { key: 'quarter', label: '季度' },
  { key: 'halfyear', label: '半年' },
  { key: 'year', label: '全年' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#9ca3af',
}

const MIN_DAY_WIDTH = 3
const CHART_YEARS = 10 // 10-year chart range for true infinite scrolling

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

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function GanttView() {
  const { selectedTaskId, setSelectedTaskId, fontSize, defaultDimension, setDefaultDimension } = useAppStore()
  const { data: tasks, isLoading } = useTasks()
  const dateScrollRef = useRef<HTMLDivElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const datePanelRef = useRef<HTMLDivElement>(null)
  const [dimension, setDimension] = useState<Dimension>('quarter')
  const [datePanelWidth, setDatePanelWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [dimensionInitialized, setDimensionInitialized] = useState(false)
  const initialScrollDone = useRef(false)

  // Scale dimensions by font size (1-8). At 4 -> ~1.0
  const scale = useMemo(() => 0.55 + fontSize * 0.12, [fontSize])

  const dimensionDays = DIMENSION_DAYS[dimension]

  // DAY_WIDTH = date panel width / dimension days, so viewport shows exactly the dimension range
  const DAY_WIDTH = useMemo(() => {
    if (datePanelWidth <= 0) return 40 // fallback before measurement
    return Math.max(MIN_DAY_WIDTH, Math.round(datePanelWidth / dimensionDays))
  }, [datePanelWidth, dimensionDays])

  const ROW_HEIGHT = useMemo(() => Math.round(36 * scale), [scale])
  const LABEL_WIDTH = useMemo(() => Math.round(260 * scale), [scale])
  const HEADER_HEIGHT = useMemo(() => Math.round(66 * scale), [scale])
  const MONTH_HEADER_HEIGHT = useMemo(() => Math.round(28 * scale), [scale])

  // ResizeObserver to track date panel width
  useEffect(() => {
    const el = datePanelRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDatePanelWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const allFlatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  // Auto-detect dimension from task periods and overall span
  const autoDimension = useMemo(() => {
    if (allFlatTasks.length === 0) return 'quarter'
    let totalDuration = 0
    let minStart: Date | null = null
    let maxEnd: Date | null = null
    allFlatTasks.forEach((t) => {
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      totalDuration += daysBetween(s, e)
      if (!minStart || s < minStart) minStart = s
      if (!maxEnd || e > maxEnd) maxEnd = e
    })
    const avgDays = totalDuration / allFlatTasks.length
    const overallSpan = minStart && maxEnd ? daysBetween(minStart, maxEnd) : 0
    // Use the larger of average duration and overall span for dimension selection
    const effectiveDays = Math.max(avgDays, overallSpan * 0.6)
    if (effectiveDays < 7) return 'week'
    if (effectiveDays < 30) return 'month'
    if (effectiveDays < 90) return 'quarter'
    if (effectiveDays < 180) return 'halfyear'
    return 'year'
  }, [allFlatTasks])

  // Initialize dimension from default. Auto mode always follows autoDimension
  useEffect(() => {
    if (defaultDimension === 'auto') {
      setDimension(autoDimension)
      setDimensionInitialized(true)
    } else if (!dimensionInitialized) {
      setDimension(defaultDimension as Dimension)
      setDimensionInitialized(true)
    }
  }, [defaultDimension, autoDimension, dimensionInitialized])

  // Chart range: 10 years for true infinite scrolling (today - 5yr to today + 5yr)
  const { startDate, endDate, totalDays, monthHeaders, todayOffset } = useMemo<{
    startDate: Date
    endDate: Date
    totalDays: number
    monthHeaders: MonthHeader[]
    todayOffset: number
  }>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const halfYears = Math.floor(CHART_YEARS / 2)
    const start = new Date(today)
    start.setFullYear(start.getFullYear() - halfYears)

    const end = new Date(today)
    end.setFullYear(end.getFullYear() + (CHART_YEARS - halfYears))
    end.setDate(end.getDate() - 1)

    const total = daysBetween(start, end) + 1
    const months = buildMonthHeaders(start, end)
    const offset = daysBetween(start, today)
    return { startDate: start, endDate: end, totalDays: total, monthHeaders: months, todayOffset: offset }
  }, [])

  // Track horizontal scroll for viewport filtering, sync vertical scroll
  useEffect(() => {
    const el = dateScrollRef.current
    if (!el) return
    const update = () => {
      setScrollLeft(el.scrollLeft)
      setScrollWidth(el.clientWidth)
      if (taskListRef.current) taskListRef.current.scrollTop = el.scrollTop
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [DAY_WIDTH])

  // Initialize all tasks as expanded
  const taskIds = useMemo(() => allFlatTasks.map((t) => t.id), [allFlatTasks])
  useEffect(() => {
    setExpandedIds(new Set(taskIds))
  }, [taskIds])

  // Visible date range from scroll position
  const viewportRange = useMemo(() => {
    if (!scrollWidth) return { start: startDate, end: endDate }
    const startIndex = Math.floor(scrollLeft / DAY_WIDTH)
    const endIndex = Math.ceil((scrollLeft + scrollWidth) / DAY_WIDTH)
    return {
      start: addDays(startDate, Math.max(0, startIndex)),
      end: addDays(startDate, Math.min(totalDays - 1, endIndex)),
    }
  }, [scrollLeft, scrollWidth, startDate, endDate, totalDays, DAY_WIDTH])

  // Filter visible tasks by viewport date overlap
  const visibleTasks = useMemo(() => {
    const visibleIds = new Set(
      allFlatTasks
        .filter((t) => overlapsRange(t.start_date!, t.due_date!, viewportRange.start, viewportRange.end))
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

    const filterExpanded = (list: Task[]): Task[] => {
      return list.flatMap((node) => {
        const isExpanded = expandedIds.has(node.id)
        const children = isExpanded && node.children ? filterExpanded(node.children) : []
        return [{ ...node, children }]
      })
    }

    return flattenTasks(filterExpanded(roots))
  }, [allFlatTasks, viewportRange, expandedIds])

  // Scroll into position based on dimension display rules.
  // useLayoutEffect runs synchronously after DOM mutations but before paint,
  // so the correct scroll position is applied before the user sees anything.
  useLayoutEffect(() => {
    const el = dateScrollRef.current
    if (!el || totalDays <= 0 || DAY_WIDTH <= 0 || datePanelWidth <= 0) return

    let scrollPos: number
    if (dimension === 'week' || dimension === 'month') {
      // Today at 3rd column
      scrollPos = (todayOffset - 2) * DAY_WIDTH
    } else {
      // Today's week starts at left edge
      const today = new Date()
      const dayOfWeek = today.getDay()
      scrollPos = (todayOffset - dayOfWeek) * DAY_WIDTH
    }
    el.scrollLeft = Math.max(0, scrollPos)
    initialScrollDone.current = true
  }, [totalDays, todayOffset, DAY_WIDTH, datePanelWidth, dimension])

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

  const handleDatePanelClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-task-bar]') && !target.closest('[data-task-row]')) {
      setSelectedTaskId(null)
    }
  }

  const toggleExpanded = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>()
    allFlatTasks.forEach((t) => {
      if (t.parent_id) {
        map.set(t.parent_id, (map.get(t.parent_id) || 0) + 1)
      }
    })
    return map
  }, [allFlatTasks])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (allFlatTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center bg-muted/20 rounded-2xl p-10 border border-dashed border-border">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
              <rect x="2" y="3" width="12" height="10" rx="1" />
              <path d="M2 7h12M6 7v6M10 7v6" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">暂无含日期的任务</p>
          <p className="text-xs text-muted-foreground">创建任务时设置开始和截止日期即可在甘特图中显示</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/10 flex-shrink-0">
        <span className="text-[11px] font-semibold text-muted-foreground tracking-wide">维度</span>
        {DIMENSION_LABELS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            onClick={() => setDimension(key)}
            className={cn(
              'px-3 py-1 text-[11px] rounded-full font-medium transition-all',
              dimension === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">
          {visibleTasks.length}/{allFlatTasks.length} 任务
        </span>
        <select
          value={defaultDimension}
          onChange={(e) => setDefaultDimension(e.target.value as 'auto' | Dimension)}
          className="text-[11px] px-2 py-1 rounded-full border border-border bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
          title="默认维度"
        >
          <option value="auto">默认：自动</option>
          {DIMENSION_LABELS.map(({ key, label }) => (
            <option key={key} value={key}>默认：{label}</option>
          ))}
        </select>
        <button
          type="button"
          className="px-3 py-1 text-[11px] font-medium text-primary border border-primary/20 rounded-full hover:bg-primary/5 transition-colors"
          onClick={() => {
            if (dateScrollRef.current && DAY_WIDTH > 0 && datePanelWidth > 0) {
              let scrollPos: number
              if (dimension === 'week' || dimension === 'month') {
                scrollPos = (todayOffset - 2) * DAY_WIDTH
              } else {
                const today = new Date()
                scrollPos = (todayOffset - today.getDay()) * DAY_WIDTH
              }
              dateScrollRef.current.scrollLeft = Math.max(0, scrollPos)
            }
          }}
        >
          回到今天
        </button>
      </div>

      {/* Gantt body: two-panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* ====== LEFT PANEL ====== */}
        <div
          className="flex-shrink-0 border-r border-border flex flex-col bg-background"
          style={{ width: LABEL_WIDTH }}
        >
          <div
            className="flex-shrink-0 border-b border-border flex items-center px-3 bg-muted/10"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">任务</span>
          </div>

          <div
            ref={taskListRef}
            className="flex-1 overflow-hidden"
            onScroll={(e) => {
              if (dateScrollRef.current) {
                dateScrollRef.current.scrollTop = (e.target as HTMLElement).scrollTop
              }
            }}
          >
            {visibleTasks.map((task, idx) => {
              const isSelected = selectedTaskId === task.id
              const depth = task.depth ?? 0
              const hasChildren = allFlatTasks.some((t) => t.parent_id === task.id)
              const isExpanded = expandedIds.has(task.id)
              const childCount = childCountMap.get(task.id) || 0
              const isChild = depth > 0
              const indent = depth * 16 + (hasChildren ? 0 : 18)
              const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium

              return (
                <div
                  key={task.id}
                  data-task-row
                  className={cn(
                    'flex items-center px-3 gap-1.5 cursor-pointer hover:bg-accent/40 transition-colors border-b border-border/50 flex-shrink-0 relative',
                    isSelected ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => handleTaskClick(task.id)}
                >
                  {/* Child tree connector line */}
                  {isChild && (
                    <div className="absolute left-0 top-0 bottom-0 border-l-2 border-muted-foreground/20" style={{ left: 12 + (depth - 1) * 16 }} />
                  )}

                  <span className="w-4 flex-shrink-0 flex justify-center">
                    {hasChildren ? (
                      <button
                        onClick={(e) => toggleExpanded(e, task.id)}
                        className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors"
                      >
                        {isExpanded ? (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M4 6l4 4 4-4" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M6 4l4 4-4 4" />
                          </svg>
                        )}
                      </button>
                    ) : null}
                  </span>

                  <div className="flex items-center flex-1 min-w-0" style={{ paddingLeft: indent }}>
                    {/* Priority marker */}
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-offset-1"
                      style={{ backgroundColor: priorityColor, boxShadow: `0 0 0 1px ${priorityColor}33` }}
                    />
                    <span className={cn(
                      'text-[12px] truncate flex-1 ml-2',
                      hasChildren && 'font-bold'
                    )}>
                      {task.title}
                    </span>
                    {hasChildren && childCount > 0 && (
                      <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full ml-1 flex-shrink-0">
                        {childCount}
                      </span>
                    )}
                  </div>
                  {/* Status indicator */}
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1',
                    task.status === 'done' && 'bg-green-500',
                    task.status === 'in_progress' && 'bg-blue-500',
                    task.status === 'blocked' && 'bg-red-500',
                    task.status === 'todo' && 'bg-gray-300'
                  )} />
                  {(task.progress_percent || 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0 font-medium ml-1">
                      {task.progress_percent}%
                    </span>
                  )}
                </div>
              )
            })}
            {visibleTasks.length === 0 && (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
                当前可视范围内没有任务
              </div>
            )}
          </div>
        </div>

        {/* ====== RIGHT PANEL: Unified scroll container ====== */}
        <div className="flex-1 flex flex-col overflow-hidden" ref={datePanelRef}>
          <div
            ref={dateScrollRef}
            className="flex-1 overflow-auto"
            onClick={handleDatePanelClick}
          >
            <div style={{ minWidth: totalWidth }}>
              {/* Month headers — sticky */}
              <div
                className="sticky top-0 z-20 border-b border-border bg-muted/10 flex"
                style={{ height: MONTH_HEADER_HEIGHT }}
              >
                {monthHeaders.map((mh, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 flex items-center justify-center border-r border-border font-bold text-[11px] text-foreground/80"
                    style={{ width: mh.days * DAY_WIDTH, height: MONTH_HEADER_HEIGHT }}
                  >
                    {mh.label}
                  </div>
                ))}
              </div>

              {/* Day headers — sticky below month header */}
              <div
                className="sticky z-10 border-b border-border bg-background flex"
                style={{ top: MONTH_HEADER_HEIGHT, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }}
              >
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

              {/* Bar area */}
              <div style={{ height: visibleTasks.length * ROW_HEIGHT, position: 'relative' }}>
                {/* Today marker */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={{
                      left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
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

                {/* Task bars */}
                {visibleTasks.map((task, idx) => {
                  const { left, width } = getTaskBarStyle(task)
                  const isSelected = selectedTaskId === task.id
                  const progressPercent = task.progress_percent || 0
                  const depth = task.depth ?? 0
                  const isChild = depth > 0
                  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium

                  const barColor = (() => {
                    switch (task.status) {
                      case 'done': return 'linear-gradient(180deg, #22c55e 0%, #16a34a 100%)'
                      case 'in_progress': return 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)'
                      case 'blocked': return 'linear-gradient(180deg, #ef4444 0%, #dc2626 100%)'
                      default: return 'linear-gradient(180deg, #9ca3af 0%, #6b7280 100%)'
                    }
                  })()

                  // Parent: full opacity + full height. Child: 75% opacity + narrower height
                  const barOpacity = isChild ? 0.75 : 1
                  const barTop = isChild ? 8 : 4
                  const barBottom = isChild ? 8 : 4

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'border-b border-border/50 transition-colors relative',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/5'
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
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
                        data-task-bar
                        className={cn(
                          'absolute rounded-md cursor-pointer transition-all hover:brightness-110 hover:shadow-md group',
                          isSelected && 'ring-2 ring-primary ring-offset-1'
                        )}
                        style={{
                          left: Math.max(left, 0),
                          width: Math.max(width, 4),
                          top: barTop,
                          bottom: barBottom,
                          background: barColor,
                          opacity: barOpacity,
                          boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
                        }}
                        onClick={() => handleTaskClick(task.id)}
                        title={`${task.title}\n${task.start_date} → ${task.due_date}\n进度: ${progressPercent}%`}
                      >
                        {/* Priority color marker on left */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-l-md"
                          style={{ width: 3, background: priorityColor }}
                        />
                        {/* Progress fill */}
                        {progressPercent > 0 && (
                          <div className="absolute inset-y-0 left-0 rounded-l-md bg-white/25" style={{ width: `${progressPercent}%`, left: 3 }} />
                        )}
                        <span
                          className="absolute inset-0 flex items-center justify-center px-2 text-white font-medium truncate drop-shadow"
                          style={{
                            fontSize: `clamp(10px, ${11 * scale}px, 14px)`,
                            paddingLeft: '10px',
                          }}
                        >
                          {task.title}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {visibleTasks.length === 0 && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground text-xs" style={{ height: ROW_HEIGHT * 3 }}>
                    当前可视范围内没有任务，请滚动或调整粒度
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
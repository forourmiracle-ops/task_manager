import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '@/store'
import type { ViewStartMode } from '@/store'
import { useTasks } from '@/hooks/useTasks'
import { useUpdateTask } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import { showDraftToast } from '@/components/ui/DraftToast'
import { exportToCSV, exportToJSON, downloadFile } from '@/lib/export'
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

// Compute scroll target based on viewStartMode and dimension
function getScrollTarget(
  viewStartMode: ViewStartMode,
  dimension: Dimension,
  todayOffset: number,
  startDate: Date,
  dayWidth: number,
): number {
  const today = new Date()
  if (viewStartMode === 'fromToday') {
    return todayOffset * dayWidth
  }
  // periodStart: align to period boundary
  switch (dimension) {
    case 'week': {
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      return (todayOffset + mondayOffset) * dayWidth
    }
    case 'month': {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return daysBetween(startDate, firstOfMonth) * dayWidth
    }
    case 'quarter': {
      const quarterStart = Math.floor(today.getMonth() / 3) * 3
      const firstOfQuarter = new Date(today.getFullYear(), quarterStart, 1)
      return daysBetween(startDate, firstOfQuarter) * dayWidth
    }
    case 'halfyear': {
      const halfStart = today.getMonth() < 6 ? 0 : 6
      const firstOfHalf = new Date(today.getFullYear(), halfStart, 1)
      return daysBetween(startDate, firstOfHalf) * dayWidth
    }
    case 'year': {
      const firstOfYear = new Date(today.getFullYear(), 0, 1)
      return daysBetween(startDate, firstOfYear) * dayWidth
    }
  }
}

// SVG dependency line renderer
function DependencyLines({
  tasks,
  getBarStyle,
  rowHeight,
}: {
  tasks: Task[]
  getBarStyle: (task: Task) => { left: number; width: number }
  rowHeight: number
}) {
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach((t, i) => map.set(t.id, i))
    return map
  }, [tasks])

  // Pre-build task lookup map to avoid O(n) tasks.find() inside the nested loop
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>()
    tasks.forEach((t) => map.set(t.id, t))
    return map
  }, [tasks])

  const lines = useMemo(() => {
    const result: { fromX: number; fromY: number; toX: number; toY: number; fromId: string; toId: string }[] = []
    tasks.forEach((task) => {
      if (!task.depends_on || task.depends_on.length === 0) return
      const toIdx = rowIndex.get(task.id)
      if (toIdx === undefined) return
      const toBar = getBarStyle(task)
      const toY = toIdx * rowHeight + rowHeight / 2

      task.depends_on.forEach((depId) => {
        const fromIdx = rowIndex.get(depId)
        if (fromIdx === undefined) return
        const depTask = taskMap.get(depId)
        if (!depTask) return
        const fromBar = getBarStyle(depTask)
        const fromY = fromIdx * rowHeight + rowHeight / 2

        result.push({
          fromX: fromBar.left + fromBar.width,
          fromY,
          toX: toBar.left,
          toY,
          fromId: depId,
          toId: task.id,
        })
      })
    })
    return result
  }, [tasks, rowIndex, taskMap, getBarStyle, rowHeight])

  if (lines.length === 0) return null

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-5"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <marker
          id="dep-arrow"
          viewBox="0 0 10 10"
          refX={10}
          refY={5}
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      {lines.map(({ fromX, fromY, toX, toY, fromId, toId }) => {
        const midX = (fromX + toX) / 2
        const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX - 4} ${toY}`
        return (
          <path
            key={`${fromId}-${toId}`}
            d={d}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={1.2}
            strokeDasharray="4 3"
            strokeOpacity={0.5}
            markerEnd="url(#dep-arrow)"
          />
        )
      })}
    </svg>
  )
}

const goTodayLabels = ['回到今天', '今日置首', '回到今天']

// Module-level variable to persist dimension across view switches within the same session
// Resets on page refresh (app restart)
let lastSelectedDimension: Dimension | null = null

export const GanttView = memo(function GanttView() {
  const { selectedTaskId, setSelectedTaskId, fontSize, defaultDimension, setDefaultDimension, viewStartMode, setViewStartMode, setImportDialogOpen } = useAppStore()
  const { data: tasks, isLoading } = useTasks()
  const updateTask = useUpdateTask()
  const updateTaskRef = useRef(updateTask)
  updateTaskRef.current = updateTask
  const dateScrollRef = useRef<HTMLDivElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)
  const datePanelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  // Callback ref — sets up ResizeObserver immediately when the DOM element mounts,
  // regardless of isLoading state. Avoids the useEffect([]) + early-return race
  // where the ref is null during loading and the effect never re-runs.
  const datePanelCallbackRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDatePanelWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    observerRef.current = ro
  }, [])

  const allFlatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  // Pre-compute parent map for O(1) ancestor lookups — used by visibleTasks filter
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>()
    if (!tasks) return map
    for (let i = 0; i < tasks.length; i++) {
      map.set(tasks[i].id, tasks[i].parent_id ?? null)
    }
    return map
  }, [tasks])

  // Auto-detect dimension from task periods and overall span.
  // Uses for-loop + raw timestamps to avoid intermediate Date objects for comparison.
  const autoDimension = useMemo(() => {
    const len = allFlatTasks.length
    if (len === 0) return 'quarter'
    let totalDuration = 0
    let minTs = Infinity
    let maxTs = -Infinity
    for (let i = 0; i < len; i++) {
      const t = allFlatTasks[i]
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      totalDuration += daysBetween(s, e)
      const sTs = s.getTime()
      const eTs = e.getTime()
      if (sTs < minTs) minTs = sTs
      if (eTs > maxTs) maxTs = eTs
    }
    const avgDays = totalDuration / len
    const overallSpan = minTs < Infinity ? (maxTs - minTs) / 86400000 : 0
    const effectiveDays = Math.max(avgDays, overallSpan * 0.6)
    if (effectiveDays < 7) return 'week'
    if (effectiveDays < 30) return 'month'
    if (effectiveDays < 90) return 'quarter'
    if (effectiveDays < 180) return 'halfyear'
    return 'year'
  }, [allFlatTasks])

  const [dimension, setDimension] = useState<Dimension>(() => {
    if (lastSelectedDimension) return lastSelectedDimension
    if (defaultDimension === 'auto') return autoDimension
    return (defaultDimension as Dimension) || 'quarter'
  })
  const [datePanelWidth, setDatePanelWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [goTodayStage, setGoTodayStage] = useState(0) // 0=idle, 1=centered, 2=first
  const goTodayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drag state for visual feedback — ref for immediate access during sync drag events
  interface DragState {
    sourceId: string
    targetIdx: number | null
  }
  const dragStateRef = useRef<DragState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const updateDragState = (next: DragState | null | ((prev: DragState | null) => DragState | null)) => {
    const resolved = typeof next === 'function' ? next(dragStateRef.current) : next
    dragStateRef.current = resolved
    setDragState(resolved)
  }

  // Drag undo snapshot
  interface DragSnapshot {
    sourceId: string
    oldSortOrder: number
    oldParentId: string | null
  }
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)

  // Export dropdown
  const [showExportMenu, setShowExportMenu] = useState(false)

  // Scale dimensions by font size (1-8). At 4 -> ~1.0
  const scale = useMemo(() => 0.55 + fontSize * 0.12, [fontSize])

  const dimensionDays = DIMENSION_DAYS[dimension]

  // DAY_WIDTH = date panel width / dimension days, so viewport shows exactly the dimension range
  // Fallback uses estimated 480px panel width so dimension is respected before ResizeObserver fires
  // No Math.round() — fractional px avoids cumulative rounding errors that make visible days mismatch the dimension
  const DAY_WIDTH = useMemo(() => {
    if (datePanelWidth <= 0) return Math.max(MIN_DAY_WIDTH, 480 / dimensionDays)
    return Math.max(MIN_DAY_WIDTH, datePanelWidth / dimensionDays)
  }, [datePanelWidth, dimensionDays])

  const ROW_HEIGHT = useMemo(() => Math.round(36 * scale), [scale])
  const LABEL_WIDTH = useMemo(() => Math.round(260 * scale), [scale])
  const HEADER_HEIGHT = useMemo(() => Math.round(66 * scale), [scale])
  const MONTH_HEADER_HEIGHT = useMemo(() => Math.round(28 * scale), [scale])

  // Sync dimension with defaultDimension setting — only on explicit defaultDimension changes, not autoDimension
  const prevDefaultDimRef = useRef(defaultDimension)
  useEffect(() => {
    if (defaultDimension !== prevDefaultDimRef.current) {
      prevDefaultDimRef.current = defaultDimension
      if (defaultDimension === 'auto') {
        setDimension(autoDimension)
      } else {
        setDimension(defaultDimension as Dimension)
      }
    }
  }, [defaultDimension])

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

  // Track horizontal scroll for viewport filtering, sync vertical scroll.
  // rAF-throttled: React state updates only once per frame, scroll sync via direct DOM.
  useEffect(() => {
    const el = dateScrollRef.current
    if (!el) return
    let rafId: number | null = null
    const updateDOM = () => {
      if (taskListRef.current) taskListRef.current.scrollTop = el.scrollTop
    }
    const updateState = () => {
      setScrollLeft(el.scrollLeft)
      setScrollWidth(el.clientWidth)
    }
    const onScroll = () => {
      updateDOM()
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          updateState()
        })
      }
    }
    // Initial sync
    updateDOM()
    updateState()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', updateState)
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', updateState)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  // Stable scroll sync callback for left panel — direct DOM write, no state
  const handleTaskListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (dateScrollRef.current) {
      dateScrollRef.current.scrollTop = (e.target as HTMLElement).scrollTop
    }
  }, [])

  // Initialize all tasks as expanded
  const taskIds = useMemo(() => allFlatTasks.map((t) => t.id), [allFlatTasks])
  useEffect(() => {
    setExpandedIds(new Set(taskIds))
  }, [taskIds])

  // Ctrl+Z to undo last drag
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const snap = dragSnapshotRef.current
        if (!snap) return
        // Don't prevent default if inside an input/textarea
        const target = e.target as HTMLElement
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        updateTask.mutate({
          id: snap.sourceId,
          sort_order: snap.oldSortOrder,
          parent_id: snap.oldParentId,
        })
        showDraftToast({
          message: '已撤销拖拽排序',
          onUndo: () => {},
        })
        dragSnapshotRef.current = null
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [updateTask])

  // Visible date range from scroll position.
  // Use datePanelWidth as fallback so initial render (scrollWidth=0) doesn't span the full 10-year range.
  const viewportRange = useMemo(() => {
    const effectiveWidth = scrollWidth || datePanelWidth || 800
    const startIndex = Math.floor(scrollLeft / DAY_WIDTH)
    const endIndex = Math.ceil((scrollLeft + effectiveWidth) / DAY_WIDTH)
    return {
      start: addDays(startDate, Math.max(0, startIndex)),
      end: addDays(startDate, Math.min(totalDays - 1, endIndex)),
    }
  }, [scrollLeft, scrollWidth, datePanelWidth, startDate, endDate, totalDays, DAY_WIDTH])

  // Filter visible tasks by viewport date overlap + expanded state.
  // Single-pass filter, zero copies. Uses pre-computed parentMap for O(depth) ancestor checks.
  const visibleTasks = useMemo(() => {
    return allFlatTasks.filter((t) => {
      if (!overlapsRange(t.start_date!, t.due_date!, viewportRange.start, viewportRange.end)) return false
      // Check if all ancestors are expanded
      let currentId: string | null = t.parent_id ?? null
      while (currentId) {
        if (!expandedIds.has(currentId)) return false
        currentId = parentMap.get(currentId) ?? null
      }
      return true
    })
  }, [allFlatTasks, viewportRange, expandedIds, parentMap])

  // Only render day cells visible in the horizontal viewport — reduces ~3650 DOM nodes to ~50-100.
  // CRITICAL: uses datePanelWidth fallback. Without it, initial scrollWidth=0 causes ALL 3650 days
  // to render (day headers + per-row weekend shadings), consuming extreme memory and hanging the browser.
  const visibleDayRange = useMemo(() => {
    const effectiveWidth = scrollWidth || datePanelWidth || 800
    if (DAY_WIDTH <= 0) return { start: 0, end: totalDays }
    const pad = 2 // small buffer to avoid pop-in at edges
    const start = Math.max(0, Math.floor(scrollLeft / DAY_WIDTH) - pad)
    const end = Math.min(totalDays, Math.ceil((scrollLeft + effectiveWidth) / DAY_WIDTH) + pad)
    return { start, end }
  }, [scrollLeft, scrollWidth, datePanelWidth, DAY_WIDTH, totalDays])

  // Precompute weekend/holiday day indices for the visible range.
  // Avoids creating new Date() and calling isWeekend/isHoliday per cell per row.
  const weekendHolidayIndices = useMemo(() => {
    const weekendSet = new Set<number>()
    const holidaySet = new Set<number>()
    for (let i = visibleDayRange.start; i < visibleDayRange.end; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      if (isWeekend(d)) weekendSet.add(i)
      if (isHoliday(d)) holidaySet.add(i)
    }
    return { weekendSet, holidaySet }
  }, [visibleDayRange, startDate])

  // Virtual list for performance
  const virtualizer = useVirtualizer({
    count: visibleTasks.length,
    getScrollElement: () => taskListRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })
  const virtualItems = virtualizer.getVirtualItems()

  // Scroll to today on first load and when dimension/size/data changes.
  // Double rAF ensures browser finishes layout (scrollWidth may not be updated yet).
  useLayoutEffect(() => {
    const el = dateScrollRef.current
    if (!el || DAY_WIDTH <= 0) return

    const scrollPos = getScrollTarget(viewStartMode, dimension, todayOffset, startDate, DAY_WIDTH)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, scrollPos)
      })
    })
  }, [todayOffset, dimension, DAY_WIDTH, allFlatTasks.length, viewStartMode])

  const totalWidth = totalDays * DAY_WIDTH

  // Precompute all task bar positions — avoids new Date() on every render
  const taskBarStyles = useMemo(() => {
    const styles = new Map<string, { left: number; width: number }>()
    for (let i = 0; i < allFlatTasks.length; i++) {
      const t = allFlatTasks[i]
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      const left = daysBetween(startDate, s) * DAY_WIDTH
      const width = Math.max((daysBetween(s, e) + 1) * DAY_WIDTH, 4)
      styles.set(t.id, { left, width })
    }
    return styles
  }, [allFlatTasks, startDate, DAY_WIDTH])

  const getTaskBarStyle = useCallback((task: Task) => {
    return taskBarStyles.get(task.id) ?? { left: 0, width: 4 }
  }, [taskBarStyles])

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
    const countMap = new Map<string, number>()
    const hasChildrenMap = new Map<string, boolean>()
    allFlatTasks.forEach((t) => {
      if (t.parent_id) {
        countMap.set(t.parent_id, (countMap.get(t.parent_id) || 0) + 1)
        hasChildrenMap.set(t.parent_id, true)
      }
    })
    return { countMap, hasChildrenMap }
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
            onClick={() => {
              lastSelectedDimension = key
              setDimension(key)
            }}
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
          onChange={(e) => {
            lastSelectedDimension = null
            setDefaultDimension(e.target.value as 'auto' | Dimension)
          }}
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
          className="px-3 py-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full hover:bg-accent transition-colors"
          onClick={() => setViewStartMode(viewStartMode === 'periodStart' ? 'fromToday' : 'periodStart')}
          title={viewStartMode === 'periodStart' ? '当前：对齐周期边界' : '当前：从今日起算'}
        >
          {viewStartMode === 'periodStart' ? '周期对齐' : '今日起算'}
        </button>
        {/* Export dropdown */}
        <div className="relative">
          <button
            type="button"
            className="px-3 py-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full hover:bg-accent transition-colors"
            onClick={() => setShowExportMenu(!showExportMenu)}
          >
            导出
          </button>
          {showExportMenu && (
            <div className="absolute top-full right-0 mt-1 border border-border rounded-lg bg-background shadow-lg z-30 py-1 min-w-[100px]">
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors"
                onClick={() => {
                  downloadFile(exportToCSV(allFlatTasks), 'tasks.csv', 'text/csv;charset=utf-8')
                  setShowExportMenu(false)
                }}
              >
                CSV 格式
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors"
                onClick={() => {
                  downloadFile(exportToJSON(allFlatTasks), 'tasks.json', 'application/json')
                  setShowExportMenu(false)
                }}
              >
                JSON 格式
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="px-3 py-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full hover:bg-accent transition-colors"
          onClick={() => setImportDialogOpen(true)}
        >
          导入
        </button>
        <button
          type="button"
          className="px-3 py-1 text-[11px] font-medium text-primary border border-primary/20 rounded-full hover:bg-primary/5 transition-colors"
          onClick={() => {
            if (!dateScrollRef.current || DAY_WIDTH <= 0 || datePanelWidth <= 0) return
            if (goTodayTimerRef.current) clearTimeout(goTodayTimerRef.current)

            const next = (goTodayStage + 1) % 3
            setGoTodayStage(next)

            // Always scroll to today, regardless of viewStartMode
            const todayScroll = todayOffset * DAY_WIDTH
            if (next === 1) {
              // First click: center today
              dateScrollRef.current.scrollLeft = Math.max(0, todayScroll - datePanelWidth / 2 + DAY_WIDTH / 2)
            } else {
              // Second click: today as first item
              dateScrollRef.current.scrollLeft = Math.max(0, todayScroll)
            }

            goTodayTimerRef.current = setTimeout(() => setGoTodayStage(0), 300)
          }}
        >
          {goTodayLabels[goTodayStage]}
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
            className="flex-1 overflow-auto"
            style={{ willChange: 'scroll-position', contain: 'layout style' }}
            onScroll={handleTaskListScroll}
          >
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
              {virtualItems.map((virtualItem) => {
                const task = visibleTasks[virtualItem.index]
                const idx = virtualItem.index
              const isSelected = selectedTaskId === task.id
              const depth = task.depth ?? 0
              const hasChildren = childCountMap.hasChildrenMap.get(task.id) ?? false
              const isExpanded = expandedIds.has(task.id)
              const childCount = childCountMap.countMap.get(task.id) || 0
              const isChild = depth > 0
              const indent = depth * 16 + (hasChildren ? 0 : 18)
              const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium

              return (
                <div
                  key={task.id}
                  data-task-row
                  draggable
                  onDragStart={(e) => {
                    const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
                    e.dataTransfer.setDragImage(img, 0, 0)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', task.id)
                    updateDragState({ sourceId: task.id, targetIdx: null })
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const cur = dragStateRef.current
                    if (cur?.sourceId !== task.id) {
                      updateDragState({ sourceId: cur?.sourceId || '', targetIdx: idx })
                    }
                  }}
                  onDragLeave={() => {
                    if (dragStateRef.current?.targetIdx === idx) {
                      updateDragState(prev => prev ? { ...prev, targetIdx: null } : null)
                    }
                  }}
                  onDragEnd={() => updateDragState(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    updateDragState(null)
                    const sourceId = e.dataTransfer.getData('text/plain')
                    if (sourceId === task.id) return
                    const sourceIdx = visibleTasks.findIndex(t => t.id === sourceId)
                    const targetIdx = visibleTasks.findIndex(t => t.id === task.id)
                    if (sourceIdx === -1 || targetIdx === -1) return

                    // Save snapshot for undo
                    const sourceTask = visibleTasks.find(t => t.id === sourceId)
                    if (sourceTask) {
                      dragSnapshotRef.current = {
                        sourceId,
                        oldSortOrder: sourceTask.sort_order,
                        oldParentId: sourceTask.parent_id || null,
                      }
                    }

                    const prevTask = targetIdx > 0 ? visibleTasks[targetIdx - 1] : null
                    const newSort = prevTask ? (prevTask.sort_order + task.sort_order) / 2 : task.sort_order - 1
                    updateTaskRef.current?.mutate({ id: sourceId, sort_order: newSort, parent_id: task.parent_id })
                  }}
                  className={cn(
                    'flex items-center px-3 gap-1.5 cursor-pointer hover:bg-accent/40 transition-colors border-b border-border/50 flex-shrink-0 relative',
                    isSelected ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-background' : 'bg-muted/5',
                    dragState?.sourceId === task.id && 'opacity-40 border-2 border-dashed border-primary',
                  )}
                  style={{ position: 'absolute', top: `${virtualItem.start}px`, left: 0, width: '100%', height: ROW_HEIGHT }}
                  onClick={() => handleTaskClick(task.id)}
                >
                  {/* Drag insertion indicator */}
                  {dragState?.targetIdx === idx && dragState.sourceId !== task.id && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-20 rounded-full" />
                  )}
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
        </div>

        {/* ====== RIGHT PANEL: Unified scroll container ====== */}
        <div className="flex-1 flex flex-col overflow-hidden" ref={(el) => { (datePanelRef as React.MutableRefObject<HTMLDivElement | null>).current = el; datePanelCallbackRef(el) }}>
          <div
            ref={dateScrollRef}
            className="flex-1 overflow-auto"
            style={{ willChange: 'scroll-position', contain: 'layout style' }}
            onClick={handleDatePanelClick}
          >
            <div style={{ minWidth: totalWidth }}>
              {/* Month headers — sticky */}
              <div
                className="sticky top-0 z-20 border-b border-border"
                style={{ height: MONTH_HEADER_HEIGHT, backgroundColor: 'hsl(var(--muted) / 0.1)' }}
              >
                {monthHeaders.reduce<{ els: React.ReactNode[]; offset: number }>((acc, mh, i) => {
                  acc.els.push(
                    <div
                      key={i}
                      className="absolute flex items-center justify-center border-r border-border font-bold text-[11px] text-foreground/80"
                      style={{ left: acc.offset * DAY_WIDTH, width: mh.days * DAY_WIDTH, height: MONTH_HEADER_HEIGHT }}
                    >
                      {mh.label}
                    </div>
                  )
                  acc.offset += mh.days
                  return acc
                }, { els: [], offset: 0 }).els}
              </div>

              {/* Day headers — sticky below month header */}
              <div
                className="sticky z-10 border-b border-border"
                style={{ top: MONTH_HEADER_HEIGHT, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT, backgroundColor: 'hsl(var(--background))' }}
              >
                {Array.from({ length: visibleDayRange.end - visibleDayRange.start }, (_, j) => {
                  const i = visibleDayRange.start + j
                  const d = new Date(startDate)
                  d.setDate(d.getDate() + i)
                  const w = isWeekend(d)
                  const h = isHoliday(d)
                  const isToday = i === todayOffset
                  return (
                    <div
                      key={i}
                      className={cn(
                        'absolute flex flex-col items-center justify-center border-r border-border/60',
                        w && !h && 'bg-red-50/20',
                        h && 'bg-amber-50/30',
                        isToday && 'bg-blue-50/50'
                      )}
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, height: HEADER_HEIGHT - MONTH_HEADER_HEIGHT }}
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
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {/* Dependency lines SVG overlay */}
                <DependencyLines
                  tasks={visibleTasks}
                  getBarStyle={getTaskBarStyle}
                  rowHeight={ROW_HEIGHT}
                />
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
                {virtualItems.map((virtualItem) => {
                  const task = visibleTasks[virtualItem.index]
                  const idx = virtualItem.index
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
                      draggable
                      onDragStart={(e) => {
                        const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
                        e.dataTransfer.setDragImage(img, 0, 0)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', task.id)
                        updateDragState({ sourceId: task.id, targetIdx: null })
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const cur = dragStateRef.current
                        if (cur?.sourceId !== task.id) {
                          updateDragState({ sourceId: cur?.sourceId || '', targetIdx: idx })
                        }
                      }}
                      onDragLeave={() => {
                        if (dragStateRef.current?.targetIdx === idx) {
                          updateDragState(prev => prev ? { ...prev, targetIdx: null } : null)
                        }
                      }}
                      onDragEnd={() => updateDragState(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        updateDragState(null)
                        const sourceId = e.dataTransfer.getData('text/plain')
                        if (sourceId === task.id) return
                        const sourceIdx = visibleTasks.findIndex(t => t.id === sourceId)
                        const targetIdx = visibleTasks.findIndex(t => t.id === task.id)
                        if (sourceIdx === -1 || targetIdx === -1) return

                        // Save snapshot for undo
                        const sourceTask = visibleTasks.find(t => t.id === sourceId)
                        if (sourceTask) {
                          dragSnapshotRef.current = {
                            sourceId,
                            oldSortOrder: sourceTask.sort_order,
                            oldParentId: sourceTask.parent_id || null,
                          }
                        }

                        const prevTask = targetIdx > 0 ? visibleTasks[targetIdx - 1] : null
                        const newSort = prevTask ? (prevTask.sort_order + task.sort_order) / 2 : task.sort_order - 1
                        updateTaskRef.current?.mutate({ id: sourceId, sort_order: newSort, parent_id: task.parent_id })
                      }}
                      className={cn(
                        'border-b border-border/50 transition-colors relative',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/5',
                        dragState?.sourceId === task.id && 'opacity-40 border-2 border-dashed border-primary',
                      )}
                      style={{ position: 'absolute', top: `${virtualItem.start}px`, left: 0, width: '100%', height: ROW_HEIGHT }}
                    >
                      {/* Drag insertion indicator */}
                      {dragState?.targetIdx === idx && dragState.sourceId !== task.id && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-20 rounded-full" />
                      )}
                      {/* Weekend/holiday shading — uses precomputed indices, zero Date allocations */}
                      {Array.from({ length: visibleDayRange.end - visibleDayRange.start }, (_, j) => {
                        const i = visibleDayRange.start + j
                        const w = weekendHolidayIndices.weekendSet.has(i)
                        const h = weekendHolidayIndices.holidaySet.has(i)
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
})
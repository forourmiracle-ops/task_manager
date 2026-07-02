import { useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback, memo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '@/store'
import type { ViewStartMode } from '@/store'
import { useUpdateTask } from '@/hooks/useTasks'
import { cn } from '@/lib/utils'
import { showDraftToast } from '@/components/ui/DraftToast'
import { exportToCSV } from '@/lib/export'
import type { Task } from '@/types'

import { useGanttData } from './hooks/useGanttData'
import { useGanttScroll } from './hooks/useGanttScroll'
import { useGanttViewport } from './hooks/useGanttViewport'
import { useGanttLayout } from './hooks/useGanttLayout'
import { GanttToolbar } from './GanttToolbar'
import { GanttTaskPanel } from './GanttTaskPanel'
import { GanttTaskRows } from './GanttTaskRows'
import { GanttDayHeaders } from './GanttDayHeaders'
import { GanttMonthHeaders } from './GanttMonthHeaders'
import { GanttErrorBoundary } from './GanttErrorBoundary'

type Dimension = 'week' | 'month' | 'quarter' | 'halfyear' | 'year'

const DIMENSION_DAYS: Record<Dimension, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  halfyear: 180,
  year: 365,
}

// ──────────────────────────────────────────────────────────────────────────────
// GanttView — Main orchestrator
// Chart structure is always rendered; loading/empty states use overlays
// so the scroll container ref is stable and effects run once on mount.
// ──────────────────────────────────────────────────────────────────────────────
export const GanttView = memo(function GanttView() {
  // ── Zustand global state ──────────────────────────────────────────────────
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)
  const defaultDimension = useAppStore((s) => s.defaultDimension)
  const selectedTaskId = useAppStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  const viewStartMode = useAppStore((s) => s.viewStartMode)
  const setViewStartMode = useAppStore((s) => s.setViewStartMode)
  const lastSelectedDimension = useAppStore((s) => s.lastSelectedDimension)
  const setLastSelectedDimension = useAppStore((s) => s.setLastSelectedDimension)

  const updateTask = useUpdateTask()

  // ── Data (useGanttData) ───────────────────────────────────────────────────
  const { isLoading, allFlatTasks, parentMap, childCountMap, taskDateRange } = useGanttData()
  const { startDate, endDate, totalDays, monthHeaders, todayOffset } = taskDateRange
  const isEmpty = !isLoading && allFlatTasks.length === 0

  // ── Auto dimension ────────────────────────────────────────────────────────
  const autoDimension = useMemo((): Dimension => {
    const len = allFlatTasks.length
    if (len === 0) return 'quarter'
    let totalDuration = 0
    let minTs = Infinity
    let maxTs = -Infinity
    for (let i = 0; i < len; i++) {
      const t = allFlatTasks[i]
      const s = new Date(t.start_date!)
      const e = new Date(t.due_date!)
      totalDuration += (e.getTime() - s.getTime()) / 86400000
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

  // ── Local state ───────────────────────────────────────────────────────────
  const [dimension, setDimension] = useState<Dimension>(() => {
    if (lastSelectedDimension) return lastSelectedDimension
    if (defaultDimension === 'auto') return autoDimension
    return (defaultDimension as Dimension) || 'quarter'
  })
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [goTodayStage, setGoTodayStage] = useState(0)
  const goTodayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Drag state
  interface DragState { sourceId: string; targetIdx: number | null }
  const dragStateRef = useRef<DragState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const updateDragState = useCallback((next: DragState | null | ((prev: DragState | null) => DragState | null)) => {
    const resolved = typeof next === 'function' ? next(dragStateRef.current) : next
    dragStateRef.current = resolved
    setDragState(resolved)
  }, [])

  // Drag undo snapshot
  interface DragSnapshot { sourceId: string; oldSortOrder: number; oldParentId: string | null }
  const dragSnapshotRef = useRef<DragSnapshot | null>(null)

  // ── Scroll (useGanttScroll) — no isLoading param, stable [] dependency ────
  const {
    dateScrollRef,
    taskListRef,
    scrollLeft,
    scrollWidth,
    datePanelWidth,
    datePanelCallbackRef,
    handleTaskListScroll,
  } = useGanttScroll()

  // ── Viewport (useGanttViewport) ───────────────────────────────────────────
  const {
    DAY_WIDTH,
    visibleDayRange,
    visibleTasks,
    viewportRange,
  } = useGanttViewport({
    scrollLeft,
    scrollWidth,
    datePanelWidth,
    dimension,
    allFlatTasks,
    expandedIds,
    parentMap,
    startDate,
    endDate,
    totalDays,
    monthHeaders,
    todayOffset,
  })

  // ── Layout (useGanttLayout) ───────────────────────────────────────────────
  const {
    totalWidth,
    getTaskBarStyle,
    weekendHolidayIndices,
    todayPosition,
    scrollTarget,
  } = useGanttLayout({
    allFlatTasks,
    visibleTasks,
    visibleDayRange,
    DAY_WIDTH,
    startDate,
    totalDays,
    todayOffset,
    dimension,
    viewStartMode,
  })

  // ── Scale ─────────────────────────────────────────────────────────────────
  const scale = useMemo(() => 0.55 + fontSize * 0.12, [fontSize])
  const ROW_HEIGHT = useMemo(() => Math.round(36 * scale), [scale])
  const LABEL_WIDTH = useMemo(() => Math.round(260 * scale), [scale])

  // ── Sync dimension with defaultDimension ──────────────────────────────────
  const prevDefaultDimRef = useRef(defaultDimension)
  useEffect(() => {
    if (defaultDimension !== prevDefaultDimRef.current) {
      prevDefaultDimRef.current = defaultDimension
      setDimension(defaultDimension === 'auto' ? autoDimension : (defaultDimension as Dimension))
    }
  }, [defaultDimension, autoDimension])

  // ── Initialize expanded IDs ───────────────────────────────────────────────
  const taskIds = useMemo(() => allFlatTasks.map((t) => t.id), [allFlatTasks])
  useEffect(() => {
    setExpandedIds(new Set(taskIds))
  }, [taskIds])

  // ── Virtual list ──────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: visibleTasks.length,
    getScrollElement: () => taskListRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })
  const virtualItems = virtualizer.getVirtualItems()

  // ── Scroll to today ───────────────────────────────────────────────────────
  // useLayoutEffect runs before paint, so the scroll position is set
  // before the user sees anything. No double rAF — that would delay
  // the scroll past the useEffect in useGanttScroll, causing scrollLeft=0.
  useLayoutEffect(() => {
    const el = dateScrollRef.current
    if (!el || DAY_WIDTH <= 0) return
    el.scrollLeft = Math.max(0, scrollTarget)
  }, [scrollTarget, DAY_WIDTH, allFlatTasks.length])

  // ── Ctrl+Z undo ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        const snap = dragSnapshotRef.current
        if (!snap) return
        const target = e.target as HTMLElement
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        updateTask.mutate({
          id: snap.sourceId,
          sort_order: snap.oldSortOrder,
          parent_id: snap.oldParentId,
        })
        showDraftToast({ message: '已撤销拖拽排序', onUndo: () => {} })
        dragSnapshotRef.current = null
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [updateTask])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleTaskClick = useCallback((id: string) => {
    try { setSelectedTaskId(id) } catch { /* ignore */ }
  }, [setSelectedTaskId])

  const handleDatePanelClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-task-bar]') && !target.closest('[data-task-row]')) {
      setSelectedTaskId(null)
    }
  }, [setSelectedTaskId])

  const toggleExpanded = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDimensionChange = useCallback((dim: string) => {
    setDimension(dim as Dimension)
    setLastSelectedDimension(dim as Dimension)
  }, [setLastSelectedDimension])

  const handleGoToday = useCallback(() => {
    const next = (goTodayStage + 1) % 3
    setGoTodayStage(next)
    const el = dateScrollRef.current
    if (!el) return

    if (goTodayTimerRef.current) clearTimeout(goTodayTimerRef.current)
    goTodayTimerRef.current = setTimeout(() => setGoTodayStage(0), 1000)

    if (next === 1) {
      const panelWidth = el.clientWidth
      el.scrollTo({ left: todayOffset * DAY_WIDTH - panelWidth / 2, behavior: 'smooth' })
    } else if (next === 2) {
      el.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [goTodayStage, todayOffset, DAY_WIDTH])

  const handleExportPNG = useCallback(() => {
    try { exportToCSV(visibleTasks, 'gantt-tasks.csv') } catch { /* ignore */ }
  }, [visibleTasks])

  const handleExportCSV = useCallback(() => {
    exportToCSV(visibleTasks, 'gantt-tasks.csv')
  }, [visibleTasks])

  const handleUndo = useCallback(() => {
    const snap = dragSnapshotRef.current
    if (!snap) return
    updateTask.mutate({
      id: snap.sourceId,
      sort_order: snap.oldSortOrder,
      parent_id: snap.oldParentId,
    })
    dragSnapshotRef.current = null
  }, [updateTask])

  const handleTaskDrop = useCallback((sourceId: string, _targetId: string, newSort: number) => {
    updateTask.mutate({ id: sourceId, sort_order: newSort })
  }, [updateTask])

  // ── Render — chart structure always exists, overlays for loading/empty ────
  // Toolbar stays outside the overlay area so it's always visible.
  // Overlays only cover the chart body (below the toolbar).
  return (
    <GanttErrorBoundary>
      <div className="flex-1 flex flex-col overflow-hidden bg-background">
        {/* Toolbar — always visible, above overlays */}
        <GanttToolbar
          dimension={dimension}
          viewStartMode={viewStartMode}
          goTodayStage={goTodayStage}
          fontSize={fontSize}
          onDimensionChange={handleDimensionChange}
          onViewStartModeChange={setViewStartMode}
          onGoToday={handleGoToday}
          onZoomIn={() => setFontSize(Math.min(8, fontSize + 1))}
          onZoomOut={() => setFontSize(Math.max(1, fontSize - 1))}
          onExportPNG={handleExportPNG}
          onExportCSV={handleExportCSV}
          onUndo={handleUndo}
          canUndo={dragSnapshotRef.current !== null}
        />

        {/* Gantt body: two-panel layout — always rendered, overlays inside */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left panel: virtual task list */}
          <GanttTaskPanel
            virtualItems={virtualItems}
            visibleTasks={visibleTasks}
            allFlatTasks={allFlatTasks}
            expandedIds={expandedIds}
            childCountMap={childCountMap}
            selectedTaskId={selectedTaskId}
            dragState={dragState}
            LABEL_WIDTH={LABEL_WIDTH}
            ROW_HEIGHT={ROW_HEIGHT}
            updateDragState={updateDragState}
            dragSnapshotRef={dragSnapshotRef}
            taskListRef={taskListRef}
            onTaskClick={handleTaskClick}
            toggleExpanded={toggleExpanded}
            handleTaskListScroll={handleTaskListScroll}
            onTaskDrop={handleTaskDrop}
            virtualizer={virtualizer}
          />

          <div
            className="flex-1 flex flex-col overflow-hidden min-w-0"
            ref={datePanelCallbackRef}
          >
            {/* Month headers — offset horizontally to sync with scroll */}
            <GanttMonthHeaders monthHeaders={monthHeaders} DAY_WIDTH={DAY_WIDTH} scrollLeft={scrollLeft} />

            {/* Day headers — offset horizontally to sync with scroll */}
            <GanttDayHeaders
              visibleDayRange={visibleDayRange}
              DAY_WIDTH={DAY_WIDTH}
              startDate={startDate}
              todayOffset={todayOffset}
              weekendHolidayIndices={weekendHolidayIndices}
              scrollLeft={scrollLeft}
            />

            {/* Scrollable task rows area — always rendered, ref always valid */}
            <div
              ref={dateScrollRef}
              className="flex-1 overflow-auto min-w-0"
              data-date-panel
              onClick={handleDatePanelClick}
            >
              <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
                <GanttTaskRows
                  virtualItems={virtualItems}
                  visibleTasks={visibleTasks}
                  visibleDayRange={visibleDayRange}
                  DAY_WIDTH={DAY_WIDTH}
                  totalWidth={totalWidth}
                  getTaskBarStyle={getTaskBarStyle}
                  weekendHolidayIndices={weekendHolidayIndices}
                  todayPosition={todayPosition}
                  selectedTaskId={selectedTaskId}
                  dragState={dragState}
                  onTaskClick={handleTaskClick}
                  onDatePanelClick={handleDatePanelClick}
                />
              </div>
            </div>
          </div>

          {/* Loading overlay — covers chart body only, toolbar stays visible */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">加载中...</p>
              </div>
            </div>
          )}

          {/* Empty overlay — covers chart body only, toolbar stays visible */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
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
          )}
        </div>
      </div>
    </GanttErrorBoundary>
  )
})
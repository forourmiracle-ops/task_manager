import { useMemo } from 'react'
import type { Task } from '@/types'
import { daysBetween, type MonthHeader } from './useGanttData'

export const MIN_DAY_WIDTH = 3
export const DIMENSION_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function overlapsRange(
  taskStart: string,
  taskEnd: string,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const s = new Date(taskStart)
  const e = new Date(taskEnd)
  return s <= rangeEnd && e >= rangeStart
}

export function useGanttViewport(params: {
  scrollLeft: number
  scrollWidth: number
  datePanelWidth: number
  dimension: string
  allFlatTasks: Task[]
  expandedIds: Set<string>
  parentMap: Map<string, string>
  startDate: Date
  endDate: Date
  totalDays: number
  monthHeaders: MonthHeader[]
  todayOffset: number
}) {
  const {
    scrollLeft, scrollWidth, datePanelWidth, dimension,
    allFlatTasks, expandedIds, parentMap,
    startDate, endDate, totalDays, monthHeaders, todayOffset,
  } = params

  const dimensionDays = useMemo(() => {
    return DIMENSION_DAYS[dimension] || 30
  }, [dimension])

  const DAY_WIDTH = useMemo(() => {
    if (datePanelWidth <= 0) return Math.max(MIN_DAY_WIDTH, 480 / dimensionDays)
    return Math.max(MIN_DAY_WIDTH, datePanelWidth / dimensionDays)
  }, [datePanelWidth, dimensionDays])

  const viewportRange = useMemo(() => {
    const effectiveWidth = scrollWidth || datePanelWidth || 800
    const startIndex = Math.floor(scrollLeft / DAY_WIDTH)
    const endIndex = Math.ceil((scrollLeft + effectiveWidth) / DAY_WIDTH)
    return {
      start: addDays(startDate, Math.max(0, startIndex)),
      end: addDays(startDate, Math.min(totalDays - 1, endIndex)),
    }
  }, [scrollLeft, scrollWidth, datePanelWidth, startDate, endDate, totalDays, DAY_WIDTH])

  const visibleTasks = useMemo(() => {
    return allFlatTasks.filter((t) => {
      if (!overlapsRange(t.start_date!, t.due_date!, viewportRange.start, viewportRange.end)) return false
      let currentId: string | null = t.parent_id ?? null
      while (currentId) {
        if (!expandedIds.has(currentId)) return false
        currentId = parentMap.get(currentId) ?? null
      }
      return true
    })
  }, [allFlatTasks, viewportRange, expandedIds, parentMap])

  const visibleDayRange = useMemo(() => {
    const effectiveWidth = scrollWidth || datePanelWidth || 800
    if (DAY_WIDTH <= 0) return { start: 0, end: totalDays }
    const pad = 2
    const start = Math.max(0, Math.floor(scrollLeft / DAY_WIDTH) - pad)
    const end = Math.min(totalDays, Math.ceil((scrollLeft + effectiveWidth) / DAY_WIDTH) + pad)
    return { start, end }
  }, [scrollLeft, scrollWidth, datePanelWidth, DAY_WIDTH, totalDays])

  return {
    DAY_WIDTH,
    dimensionDays,
    visibleDayRange,
    visibleTasks,
    viewportRange,
    startDate,
    endDate,
    totalDays,
    monthHeaders,
    todayOffset,
  }
}
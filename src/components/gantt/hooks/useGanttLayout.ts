import { useMemo, useCallback } from 'react'
import type { Task } from '@/types'
import { daysBetween } from './useGanttData'

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

export function isHoliday(d: Date): boolean {
  const m = d.getMonth() + 1
  const day = d.getDate()
  const mmdd = `${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return staticHolidays.has(mmdd)
}

const staticHolidays = new Set([
  '01-01', '05-01', '05-02', '05-03', '10-01', '10-02', '10-03',
])

export function getScrollTarget(
  viewStartMode: string,
  dimension: string,
  todayOffset: number,
  startDate: Date,
  DAY_WIDTH: number,
): number {
  switch (viewStartMode) {
    case 'today': {
      const panelWidth = document.querySelector('[data-date-panel]')?.clientWidth || 800
      return todayOffset * DAY_WIDTH - panelWidth / 2
    }
    case 'first': {
      const firstTask = findFirstTask(startDate, DAY_WIDTH)
      return firstTask ?? 0
    }
    default:
      return todayOffset * DAY_WIDTH
  }
}

function findFirstTask(startDate: Date, DAY_WIDTH: number): number | null {
  // This is a fallback — the actual first task position is computed by the caller
  return null
}

export function useGanttLayout(params: {
  allFlatTasks: Task[]
  visibleTasks: Task[]
  visibleDayRange: { start: number; end: number }
  DAY_WIDTH: number
  startDate: Date
  totalDays: number
  todayOffset: number
  dimension: string
  viewStartMode: string
}) {
  const {
    allFlatTasks, visibleDayRange, DAY_WIDTH, startDate, totalDays,
    todayOffset, dimension, viewStartMode,
  } = params

  const totalWidth = totalDays * DAY_WIDTH

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

  const todayPosition = todayOffset * DAY_WIDTH

  const scrollTarget = useMemo(() => {
    return getScrollTarget(viewStartMode, dimension, todayOffset, startDate, DAY_WIDTH)
  }, [viewStartMode, dimension, todayOffset, startDate, DAY_WIDTH])

  return {
    totalWidth,
    taskBarStyles,
    getTaskBarStyle,
    weekendHolidayIndices,
    todayPosition,
    scrollTarget,
  }
}
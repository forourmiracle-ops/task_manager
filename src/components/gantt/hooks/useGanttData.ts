import { useMemo } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { buildTaskTree, flattenTasks } from '@/lib/utils'

export const CHART_YEARS = 10

export function daysBetween(a: Date, b: Date): number {
  const aStart = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const bStart = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bStart.getTime() - aStart.getTime()) / (1000 * 60 * 60 * 24))
}

interface MonthHeader {
  label: string
  days: number
}

export function buildMonthHeaders(start: Date, end: Date): MonthHeader[] {
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

export function useGanttData() {
  const { data: tasks, isLoading } = useTasks()

  const allFlatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  const parentMap = useMemo(() => {
    const map = new Map<string, string>()
    allFlatTasks.forEach((t) => {
      if (t.parent_id) map.set(t.id, t.parent_id)
    })
    return map
  }, [allFlatTasks])

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

  const taskDateRange = useMemo(() => {
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

  return { tasks, isLoading, allFlatTasks, parentMap, childCountMap, taskDateRange }
}
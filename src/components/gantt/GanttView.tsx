import { useMemo, useRef, type CSSProperties } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'
import type { Task } from '@/types'

const DAY_WIDTH = 40
const ROW_HEIGHT = 32
const HEADER_HEIGHT = 40
const LABEL_WIDTH = 200

export function GanttView() {
  const { data: tasks, isLoading } = useTasks()
  const { setSelectedTaskId } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const flatTasks = useMemo(() => {
    if (!tasks) return []
    const tree = buildTaskTree(tasks)
    return flattenTasks(tree).filter((t) => t.start_date && t.due_date)
  }, [tasks])

  const { startDate, endDate, totalDays } = useMemo(() => {
    if (flatTasks.length === 0) {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return {
        startDate: start,
        endDate: end,
        totalDays: end.getDate(),
      }
    }
    const dates = flatTasks.flatMap((t) => [
      new Date(t.start_date!),
      new Date(t.due_date!),
    ])
    const start = new Date(Math.min(...dates.map((d) => d.getTime())))
    const end = new Date(Math.max(...dates.map((d) => d.getTime())))
    start.setDate(start.getDate() - 2)
    end.setDate(end.getDate() + 2)
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return { startDate: start, endDate: end, totalDays: Math.max(days, 30) }
  }, [flatTasks])

  const months = useMemo(() => {
    const result: { label: string; startDay: number; days: number }[] = []
    const current = new Date(startDate)
    while (current <= endDate) {
      const year = current.getFullYear()
      const month = current.getMonth()
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const startDay = Math.ceil(
        (current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      result.push({
        label: `${year}年${month + 1}月`,
        startDay,
        days: daysInMonth,
      })
      current.setMonth(month + 1)
    }
    return result
  }, [startDate, endDate])

  const getBarStyle = (task: Task): CSSProperties => {
    if (!task.start_date || !task.due_date) return { display: 'none' }
    const taskStart = new Date(task.start_date)
    const taskEnd = new Date(task.due_date)
    const startOffset = Math.ceil(
      (taskStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const duration = Math.ceil(
      (taskEnd.getTime() - taskStart.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1

    return {
      left: `${startOffset * DAY_WIDTH}px`,
      width: `${Math.max(duration * DAY_WIDTH, 20)}px`,
      top: '50%',
      transform: 'translateY(-50%)',
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Gantt header */}
      <div className="flex border-b border-border" style={{ height: HEADER_HEIGHT }}>
        <div
          className="flex-shrink-0 border-r border-border px-3 flex items-center text-xs font-medium bg-muted/30"
          style={{ width: LABEL_WIDTH }}
        >
          任务名称
        </div>
        <div className="flex-1 overflow-hidden">
          {/* Month headers */}
          <div className="flex h-5">
            {months.map((m, i) => (
              <div
                key={i}
                className="border-r border-border text-[10px] text-muted-foreground flex items-center justify-center bg-muted/20"
                style={{
                  width: `${m.days * DAY_WIDTH}px`,
                  marginLeft: i === 0 ? `${m.startDay * DAY_WIDTH}px` : 0,
                }}
              >
                {m.label}
              </div>
            ))}
          </div>
          {/* Day headers */}
          <div className="flex h-5 border-t border-border">
            {Array.from({ length: totalDays }).map((_, i) => {
              const d = new Date(startDate)
              d.setDate(d.getDate() + i)
              return (
                <div
                  key={i}
                  className="border-r border-border text-[9px] text-muted-foreground flex items-center justify-center"
                  style={{ width: DAY_WIDTH, flexShrink: 0 }}
                >
                  {d.getDate()}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Gantt body */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        {flatTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            暂无含日期的任务，请在任务详情中设置开始和截止日期
          </div>
        ) : (
          <div className="flex">
            {/* Task labels */}
            <div
              className="flex-shrink-0 border-r border-border bg-background"
              style={{ width: LABEL_WIDTH }}
            >
              {flatTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center px-3 border-b border-border cursor-pointer hover:bg-accent/50 transition-colors"
                  style={{
                    height: ROW_HEIGHT,
                    paddingLeft: `${8 + (task.depth ?? 0) * 16}px`,
                  }}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="text-xs truncate">{task.title}</span>
                </div>
              ))}
            </div>

            {/* Gantt bars */}
            <div className="flex-1 relative">
              {/* Grid lines */}
              {Array.from({ length: totalDays }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-r border-border/30"
                  style={{ left: `${i * DAY_WIDTH}px` }}
                />
              ))}

              {/* Today line */}
              {(() => {
                const today = new Date()
                const todayOffset = Math.ceil(
                  (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
                )
                if (todayOffset >= 0 && todayOffset < totalDays) {
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                      style={{ left: `${todayOffset * DAY_WIDTH + DAY_WIDTH / 2}px` }}
                    />
                  )
                }
                return null
              })()}

              {/* Task rows */}
              {flatTasks.map((task) => (
                <div
                  key={task.id}
                  className="relative border-b border-border/30"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className={cn(
                      'absolute rounded-full h-5 flex items-center px-2 cursor-pointer hover:opacity-80 transition-opacity z-10',
                      task.status === 'done'
                        ? 'bg-green-500'
                        : task.status === 'in_progress'
                        ? 'bg-blue-500'
                        : task.status === 'blocked'
                        ? 'bg-red-500'
                        : 'bg-gray-400'
                    )}
                    style={getBarStyle(task)}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <span className="text-[10px] text-white truncate">
                      {task.progress_percent > 0 ? `${task.progress_percent}%` : ''}
                    </span>
                  </div>
                </div>
              ))}

              <div style={{ height: ROW_HEIGHT * flatTasks.length }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
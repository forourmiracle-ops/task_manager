import { useState, useMemo } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import { buildTaskTree, flattenTasks, cn } from '@/lib/utils'

type ViewMode = 'month' | 'week' | 'day'

export function CalendarView() {
  const { data: tasks, isLoading } = useTasks()
  const { setSelectedTaskId } = useAppStore()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')

  const flatTasks = useMemo(() => {
    if (!tasks) return []
    return flattenTasks(buildTaskTree(tasks)).filter((t) => t.due_date)
  }, [tasks])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay()

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1)
    const dateStr = date.toISOString().split('T')[0]
    return {
      day: i + 1,
      dateStr,
      tasks: flatTasks.filter((t) => t.due_date === dateStr),
      isToday: new Date().toDateString() === date.toDateString(),
    }
  })

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">加载中...</div>
  }

  return (
    <div className="flex-1 flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="text-sm hover:text-foreground text-muted-foreground">
            ‹
          </button>
          <h2 className="text-sm font-semibold">
            {year}年{month + 1}月
          </h2>
          <button onClick={nextMonth} className="text-sm hover:text-foreground text-muted-foreground">
            ›
          </button>
        </div>
        <div className="flex gap-1 bg-muted rounded p-0.5">
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                'px-2 py-1 text-xs rounded',
                viewMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground'
              )}
            >
              {mode === 'month' ? '月' : mode === 'week' ? '周' : '日'}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Day headers */}
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <div key={d} className="bg-muted/30 p-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-background min-h-[80px]" />
        ))}

        {/* Day cells */}
        {days.map(({ day, tasks: dayTasks, isToday }) => (
          <div
            key={day}
            className={cn(
              'bg-background min-h-[80px] p-1 hover:bg-accent/20 transition-colors',
              isToday && 'ring-1 ring-inset ring-blue-400'
            )}
          >
            <div className={cn(
              'text-xs mb-1 w-5 h-5 flex items-center justify-center rounded-full',
              isToday && 'bg-blue-500 text-white'
            )}>
              {day}
            </div>
            <div className="space-y-0.5">
              {dayTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 truncate cursor-pointer hover:bg-blue-200"
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  {task.title}
                </div>
              ))}
              {dayTasks.length > 3 && (
                <div className="text-[10px] text-muted-foreground px-1">
                  +{dayTasks.length - 3} 更多
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
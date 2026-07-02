import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/types'
import { DependencyLines } from './DependencyLines'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-gray-500',
}

interface GanttTaskRowsProps {
  virtualItems: { index: number; start: number; size: number; key: number }[]
  visibleTasks: Task[]
  visibleDayRange: { start: number; end: number }
  DAY_WIDTH: number
  totalWidth: number
  getTaskBarStyle: (task: Task) => { left: number; width: number }
  weekendHolidayIndices: { weekendSet: Set<number>; holidaySet: Set<number> }
  todayPosition: number
  selectedTaskId: string | null
  dragState: { sourceId: string; targetIdx: number | null } | null
  onTaskClick: (id: string) => void
  onDatePanelClick: (e: React.MouseEvent) => void
}

export const GanttTaskRows = memo(function GanttTaskRows({
  virtualItems,
  visibleTasks,
  visibleDayRange,
  DAY_WIDTH,
  totalWidth,
  getTaskBarStyle,
  weekendHolidayIndices,
  todayPosition,
  selectedTaskId,
  dragState,
  onTaskClick,
  onDatePanelClick,
}: GanttTaskRowsProps) {
  const totalHeight = virtualItems.length > 0
    ? virtualItems[virtualItems.length - 1].start + virtualItems[virtualItems.length - 1].size
    : 0

  const ROW_HEIGHT = virtualItems.length > 0 ? virtualItems[0].size : 36

  return (
    <div
      style={{ minWidth: totalWidth, height: totalHeight, position: 'relative' }}
      onClick={onDatePanelClick}
    >
      {/* Dependency lines SVG overlay */}
      <DependencyLines
        tasks={visibleTasks}
        getBarStyle={getTaskBarStyle}
        rowHeight={ROW_HEIGHT}
      />

      {/* Today marker */}
      {todayPosition >= 0 && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: todayPosition * DAY_WIDTH + DAY_WIDTH / 2,
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

        const barOpacity = isChild ? 0.75 : 1
        const barTop = isChild ? 8 : 4
        const barBottom = isChild ? 8 : 4

        return (
          <div
            key={task.id}
            data-task-row
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

            {/* Weekend/holiday shading */}
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
                isSelected && 'ring-2 ring-primary ring-offset-1',
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
              onClick={() => onTaskClick(task.id)}
              title={`${task.title}\n${task.start_date} → ${task.due_date}\n进度: ${progressPercent}%`}
            >
              {/* Priority color marker on left */}
              <div
                className="absolute inset-y-0 left-0 rounded-l-md"
                style={{ width: 3, background: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
              />
              {/* Progress fill */}
              {progressPercent > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-l-md bg-white/25"
                  style={{ width: `${progressPercent}%`, left: 3 }}
                />
              )}
              <span
                className="absolute inset-0 flex items-center justify-center px-2 text-white font-medium truncate drop-shadow"
                style={{ paddingLeft: '10px', fontSize: '12px' }}
              >
                {task.title}
              </span>
            </div>
          </div>
        )
      })}

      {visibleTasks.length === 0 && (
        <div
          className="flex items-center justify-center py-12 text-muted-foreground text-xs"
          style={{ height: ROW_HEIGHT * 3 }}
        >
          当前可视范围内没有任务，请滚动或调整粒度
        </div>
      )}
    </div>
  )
})
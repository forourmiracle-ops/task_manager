import { memo } from 'react'
import { cn } from '@/lib/utils'

interface GanttDayHeadersProps {
  visibleDayRange: { start: number; end: number }
  DAY_WIDTH: number
  startDate: Date
  todayOffset: number
  weekendHolidayIndices: { weekendSet: Set<number>; holidaySet: Set<number> }
  scrollLeft: number
}

export const GanttDayHeaders = memo(function GanttDayHeaders({
  visibleDayRange,
  DAY_WIDTH,
  startDate,
  todayOffset,
  weekendHolidayIndices,
  scrollLeft,
}: GanttDayHeadersProps) {
  return (
    <div className="h-8 border-b border-border bg-muted/5 relative overflow-hidden">
      <div style={{ transform: `translateX(-${scrollLeft}px)`, willChange: 'transform' }}>
        {Array.from({ length: visibleDayRange.end - visibleDayRange.start }, (_, j) => {
          const i = visibleDayRange.start + j
          const d = new Date(startDate)
          d.setDate(d.getDate() + i)
          const w = weekendHolidayIndices.weekendSet.has(i)
          const h = weekendHolidayIndices.holidaySet.has(i)
          const isToday = i === todayOffset
          return (
            <div
              key={i}
              className={cn(
                'absolute flex flex-col items-center justify-center border-r border-border/60',
                w && !h && 'bg-red-50/20',
                h && 'bg-amber-50/30',
                isToday && 'bg-blue-50/50',
              )}
              style={{ left: i * DAY_WIDTH, width: DAY_WIDTH, height: '100%' }}
            >
              <span className={cn(
                'text-[11px] font-semibold leading-tight',
                isToday ? 'text-blue-600' : w ? 'text-red-400' : h ? 'text-amber-600' : 'text-foreground/60',
              )}>
                {d.getDate()}
              </span>
              <span className={cn(
                'text-[9px] leading-tight',
                isToday ? 'text-blue-500 font-semibold' : w ? 'text-red-300' : h ? 'text-amber-500' : 'text-muted-foreground/60',
              )}>
                {['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}
              </span>
              {h && <span className="text-[8px] text-amber-500 leading-none mt-0.5">休</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
})
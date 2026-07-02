import { memo } from 'react'

interface GanttMonthHeadersProps {
  monthHeaders: { label: string; days: number }[]
  DAY_WIDTH: number
}

export const GanttMonthHeaders = memo(function GanttMonthHeaders({
  monthHeaders,
  DAY_WIDTH,
}: GanttMonthHeadersProps) {
  return (
    <div className="h-7 border-b border-border bg-muted/10 text-[10px] text-muted-foreground font-medium relative overflow-hidden">
      {monthHeaders.reduce<{ els: React.ReactNode[]; offset: number }>((acc, mh, i) => {
        acc.els.push(
          <div
            key={i}
            className="absolute flex items-center justify-center border-r border-border font-bold text-[11px] text-foreground/80"
            style={{ left: acc.offset * DAY_WIDTH, width: mh.days * DAY_WIDTH, height: '100%' }}
          >
            {mh.label}
          </div>,
        )
        acc.offset += mh.days
        return acc
      }, { els: [], offset: 0 }).els}
    </div>
  )
})
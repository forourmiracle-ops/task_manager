import { useMemo, memo } from 'react'
import type { Task } from '@/types'

interface DependencyLinesProps {
  tasks: Task[]
  getBarStyle: (task: Task) => { left: number; width: number }
  rowHeight: number
}

export const DependencyLines = memo(function DependencyLines({
  tasks,
  getBarStyle,
  rowHeight,
}: DependencyLinesProps) {
  const rowIndex = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach((t, i) => map.set(t.id, i))
    return map
  }, [tasks])

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
})
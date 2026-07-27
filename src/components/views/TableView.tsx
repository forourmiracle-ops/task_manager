import { memo, useMemo, useCallback, useState } from 'react'
import { useTasks, useBatchCompleteTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import { buildTaskTree, flattenTasks, formatDate, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/utils'
import type { Task } from '@/types'

type SortField = 'title' | 'status' | 'priority' | 'due_date' | 'estimated_hours' | 'progress'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortField; label: string; width: string }[] = [
  { key: 'title', label: '任务名称', width: 'min-w-[200px] flex-1' },
  { key: 'status', label: '状态', width: 'w-20' },
  { key: 'priority', label: '优先级', width: 'w-20' },
  { key: 'due_date', label: '截止日期', width: 'w-28' },
  { key: 'estimated_hours', label: '预估工时', width: 'w-20' },
  { key: 'progress', label: '进度', width: 'w-20' },
]

export const TableView = memo(function TableView() {
  const { data: tasks, isLoading } = useTasks()
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  const selectedTaskId = useAppStore((s) => s.selectedTaskId)
  const batchComplete = useBatchCompleteTasks()

  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const tree = useMemo(() => buildTaskTree(tasks ?? []), [tasks])
  const flatTasks = useMemo(() => flattenTasks(tree), [tree])

  const sortedTasks = useMemo(() => {
    const sorted = [...flatTasks]
    sorted.sort((a, b) => {
      let cmp = 0
      const aVal = a[sortField] ?? ''
      const bVal = b[sortField] ?? ''
      if (aVal < bVal) cmp = -1
      else if (aVal > bVal) cmp = 1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [flatTasks, sortField, sortDir])

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField],
  )

  const handleComplete = useCallback(
    (e: React.MouseEvent, taskId: string) => {
      e.stopPropagation()
      batchComplete.mutate([taskId])
    },
    [batchComplete],
  )

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-sm text-muted-foreground">暂无任务</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击顶栏"新建项目"开始创建</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background overflow-auto">
      <table className="w-full table-fixed">
        {/* Header */}
        <thead className="sticky top-0 z-10 bg-muted/20">
          <tr className="border-b border-border">
            <th className="w-10 px-2" />
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`${col.width} px-3 py-2 text-left cursor-pointer hover:bg-muted/30 transition-colors`}
                onClick={() => handleSort(col.key)}
              >
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                  {col.label}
                  {sortField === col.key && (
                    <span className="text-primary">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            ))}
            <th className="w-12 px-2" />
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {sortedTasks.map((task) => {
            const isSelected = task.id === selectedTaskId
            const isDone = task.status === 'done'

            return (
              <tr
                key={task.id}
                className={`border-b border-border/50 transition-colors cursor-pointer group ${
                  isSelected
                    ? 'bg-primary/5 ring-1 ring-inset ring-primary/20'
                    : 'hover:bg-muted/20'
                } ${isDone ? 'opacity-60' : ''}`}
                onClick={() => setSelectedTaskId(task.id)}
              >
                {/* Drag handle */}
                <td className="w-10 px-2 py-1.5">
                  <div className="w-5 h-5 flex items-center justify-center text-muted-foreground/40 cursor-grab">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <circle cx="3" cy="2" r="1" />
                      <circle cx="7" cy="2" r="1" />
                      <circle cx="3" cy="5" r="1" />
                      <circle cx="7" cy="5" r="1" />
                      <circle cx="3" cy="8" r="1" />
                      <circle cx="7" cy="8" r="1" />
                    </svg>
                  </div>
                </td>

                {/* Title */}
                <td className="min-w-[200px] px-3 py-1.5">
                  <span
                    className={`text-xs truncate block ${isDone ? 'line-through text-muted-foreground' : 'text-foreground'} ${task.children?.length ? 'font-semibold' : ''}`}
                  >
                    {task.title}
                  </span>
                </td>

                {/* Status */}
                <td className="w-20 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[task.status] ?? task.status}</span>
                </td>

                {/* Priority */}
                <td className="w-20 px-3 py-1.5">
                  <span className={`text-[10px] font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                    {task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                  </span>
                </td>

                {/* Due date */}
                <td className="w-28 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {task.due_date ? formatDate(task.due_date) : '-'}
                  </span>
                </td>

                {/* Estimated hours */}
                <td className="w-20 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {task.estimated_hours ? `${task.estimated_hours}h` : '-'}
                  </span>
                </td>

                {/* Progress */}
                <td className="w-20 px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${task.progress_percent ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-7 text-right">
                      {task.progress_percent ?? 0}%
                    </span>
                  </div>
                </td>

                {/* Quick complete */}
                <td className="w-12 px-2 py-1.5">
                  {!isDone && (
                    <button
                      onClick={(e) => handleComplete(e, task.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-green-100 hover:text-green-600 transition-colors opacity-0 group-hover:opacity-100 text-muted-foreground"
                      title="快速完成"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
import { memo, useMemo, useCallback } from 'react'
import { useTasks, useBatchCompleteTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import { buildTaskTree, flattenTasks, formatDate, STATUS_LABELS, PRIORITY_COLORS } from '@/lib/utils'
import type { Task } from '@/types'

export const GalleryView = memo(function GalleryView() {
  const { data: tasks, isLoading } = useTasks()
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  const selectedTaskId = useAppStore((s) => s.selectedTaskId)
  const batchComplete = useBatchCompleteTasks()

  const tree = useMemo(() => buildTaskTree(tasks ?? []), [tasks])
  const flatTasks = useMemo(() => flattenTasks(tree), [tree])

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

  if (flatTasks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2">🎨</div>
          <p className="text-sm text-muted-foreground">暂无任务</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击顶栏"新建项目"开始创建</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {flatTasks.map((task) => {
          const isSelected = task.id === selectedTaskId
          const isDone = task.status === 'done'
          const totalChildren = task.children?.length ?? 0
          const doneChildren = task.children?.filter((c) => c.status === 'done').length ?? 0

          return (
            <div
              key={task.id}
              className={`group relative rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                  : 'border-border/50 hover:border-border hover:shadow-sm bg-card'
              } ${isDone ? 'opacity-60' : ''}`}
              onClick={() => setSelectedTaskId(task.id)}
            >
              {/* Cover color bar */}
              <div
                className={`h-1.5 rounded-t-xl ${
                  task.priority === 'urgent'
                    ? 'bg-red-500'
                    : task.priority === 'high'
                    ? 'bg-orange-400'
                    : task.priority === 'medium'
                    ? 'bg-blue-400'
                    : 'bg-gray-300'
                }`}
              />

              <div className="p-3 space-y-2">
                {/* Title */}
                <h4
                  className={`text-xs font-semibold leading-tight line-clamp-2 ${
                    isDone ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {task.title}
                </h4>

                {/* Meta */}
                <div className="flex flex-wrap gap-1">
                  <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] rounded-md bg-muted/50 text-muted-foreground">
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 text-[9px] rounded-md font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                    {task.priority === 'urgent' ? '紧急' : task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}
                  </span>
                </div>

                {/* Due date */}
                {task.due_date && (
                  <div className="text-[10px] text-muted-foreground">
                    {formatDate(task.due_date)}
                  </div>
                )}

                {/* Progress bar */}
                {totalChildren > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                      <span>子任务</span>
                      <span>{doneChildren}/{totalChildren}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${totalChildren > 0 ? (doneChildren / totalChildren) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Description preview */}
                {task.description && (
                  <p className="text-[10px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                    {task.description}
                  </p>
                )}

                {/* Quick complete button */}
                {!isDone && (
                  <button
                    onClick={(e) => handleComplete(e, task.id)}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 hover:bg-green-100 hover:text-green-600 transition-all shadow-sm opacity-0 group-hover:opacity-100 text-muted-foreground"
                    title="快速完成"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
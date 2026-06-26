import { useMemo } from 'react'
import { useTasks, useUpdateTask } from '@/hooks/useTasks'
import { useAppStore } from '@/store'
import { buildTaskTree, flattenTasks, STATUS_LABELS } from '@/lib/utils'
import type { TaskStatus } from '@/types'

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked']

export function BoardView() {
  const { data: tasks, isLoading } = useTasks()
  const updateTask = useUpdateTask()
  const { setSelectedTaskId } = useAppStore()

  const flatTasks = useMemo(() => {
    if (!tasks) return []
    return flattenTasks(buildTaskTree(tasks))
  }, [tasks])

  const columns = useMemo(() => {
    return COLUMNS.map((status) => ({
      status,
      tasks: flatTasks.filter((t) => t.status === status),
    }))
  }, [flatTasks])

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId)
  }

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    const taskId = e.dataTransfer.getData('taskId')
    if (taskId) {
      updateTask.mutate({ id: taskId, status })
    }
  }

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">加载中...</div>
  }

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-auto">
      {columns.map((col) => (
        <div
          key={col.status}
          className="flex-1 min-w-[200px] bg-muted/30 rounded-lg p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, col.status)}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{STATUS_LABELS[col.status]}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {col.tasks.length}
            </span>
          </div>
          <div className="space-y-2">
            {col.tasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onClick={() => setSelectedTaskId(task.id)}
                className="bg-background border border-border rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-xs font-medium flex-1">{task.title}</span>
                </div>
                {task.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {task.tags.map((tag) => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {task.progress_percent > 0 && (
                  <div className="mt-2 w-full bg-muted rounded-full h-1">
                    <div
                      className="bg-blue-500 h-1 rounded-full"
                      style={{ width: `${task.progress_percent}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
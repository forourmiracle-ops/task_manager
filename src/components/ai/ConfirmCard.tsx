import { memo } from 'react'

interface ConfirmCardProps {
  message: string
  taskTitle: string
  taskStatus: string
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmCard = memo(function ConfirmCard({
  message,
  taskTitle,
  taskStatus,
  onConfirm,
  onCancel,
}: ConfirmCardProps) {
  const statusLabel =
    taskStatus === 'todo' ? '待办' :
    taskStatus === 'in_progress' ? '进行中' :
    taskStatus === 'done' ? '已完成' :
    taskStatus === 'blocked' ? '阻塞' : taskStatus

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg px-4 py-3 text-sm bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs">⚠️</span>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {message}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          · [{taskTitle}] ({statusLabel})
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            确认删除
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
})
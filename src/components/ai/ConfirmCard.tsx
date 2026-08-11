import { memo } from 'react'

interface ConfirmCardProps {
  message: string
  taskTitle: string
  taskStatus: string
  /** 确认按钮文案，默认"确认" */
  confirmLabel?: string
  /** 工具名称，用于区分按钮颜色 */
  toolName?: string
  onConfirm: () => void
  onCancel: () => void
}

const STATUS_LABELS: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '阻塞',
}

/** delete_task 保持红色，create_task/update_task 使用主题主色 */
function getButtonClass(toolName: string): string {
  switch (toolName) {
    case 'delete_task':
      return 'bg-red-500 text-white hover:bg-red-600 shadow-sm'
    case 'create_task':
    case 'update_task':
      return 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
    default:
      return 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
  }
}

export const ConfirmCard = memo(function ConfirmCard({
  message,
  taskTitle,
  taskStatus,
  confirmLabel = '确认',
  toolName = '',
  onConfirm,
  onCancel,
}: ConfirmCardProps) {
  const statusLabel = STATUS_LABELS[taskStatus] || taskStatus
  const btnClass = getButtonClass(toolName)

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50/70 border-b border-amber-100">
          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white text-sm">
            !
          </span>
          <div>
            <div className="text-xs font-semibold text-amber-800">{message}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">
              {taskTitle}
              {statusLabel && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{statusLabel}</span>}
            </div>
          </div>
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-4 py-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${btnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
})
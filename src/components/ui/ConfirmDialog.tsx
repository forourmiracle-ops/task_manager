import { memo } from 'react'

interface ConfirmDialogProps {
  open: boolean
  message: string
  confirmLabel?: string
  partialLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onPartial: () => void
  onCancel: () => void
}

export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  message,
  confirmLabel = '确认',
  partialLabel = '仅完成此任务',
  cancelLabel = '取消',
  onConfirm,
  onPartial,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-background/80 backdrop-blur-sm">
      <div className="m-4 w-full max-w-sm border border-border rounded-xl bg-popover shadow-lg p-4">
        <p className="text-sm leading-relaxed text-center mb-4">{message}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 shadow-sm transition-all"
          >
            {confirmLabel}
          </button>
          <button
            onClick={onPartial}
            className="w-full py-2 text-xs font-medium border border-border rounded-lg hover:bg-accent transition-colors"
          >
            {partialLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
})
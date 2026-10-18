import { useReminderStore } from '@/store/reminder-store'
import { useAppStore } from '@/store'

/**
 * In-app toast queue for fired reminders — bottom-right stack, each card lets
 * the user jump straight into the task detail or dismiss. Complements the
 * browser notification so reminders still surface when notifications are
 * blocked or the tab is in the foreground.
 */
export function ReminderToastContainer() {
  const fired = useReminderStore((s) => s.fired)
  const dismissFired = useReminderStore((s) => s.dismissFired)
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)

  if (fired.length === 0) return null

  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-[calc(100vw-2rem)]">
      {fired.map((r) => (
        <div
          key={r.taskId}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card shadow-elevated reward-card-enter"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2a4 4 0 00-4 4c0 3-1 4-1.5 4.5h11C13 10 12 9 12 6a4 4 0 00-4-4z" />
              <path d="M6.5 13a1.5 1.5 0 003 0" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">任务提醒</p>
            <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{r.taskTitle}</p>
          </div>
          <button
            onClick={() => {
              setSelectedTaskId(r.taskId)
              dismissFired(r.taskId)
            }}
            className="px-2.5 py-1 text-[10px] font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all flex-shrink-0"
          >
            查看
          </button>
          <button
            onClick={() => dismissFired(r.taskId)}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors flex-shrink-0"
            title="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

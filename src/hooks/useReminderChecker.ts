import { useEffect } from 'react'
import { useReminderStore } from '@/store/reminder-store'

const CHECK_INTERVAL_MS = 30_000

/**
 * Background loop that fires due reminders. Mounted once at the App level.
 * Fired reminders move from `reminders` into the `fired` queue, surfaced as
 * in-app toasts plus a browser notification when permission was granted.
 */
export function useReminderChecker() {
  const fireReminder = useReminderStore((s) => s.fireReminder)

  useEffect(() => {
    const check = () => {
      const { reminders } = useReminderStore.getState()
      const now = Date.now()
      for (const entry of Object.values(reminders)) {
        const at = new Date(entry.remindAt).getTime()
        if (!Number.isNaN(at) && at <= now) {
          fireReminder(entry.taskId)
        }
      }
    }

    // Catch up immediately on mount (e.g. reminders that fired while closed),
    // then poll on a fixed interval
    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fireReminder])
}

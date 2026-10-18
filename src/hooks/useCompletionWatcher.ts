import { useEffect, useRef } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAuth } from '@/hooks/useAuth'
import { useGamificationStore } from '@/store/gamification-store'
import { useReminderStore } from '@/store/reminder-store'

/**
 * Watches the task list and fires a gamification reward whenever a task
 * transitions into `done`. Lives at the App level so every completion entry
 * point (quick-complete buttons, batch complete, detail panel, AI tools,
 * realtime sync from another device) is covered without touching them.
 *
 * The first snapshot after mount only establishes the baseline — historical
 * completions never trigger rewards.
 */
export function useCompletionWatcher() {
  const { data: tasks } = useTasks()
  const { userId } = useAuth()
  const recordCompletion = useGamificationStore((s) => s.recordCompletion)
  const backfill = useGamificationStore((s) => s.backfill)
  const prevRef = useRef<Map<string, string> | null>(null)

  useEffect(() => {
    if (!tasks || !userId) return

    const prev = prevRef.current
    const next = new Map<string, string>()

    if (!prev) {
      // First snapshot: import historical completions once so the stats panel
      // reflects reality, without firing reward animations for old tasks
      backfill(
        userId,
        tasks
          .filter((t) => t.status === 'done')
          .map((t) => ({ id: t.id, updated_at: t.updated_at, priority: t.priority })),
      )
    }

    for (const t of tasks) {
      next.set(t.id, t.status)
      if (!prev) continue
      const prevStatus = prev.get(t.id)
      if (t.status === 'done' && prevStatus && prevStatus !== 'done') {
        recordCompletion(userId, t.id, t.updated_at, t.priority, t.title)
        // A completed task no longer needs its reminder
        useReminderStore.getState().clearReminder(t.id)
      }
    }

    prevRef.current = next
  }, [tasks, userId, recordCompletion, backfill])
}

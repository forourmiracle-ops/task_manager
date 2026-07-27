import { useEffect, useRef } from 'react'
import { useRecurringTasks, useClaimRecurringTask } from '@/hooks/useTemplates'

/**
 * On app startup, checks for due recurring tasks and claims them atomically
 * via the Supabase RPC function to prevent multi-device race conditions.
 */
export function useRecurringTaskExecutor() {
  const { data: recurringTasks } = useRecurringTasks()
  const claimTask = useClaimRecurringTask()
  const executedRef = useRef(false)

  useEffect(() => {
    if (executedRef.current || !recurringTasks || recurringTasks.length === 0) return
    executedRef.current = true

    const now = new Date()
    const dueTasks = recurringTasks.filter(
      (rt) => rt.enabled && new Date(rt.next_run) <= now
    )

    if (dueTasks.length === 0) return

    // Execute sequentially to avoid overwhelming the server
    const executeAll = async () => {
      let createdCount = 0
      for (const rt of dueTasks) {
        try {
          const result = await claimTask.mutateAsync(rt.id)
          if (result) createdCount++
        } catch {
          // Another device may have claimed it first — that's expected
        }
      }
      if (createdCount > 0) {
        console.log(`[RecurringTaskExecutor] Generated ${createdCount} recurring task(s)`)
      }
    }

    executeAll()
  }, [recurringTasks, claimTask])
}
import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import { useAuth } from '@/hooks/useAuth'
import type { Task } from '@/types'

const MIGRATION_DONE_KEY = 'taskflow_local_migration_done'
const MIGRATION_NEEDED_KEY = 'taskflow_migration_needed'

export function LocalTaskMigration() {
  const queryClient = useQueryClient()
  const { userId } = useAuth()
  const [showDialog, setShowDialog] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null)
  const [localCount, setLocalCount] = useState(0)
  const [showManual, setShowManual] = useState(false)
  const [checked, setChecked] = useState(false)

  // Core check: independently query both localDB and Supabase to decide if migration is needed
  const checkMigrationNeeded = useCallback(async () => {
    if (!isSupabaseConfigured() || !userId) return

    try {
      const localTasks = await localDB.fetchTasks(userId)
      setLocalCount(localTasks.length)

      if (localTasks.length === 0) {
        // No local tasks — nothing to migrate
        setShowDialog(false)
        setShowManual(false)
        setChecked(true)
        return
      }

      // Query Supabase for current user's tasks
      const { data: remoteTasks, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .limit(1)

      const hasRemoteTasks = !error && remoteTasks && remoteTasks.length > 0

      if (hasRemoteTasks) {
        // User already has tasks in Supabase — only show manual merge button
        setShowDialog(false)
        setShowManual(true)
      } else {
        // Supabase has 0 tasks for this user — migration needed!
        // Show dialog regardless of previous flags
        setShowDialog(true)
        setShowManual(false)
        // Also set the flag so fetchTasks can fall back to local data
        localStorage.setItem(MIGRATION_NEEDED_KEY, '1')
      }
      setChecked(true)
    } catch (err) {
      console.warn('Migration check failed:', err)
      setChecked(true)
    }
  }, [userId])

  // Check on mount + retry after 2s to handle race with fetchTasks
  useEffect(() => {
    checkMigrationNeeded()
    const retryTimer = setTimeout(checkMigrationNeeded, 2000)
    return () => clearTimeout(retryTimer)
  }, [checkMigrationNeeded])

  const handleMigrate = async () => {
    setMigrating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setResult({ done: 0, failed: 0 })
      setMigrating(false)
      return
    }
    const tasks = await localDB.fetchTasks()
    let done = 0
    let failed = 0

    for (const task of tasks) {
      try {
        const { error } = await supabase
          .from('tasks')
          .insert({
            id: task.id,
            user_id: user.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            start_date: task.start_date,
            due_date: task.due_date,
            progress_percent: task.progress_percent,
            estimated_hours: task.estimated_hours,
            actual_hours: task.actual_hours,
            cycle_type: task.cycle_type,
            cycle_config: task.cycle_config,
            parent_id: task.parent_id,
            depends_on: task.depends_on,
            tags: task.tags,
            sort_order: task.sort_order,
            created_at: task.created_at,
            updated_at: task.updated_at,
          })
        if (error) {
          console.warn('Migration failed for task:', task.id, error)
          failed++
        } else {
          done++
        }
      } catch (err) {
        console.warn('Migration error for task:', task.id, err)
        failed++
      }
    }

    setResult({ done, failed })
    localStorage.setItem(MIGRATION_DONE_KEY, '1')
    localStorage.removeItem(MIGRATION_NEEDED_KEY)
    setMigrating(false)
    setShowManual(false)

    // Auto-refresh: invalidate query cache to reload from Supabase
    if (done > 0) {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
      }, 500)
    }
  }

  const handleSkip = () => {
    localStorage.setItem(MIGRATION_DONE_KEY, '1')
    localStorage.removeItem(MIGRATION_NEEDED_KEY)
    setShowDialog(false)
    setShowManual(false)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    setShowDialog(false)
  }

  // Don't render anything until the check is complete
  if (!checked) return null
  if (!showDialog && !showManual) return null

  // Manual trigger: Supabase has tasks but local also has tasks (merge scenario)
  if (showManual && !showDialog) {
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
        <button
          onClick={() => {
            localStorage.removeItem(MIGRATION_DONE_KEY)
            setShowDialog(true)
          }}
          className="px-4 py-2 text-xs font-semibold bg-amber-50 border border-amber-200 rounded-xl text-amber-700 hover:bg-amber-100 shadow-lg transition-colors"
        >
          发现 {localCount} 个本地任务 — 点击导入到云端
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl border border-border p-6 max-w-sm w-full mx-4">
        {result ? (
          <>
            <h3 className="text-sm font-bold mb-2">迁移完成</h3>
            <p className="text-xs text-muted-foreground mb-4">
              成功迁移 {result.done} 个任务
              {result.failed > 0 && `，${result.failed} 个失败`}
            </p>
            <button
              onClick={handleRefresh}
              className="w-full py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              刷新查看云端数据
            </button>
          </>
        ) : (
          <>
            <h3 className="text-sm font-bold mb-2">发现本地任务</h3>
            <p className="text-xs text-muted-foreground mb-4">
              检测到你之前在本设备上创建了 {localCount} 个任务。是否将它们迁移到云端账号？迁移后可在多设备间同步。
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                className="flex-1 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-accent"
                disabled={migrating}
              >
                跳过
              </button>
              <button
                onClick={handleMigrate}
                className="flex-1 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                disabled={migrating}
              >
                {migrating ? '迁移中...' : '迁移到云端'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
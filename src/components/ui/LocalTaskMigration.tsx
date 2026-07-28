import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { localDB, isSupabaseConfigured } from '@/lib/localStorage'
import type { Task } from '@/types'

const MIGRATION_FLAG_KEY = 'taskflow_local_migration_done'

export function LocalTaskMigration() {
  const [showDialog, setShowDialog] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null)

  const checkLocalTasks = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return

    try {
      const tasks = await localDB.fetchTasks()
      if (tasks.length > 0) {
        setShowDialog(true)
      }
      // Don't set flag here — only set when user explicitly skips or migrates
    } catch {
      // No local storage available, nothing to migrate
    }
  }, [])

  useEffect(() => {
    checkLocalTasks()
  }, [checkLocalTasks])

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
          failed++
        } else {
          done++
        }
      } catch {
        failed++
      }
    }

    setResult({ done, failed })
    localStorage.setItem(MIGRATION_FLAG_KEY, '1')
    setMigrating(false)
  }

  const handleSkip = () => {
    localStorage.setItem(MIGRATION_FLAG_KEY, '1')
    setShowDialog(false)
  }

  if (!showDialog) return null

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
              onClick={() => setShowDialog(false)}
              className="w-full py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
            >
              刷新页面查看
            </button>
          </>
        ) : (
          <>
            <h3 className="text-sm font-bold mb-2">发现本地任务</h3>
            <p className="text-xs text-muted-foreground mb-4">
              检测到你之前在本设备上创建的任务。是否将它们迁移到云端账号？迁移后可在多设备间同步。
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
import type { ToolDefinition, ToolContext } from './types'
import { fetchTasksForUser, updateTaskForUser } from '@/lib/task-service'

const MAX_BATCH = 50

export const updateTaskTool: ToolDefinition = {
  name: 'update_task',
  description:
    '更新任务字段。可更新标题、状态、优先级、截止日期、进度百分比等。支持批量更新（上限 50）。需提供 task_ids（任务 ID 列表）和要更新的字段。更新任务需要用户确认。',
  parameters: {
    type: 'object',
    properties: {
      task_ids: {
        type: 'array',
        items: { type: 'string' },
        description: '要更新的任务 ID 列表',
      },
      title: { type: 'string', description: '新标题' },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done', 'blocked'],
        description: '新状态',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: '新优先级',
      },
      due_date: { type: 'string', description: '新截止日期，格式 YYYY-MM-DD' },
      start_date: { type: 'string', description: '新开始日期，格式 YYYY-MM-DD' },
      progress_percent: { type: 'number', description: '进度百分比 0-100' },
      estimated_hours: { type: 'number', description: '预估工时（小时）' },
      parent_id: { type: 'string', description: '新的父任务 ID' },
      tags: { type: 'array', items: { type: 'string' }, description: '新标签列表' },
    },
    required: ['task_ids'],
  },
  async execute(args, _ctx) {
    const ids = (args.task_ids as string[]) || []
    if (ids.length === 0) {
      return { success: false, message: '未指定要更新的任务 ID。' }
    }
    if (ids.length > MAX_BATCH) {
      return {
        success: false,
        message: `批量更新数量（${ids.length}）超过上限（${MAX_BATCH}），请分批操作。`,
      }
    }

    // 返回确认提示，不直接写库
    return {
      success: true,
      message: `确认更新 ${ids.length} 个任务？`,
      requiresConfirmation: true,
      data: { taskTitle: ids.length === 1 ? `任务 ${ids[0]}` : `${ids.length} 个任务` },
    }
  },
}

/** 确认后实际执行更新任务 */
export async function executeUpdateTask(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ success: boolean; message: string }> {
  try {
    const ids = (args.task_ids as string[]) || []

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const updatableFields = [
      'title', 'status', 'priority', 'due_date', 'start_date',
      'progress_percent', 'estimated_hours', 'parent_id', 'tags',
    ]
    for (const field of updatableFields) {
      if (args[field] !== undefined) {
        updates[field] = args[field]
      }
    }

    if (Object.keys(updates).length <= 1) {
      return { success: false, message: '未提供任何要更新的字段。' }
    }

    const tasks = await fetchTasksForUser(ctx.userId)
    const taskMap = new Map(tasks.map((task) => [task.id, task]))
    const results: string[] = []
    for (const id of ids) {
      const current = taskMap.get(id)
      if (!current) {
        results.push(`❌ ${id}：未找到任务或任务不属于当前用户`)
        continue
      }
      try {
        const updated = await updateTaskForUser(ctx.userId, {
          id,
          ...updates,
          expectedUpdatedAt: current.updated_at,
        })
        results.push(`✅ ${updated.title}`)
      } catch (error) {
        results.push(`❌ ${id}：${error instanceof Error ? error.message : '未知错误'}`)
      }
    }

    const succeeded = results.filter((r) => r.startsWith('✅')).length
    const failed = results.filter((r) => r.startsWith('❌')).length

    return {
      success: failed === 0,
      message: `更新完成：${succeeded} 个成功${failed > 0 ? `，${failed} 个失败` : ''}\n${results.join('\n')}`,
    }
  } catch (err) {
    return {
      success: false,
      message: `更新任务失败：${err instanceof Error ? err.message : '未知错误'}`,
    }
  }
}

import type { ToolDefinition, ToolContext } from './types'

export const deleteTaskTool: ToolDefinition = {
  name: 'delete_task',
  description:
    '删除任务。此操作不可逆，需要用户确认。提供任务标题或 ID 均可，工具会自动按标题查找；若标题匹配多个任务，会返回列表让你明确。',
  parameters: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: '要删除的任务 ID（可选，提供标题或 ID 均可）' },
      task_title: { type: 'string', description: '任务标题，用于模糊匹配（可选，提供标题或 ID 均可）' },
    },
    required: [],
  },
  async execute(args, ctx) {
    const taskId = (args.task_id as string) || ''
    const taskTitle = (args.task_title as string) || ''

    // 有 ID 时沿用现有逻辑
    if (taskId) {
      const { data: task, error: lookupError } = await ctx.supabase
        .from('tasks')
        .select('id, title, status')
        .eq('id', taskId)
        .eq('user_id', ctx.userId)
        .single()

      if (lookupError || !task) {
        return { success: false, message: `未找到任务「${taskTitle || taskId}」，可能已被删除。` }
      }

      return {
        success: true,
        message: `确认删除任务「${(task as { title: string }).title}」？`,
        requiresConfirmation: true,
        data: { taskId, taskTitle: (task as { title: string }).title, taskStatus: (task as { status: string }).status },
      }
    }

    // 按标题模糊查找
    if (!taskTitle) {
      return { success: false, message: '请提供任务标题或 ID。' }
    }

    const { data: matches, error: searchError } = await ctx.supabase
      .from('tasks')
      .select('id, title, status')
      .eq('user_id', ctx.userId)
      .ilike('title', `%${taskTitle}%`)
      .limit(5)

    if (searchError) {
      return { success: false, message: `查找任务失败：${searchError.message}` }
    }

    if (!matches || matches.length === 0) {
      return { success: false, message: `未找到标题包含「${taskTitle}」的任务。` }
    }

    if (matches.length > 1) {
      const list = (matches as Array<{ id: string; title: string; status: string }>)
        .map((t) => `• ${t.title}（${t.status}）`)
        .join('\n')
      return {
        success: false,
        message: `找到 ${matches.length} 个匹配任务，请明确指定：\n${list}`,
      }
    }

    // 命中 1 个
    const match = matches[0] as { id: string; title: string; status: string }
    return {
      success: true,
      message: `确认删除任务「${match.title}」？`,
      requiresConfirmation: true,
      data: { taskId: match.id, taskTitle: match.title, taskStatus: match.status },
    }
  },
}

export async function executeDeleteTask(taskId: string, ctx: ToolContext): Promise<{
  success: boolean
  message: string
}> {
  try {
    const { error } = await ctx.supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', ctx.userId)

    if (error) throw error

    return { success: true, message: `任务已删除。` }
  } catch (err) {
    return {
      success: false,
      message: `删除失败：${err instanceof Error ? err.message : '未知错误'}`,
    }
  }
}
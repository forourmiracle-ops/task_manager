import type { ToolDefinition, ToolContext } from './types'

export const deleteTaskTool: ToolDefinition = {
  name: 'delete_task',
  description:
    '删除任务。此操作不可逆，需要用户确认。需提供 task_id 和任务标题（用于确认提示）。',
  parameters: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: '要删除的任务 ID' },
      task_title: { type: 'string', description: '任务标题（用于确认提示）' },
    },
    required: ['task_id', 'task_title'],
  },
  async execute(args, ctx) {
    const taskId = args.task_id as string
    const taskTitle = args.task_title as string

    if (!taskId || !taskTitle) {
      return { success: false, message: '缺少任务 ID 或标题。' }
    }

    // Verify the task exists and belongs to the user
    const { data: task, error: lookupError } = await ctx.supabase
      .from('tasks')
      .select('id, title, status')
      .eq('id', taskId)
      .eq('user_id', ctx.userId)
      .single()

    if (lookupError || !task) {
      return { success: false, message: `未找到任务「${taskTitle}」，可能已被删除。` }
    }

    return {
      success: true,
      message: `确认删除任务「${taskTitle}」？`,
      requiresConfirmation: true,
      data: { taskId, taskTitle, taskStatus: (task as { status: string }).status },
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
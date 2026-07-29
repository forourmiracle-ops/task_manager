import type { ToolDefinition, ToolContext } from './types'
import type { Task } from '@/types'

export const searchTasksTool: ToolDefinition = {
  name: 'search_tasks',
  description: '按条件搜索任务。可按关键词、状态、优先级、日期范围筛选。返回匹配的任务列表及其关键字段。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '任务标题或描述中搜索的关键词' },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done', 'blocked'],
        description: '按状态筛选',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: '按优先级筛选',
      },
      due_before: { type: 'string', description: '截止日期在此日期之前的任务，格式 YYYY-MM-DD' },
      due_after: { type: 'string', description: '截止日期在此日期之后的任务，格式 YYYY-MM-DD' },
      limit: { type: 'number', description: '返回结果数量上限，默认 20' },
    },
  },
  async execute(args, ctx) {
    const limit = (args.limit as number) || 20

    try {
      let query = ctx.supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, progress_percent, parent_id')
        .eq('user_id', ctx.userId)
        .limit(limit)

      if (args.keyword) {
        query = query.or(`title.ilike.%${args.keyword}%,description.ilike.%${args.keyword}%`)
      }
      if (args.status) {
        query = query.eq('status', args.status)
      }
      if (args.priority) {
        query = query.eq('priority', args.priority)
      }
      if (args.due_before) {
        query = query.lte('due_date', args.due_before)
      }
      if (args.due_after) {
        query = query.gte('due_date', args.due_after)
      }

      const { data, error } = await query.order('sort_order')

      if (error) throw error

      const tasks = (data as Task[]) || []
      if (tasks.length === 0) {
        return { success: true, message: '未找到匹配的任务。', data: [] }
      }

      const summary = tasks
        .map((t) => `· ${t.title} (${t.status}, ${t.priority}, 截止: ${t.due_date || '无'}, 进度: ${t.progress_percent}%)`)
        .join('\n')

      return {
        success: true,
        message: `找到 ${tasks.length} 个任务：\n${summary}`,
        data: tasks,
      }
    } catch (err) {
      return {
        success: false,
        message: `搜索失败：${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  },
}
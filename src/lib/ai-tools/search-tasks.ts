import type { ToolDefinition } from './types'
import { fetchTasksForUser } from '@/lib/task-service'

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
      const allTasks = await fetchTasksForUser(ctx.userId)
      const keyword = typeof args.keyword === 'string' ? args.keyword.trim().toLowerCase() : ''
      const tasks = allTasks
        .filter((task) => !keyword || `${task.title} ${task.description}`.toLowerCase().includes(keyword))
        .filter((task) => !args.status || task.status === args.status)
        .filter((task) => !args.priority || task.priority === args.priority)
        .filter((task) => !args.due_before || (task.due_date && task.due_date <= args.due_before))
        .filter((task) => !args.due_after || (task.due_date && task.due_date >= args.due_after))
        .slice(0, Math.max(1, Math.min(limit, 100)))
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

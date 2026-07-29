import type { ToolDefinition, ToolContext } from './types'
import type { Task } from '@/types'

export const analyzeTasksTool: ToolDefinition = {
  name: 'analyze_tasks',
  description:
    '分析当前项目整体状况。返回任务统计（各状态数量、优先级分布）、风险任务（逾期、阻塞）、进度概览。',
  parameters: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        enum: ['overview', 'risks', 'progress', 'all'],
        description: '分析焦点：overview=概览，risks=风险，progress=进度，all=全部（默认）',
      },
    },
  },
  async execute(args, ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, progress_percent, parent_id, depends_on')
        .eq('user_id', ctx.userId)

      if (error) throw error

      const tasks = (data as Task[]) || []
      if (tasks.length === 0) {
        return { success: true, message: '当前没有任务。' }
      }

      const focus = (args.focus as string) || 'all'

      // Status distribution
      const statusCounts: Record<string, number> = { todo: 0, in_progress: 0, done: 0, blocked: 0 }
      for (const t of tasks) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1
      }

      // Priority distribution
      const priorityCounts: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 }
      for (const t of tasks) {
        priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1
      }

      // Risk tasks (overdue or blocked)
      const today = new Date().toISOString().slice(0, 10)
      const overdue = tasks.filter(
        (t) => t.due_date && t.due_date < today && t.status !== 'done'
      )
      const blocked = tasks.filter((t) => t.status === 'blocked')
      const highPriorityPending = tasks.filter(
        (t) => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'done'
      )

      // Progress overview
      const totalProgress = tasks.length > 0
        ? Math.round(tasks.reduce((sum, t) => sum + t.progress_percent, 0) / tasks.length)
        : 0
      const doneRatio = tasks.length > 0
        ? Math.round((statusCounts.done / tasks.length) * 100)
        : 0

      const lines: string[] = [
        `## 项目分析`,
        ``,
        `**任务总数**：${tasks.length}`,
        `**平均进度**：${totalProgress}%`,
        `**完成率**：${doneRatio}%（${statusCounts.done}/${tasks.length}）`,
      ]

      if (focus === 'all' || focus === 'overview') {
        lines.push(
          ``,
          `### 状态分布`,
          `- 待办：${statusCounts.todo} 个`,
          `- 进行中：${statusCounts.in_progress} 个`,
          `- 已完成：${statusCounts.done} 个`,
          `- 阻塞：${statusCounts.blocked} 个`,
          ``,
          `### 优先级分布`,
          `- 低：${priorityCounts.low} 个`,
          `- 中：${priorityCounts.medium} 个`,
          `- 高：${priorityCounts.high} 个`,
          `- 紧急：${priorityCounts.urgent} 个`,
        )
      }

      if (focus === 'all' || focus === 'risks') {
        lines.push(``, `### 风险任务`)
        if (overdue.length > 0) {
          lines.push(`**逾期任务（${overdue.length} 个）**：`)
          for (const t of overdue.slice(0, 10)) {
            lines.push(`- ${t.title}（截止 ${t.due_date}，进度 ${t.progress_percent}%）`)
          }
          if (overdue.length > 10) lines.push(`  ... 还有 ${overdue.length - 10} 个`)
        } else {
          lines.push(`无逾期任务。`)
        }

        if (blocked.length > 0) {
          lines.push(``, `**阻塞任务（${blocked.length} 个）**：`)
          for (const t of blocked.slice(0, 10)) {
            lines.push(`- ${t.title}`)
          }
          if (blocked.length > 10) lines.push(`  ... 还有 ${blocked.length - 10} 个`)
        }

        if (highPriorityPending.length > 0) {
          lines.push(``, `**高优未完成任务（${highPriorityPending.length} 个）**：`)
          for (const t of highPriorityPending.slice(0, 10)) {
            lines.push(`- ${t.title}（${t.status}, ${t.priority}）`)
          }
        }
      }

      return {
        success: true,
        message: lines.join('\n'),
        data: { statusCounts, priorityCounts, overdue: overdue.length, blocked: blocked.length, totalProgress, doneRatio },
      }
    } catch (err) {
      return {
        success: false,
        message: `分析失败：${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  },
}
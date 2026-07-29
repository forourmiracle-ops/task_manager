import type { ToolDefinition, ToolContext } from './types'
import type { Task } from '@/types'

export const generateReportTool: ToolDefinition = {
  name: 'generate_report',
  description:
    '生成指定周期的任务摘要报告。支持日/周报，包含完成任务、进行中任务、新增任务、即将到期任务。',
  parameters: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['today', 'this_week', 'last_week', 'this_month'],
        description: '报告周期：today=今日，this_week=本周，last_week=上周，this_month=本月',
      },
    },
    required: ['period'],
  },
  async execute(args, ctx) {
    try {
      const period = args.period as string
      const now = new Date()
      let startDate: string
      let endDate: string
      let periodLabel: string

      switch (period) {
        case 'today':
          startDate = now.toISOString().slice(0, 10)
          endDate = startDate
          periodLabel = '今日'
          break
        case 'this_week': {
          const dayOfWeek = now.getDay()
          const monday = new Date(now)
          monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
          const sunday = new Date(monday)
          sunday.setDate(monday.getDate() + 6)
          startDate = monday.toISOString().slice(0, 10)
          endDate = sunday.toISOString().slice(0, 10)
          periodLabel = '本周'
          break
        }
        case 'last_week': {
          const dayOfWeek = now.getDay()
          const lastMonday = new Date(now)
          lastMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7)
          const lastSunday = new Date(lastMonday)
          lastSunday.setDate(lastMonday.getDate() + 6)
          startDate = lastMonday.toISOString().slice(0, 10)
          endDate = lastSunday.toISOString().slice(0, 10)
          periodLabel = '上周'
          break
        }
        case 'this_month':
          startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
          endDate = now.toISOString().slice(0, 10)
          periodLabel = '本月'
          break
        default:
          return { success: false, message: `不支持的周期类型：${period}` }
      }

      const { data, error } = await ctx.supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, progress_percent, created_at, updated_at')
        .eq('user_id', ctx.userId)

      if (error) throw error

      const tasks = (data as Task[]) || []

      // Completed in period
      const completed = tasks.filter(
        (t) => t.status === 'done' && t.updated_at && t.updated_at >= `${startDate}T00:00:00`
      )

      // In progress
      const inProgress = tasks.filter((t) => t.status === 'in_progress')

      // Created in period
      const created = tasks.filter(
        (t) => t.created_at && t.created_at >= `${startDate}T00:00:00`
      )

      // Due soon (within the period)
      const dueSoon = tasks.filter(
        (t) => t.due_date && t.due_date >= startDate && t.due_date <= endDate && t.status !== 'done'
      )

      const lines: string[] = [
        `## ${periodLabel}工作报告`,
        ``,
        `**周期**：${startDate} ~ ${endDate}`,
        ``,
        `### 已完成（${completed.length} 个）`,
        ...(completed.length > 0
          ? completed.slice(0, 10).map((t) => `- ${t.title}`)
          : ['无']),
        ``,
        `### 进行中（${inProgress.length} 个）`,
        ...(inProgress.length > 0
          ? inProgress.slice(0, 10).map((t) => `- ${t.title}（进度 ${t.progress_percent}%）`)
          : ['无']),
        ``,
        `### 新增任务（${created.length} 个）`,
        ...(created.length > 0
          ? created.slice(0, 10).map((t) => `- ${t.title}`)
          : ['无']),
        ``,
        `### 即将到期（${dueSoon.length} 个）`,
        ...(dueSoon.length > 0
          ? dueSoon.slice(0, 10).map((t) => `- ${t.title}（截止 ${t.due_date}）`)
          : ['无']),
      ]

      return {
        success: true,
        message: lines.join('\n'),
        data: { completed: completed.length, inProgress: inProgress.length, created: created.length, dueSoon: dueSoon.length },
      }
    } catch (err) {
      return {
        success: false,
        message: `生成报告失败：${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  },
}
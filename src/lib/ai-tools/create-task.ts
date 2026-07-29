import type { ToolDefinition, ToolContext } from './types'

const MAX_CHILDREN = 20

export const createTaskTool: ToolDefinition = {
  name: 'create_task',
  description:
    '创建新任务。可以创建单个任务或带子任务树的父任务。子任务数量上限为 20。需提供 title（必填），可选 status、priority、due_date、parent_id、estimated_hours、tags。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '任务标题（必填）' },
      description: { type: 'string', description: '任务描述' },
      status: {
        type: 'string',
        enum: ['todo', 'in_progress', 'done', 'blocked'],
        description: '任务状态，默认 todo',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: '优先级，默认 medium',
      },
      due_date: { type: 'string', description: '截止日期，格式 YYYY-MM-DD' },
      start_date: { type: 'string', description: '开始日期，格式 YYYY-MM-DD' },
      parent_id: { type: 'string', description: '父任务 ID（创建子任务时使用）' },
      estimated_hours: { type: 'number', description: '预估工时（小时）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      children: {
        type: 'array',
        description: '子任务列表，每个子任务需包含 title',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'blocked'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            due_date: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    required: ['title'],
  },
  async execute(args, ctx) {
    try {
      const children = (args.children as Array<Record<string, unknown>>) || []
      if (children.length > MAX_CHILDREN) {
        return {
          success: false,
          message: `子任务数量（${children.length}）超过上限（${MAX_CHILDREN}），请减少子任务数量。`,
        }
      }

      // Create parent task
      const { data: parent, error: parentError } = await ctx.supabase
        .from('tasks')
        .insert({
          title: args.title as string,
          description: (args.description as string) || '',
          status: (args.status as string) || 'todo',
          priority: (args.priority as string) || 'medium',
          due_date: (args.due_date as string) || null,
          start_date: (args.start_date as string) || null,
          parent_id: (args.parent_id as string) || null,
          estimated_hours: (args.estimated_hours as number) || null,
          tags: (args.tags as string[]) || [],
          user_id: ctx.userId,
        })
        .select('id, title')
        .single()

      if (parentError) throw parentError

      const created: string[] = [(parent as { id: string; title: string }).title]

      // Create children
      for (const child of children) {
        const { error: childError } = await ctx.supabase.from('tasks').insert({
          title: child.title as string,
          status: (child.status as string) || 'todo',
          priority: (child.priority as string) || 'medium',
          due_date: (child.due_date as string) || null,
          parent_id: (parent as { id: string }).id,
          user_id: ctx.userId,
        })

        if (childError) {
          return {
            success: false,
            message: `父任务「${(parent as { title: string }).title}」创建成功，但子任务「${child.title}」创建失败：${childError.message}`,
          }
        }
        created.push(child.title as string)
      }

      return {
        success: true,
        message: `任务创建成功：${created.join(' → ')}`,
        data: parent,
      }
    } catch (err) {
      return {
        success: false,
        message: `创建任务失败：${err instanceof Error ? err.message : '未知错误'}`,
      }
    }
  },
}
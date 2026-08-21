import type { ToolDefinition, ToolContext } from './types'
import type { TaskPriority, TaskStatus } from '@/types'
import { createTaskForUser } from '@/lib/task-service'

const MAX_CHILDREN = 20

export const createTaskTool: ToolDefinition = {
  name: 'create_task',
  description:
    '创建新任务。可以创建单个任务或带子任务树的父任务。子任务数量上限为 20。需提供 title（必填），可选 status、priority、due_date、parent_id、estimated_hours、tags。创建任务需要用户确认。',
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
  async execute(args, _ctx) {
    const children = (args.children as Array<Record<string, unknown>>) || []
    if (children.length > MAX_CHILDREN) {
      return {
        success: false,
        message: `子任务数量（${children.length}）超过上限（${MAX_CHILDREN}），请减少子任务数量。`,
      }
    }

    // 返回确认提示，不直接写库
    return {
      success: true,
      message: `确认创建任务「${args.title}」？`,
      requiresConfirmation: true,
      data: { taskTitle: args.title },
    }
  },
}

/** 确认后实际执行创建任务 */
export async function executeCreateTask(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ success: boolean; message: string }> {
  try {
    const children = (args.children as Array<Record<string, unknown>>) || []

    const parent = await createTaskForUser(ctx.userId, {
      title: args.title as string,
      description: (args.description as string) || '',
      status: (args.status as TaskStatus) || 'todo',
      priority: (args.priority as TaskPriority) || 'medium',
      due_date: (args.due_date as string) || null,
      start_date: (args.start_date as string) || null,
      parent_id: (args.parent_id as string) || null,
      estimated_hours: (args.estimated_hours as number) || null,
      tags: (args.tags as string[]) || [],
    })

    const created: string[] = [parent.title]

    for (const child of children) {
      try {
        await createTaskForUser(ctx.userId, {
          title: child.title as string,
          status: (child.status as TaskStatus) || 'todo',
          priority: (child.priority as TaskPriority) || 'medium',
          due_date: (child.due_date as string) || null,
          parent_id: parent.id,
        })
      } catch (error) {
        return {
          success: false,
          message: `父任务「${parent.title}」创建成功，但子任务「${child.title}」创建失败：${error instanceof Error ? error.message : '未知错误'}`,
        }
      }
      created.push(child.title as string)
    }

    return {
      success: true,
      message: `任务创建成功：${created.join(' → ')}`,
    }
  } catch (err) {
    return {
      success: false,
      message: `创建任务失败：${err instanceof Error ? err.message : '未知错误'}`,
    }
  }
}

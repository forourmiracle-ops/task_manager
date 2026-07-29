import { memo } from 'react'
import type { Message } from '@/store/ai-slice'

const TOOL_LABELS: Record<string, string> = {
  search_tasks: '搜索任务',
  create_task: '创建任务',
  update_task: '更新任务',
  delete_task: '删除任务',
  analyze_tasks: '分析项目',
  generate_report: '生成报告',
}

export const ToolCallCard = memo(function ToolCallCard({ message }: { message: Message }) {
  const label = TOOL_LABELS[message.toolName || ''] || message.toolName || '执行操作'

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg px-4 py-2.5 text-sm bg-muted/50 border border-border/50">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
          <span className="text-xs font-medium text-muted-foreground">
            正在{label}...
          </span>
        </div>
        {message.toolArgs && Object.keys(message.toolArgs).length > 0 && (
          <div className="mt-1.5 text-xs text-muted-foreground/70">
            {Object.entries(message.toolArgs)
              .filter(([, v]) => v !== undefined && v !== null)
              .slice(0, 3)
              .map(([key, value]) => (
                <div key={key} className="truncate">
                  <span className="font-medium">{key}:</span>{' '}
                  {Array.isArray(value) ? `${value.length} 项` : String(value)}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
})
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

export const ToolResultCard = memo(function ToolResultCard({ message }: { message: Message }) {
  const label = TOOL_LABELS[message.toolName || ''] || message.toolName || '操作'
  const success = message.toolSuccess

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm border ${
          success
            ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
            : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs">{success ? '✅' : '❌'}</span>
          <span className={`text-xs font-medium ${success ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {label}{success ? '完成' : '失败'}
          </span>
        </div>
        <div className="text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {message.content}
        </div>
      </div>
    </div>
  )
})
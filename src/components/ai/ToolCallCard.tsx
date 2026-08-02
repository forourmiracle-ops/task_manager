import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '@/store/ai-slice'

const TOOL_LABELS: Record<string, string> = {
  search_tasks: '搜索任务',
  create_task: '创建任务',
  update_task: '更新任务',
  delete_task: '删除任务',
  analyze_tasks: '分析项目',
  generate_report: '生成报告',
}

const TOOL_ICONS: Record<string, string> = {
  search_tasks: '🔍',
  create_task: '➕',
  update_task: '✏️',
  delete_task: '🗑️',
  analyze_tasks: '📊',
  generate_report: '📝',
}

function formatArgValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '无'
    return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('、')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const ARG_LABELS: Record<string, string> = {
  title: '标题',
  status: '状态',
  priority: '优先级',
  due_date: '截止日期',
  description: '描述',
  query: '关键词',
  progress_percent: '进度',
  estimated_hours: '预估工时',
  tags: '标签',
  depends_on: '依赖',
  start_date: '开始日期',
  parent_id: '父任务',
}

export const ToolCallCard = memo(function ToolCallCard({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false)
  const label = TOOL_LABELS[message.toolName || ''] || message.toolName || '执行操作'
  const icon = TOOL_ICONS[message.toolName || ''] || '🔧'
  const hasResult = message.toolSuccess !== undefined
  const isSuccess = message.toolSuccess === true
  const isRunning = !hasResult

  // Auto-expand on error
  const effectiveExpanded = hasResult && !isSuccess ? true : expanded

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'max-w-[85%] rounded-lg border transition-all duration-200 overflow-hidden',
          isRunning && 'bg-muted/30 border-border/30',
          hasResult && isSuccess && 'bg-emerald-50/60 border-emerald-200',
          hasResult && !isSuccess && 'bg-red-50/60 border-red-200',
        )}
      >
        {/* Summary row — always visible */}
        <button
          onClick={() => hasResult && setExpanded(!expanded)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-left',
            hasResult && 'cursor-pointer hover:bg-black/5',
          )}
        >
          {/* Status icon */}
          <span className="flex-shrink-0 text-sm">
            {isRunning ? (
              <span className="inline-flex w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : isSuccess ? (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] leading-none">✓</span>
            ) : (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none">✕</span>
            )}
          </span>

          {/* Label */}
          <span className={cn(
            'text-xs font-medium flex-1 truncate',
            isRunning && 'text-muted-foreground',
            hasResult && isSuccess && 'text-emerald-800',
            hasResult && !isSuccess && 'text-red-800',
          )}>
            {icon} {label}
          </span>

          {/* Status text */}
          <span className={cn(
            'text-[10px] flex-shrink-0',
            isRunning && 'text-muted-foreground animate-pulse',
            hasResult && isSuccess && 'text-emerald-600',
            hasResult && !isSuccess && 'text-red-600',
          )}>
            {isRunning ? '执行中...' : isSuccess ? '完成' : '失败'}
          </span>

          {/* Expand toggle */}
          {hasResult && (
            <svg
              width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={cn(
                'flex-shrink-0 transition-transform duration-200',
                effectiveExpanded && 'rotate-180',
                isSuccess ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          )}
        </button>

        {/* Expanded details */}
        {effectiveExpanded && (
          <div className="px-3 pb-2.5 space-y-2 border-t border-inherit">
            {/* Args */}
            {message.toolArgs && Object.keys(message.toolArgs).filter(k => message.toolArgs![k] !== undefined && message.toolArgs![k] !== null).length > 0 && (
              <div className="pt-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">参数</div>
                <div className="space-y-0.5">
                  {Object.entries(message.toolArgs)
                    .filter(([, v]) => v !== undefined && v !== null)
                    .map(([key, value]) => (
                      <div key={key} className="flex gap-2 text-xs">
                        <span className="text-muted-foreground flex-shrink-0 min-w-[60px]">
                          {ARG_LABELS[key] || key}
                        </span>
                        <span className="text-foreground font-medium truncate">
                          {formatArgValue(value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Result */}
            {hasResult && message.content && (
              <div className={cn(!message.toolArgs || Object.keys(message.toolArgs).filter(k => message.toolArgs![k] !== undefined && message.toolArgs![k] !== null).length === 0 ? 'pt-2' : '')}>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">结果</div>
                <div className={cn(
                  'text-xs leading-relaxed rounded-md px-2 py-1.5',
                  isSuccess ? 'bg-emerald-100/50 text-emerald-800' : 'bg-red-100/50 text-red-800',
                )}>
                  {message.content}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
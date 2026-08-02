import { memo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '@/store/ai-slice'
import { RichResultCard } from '@/components/ai/RichResultCard'

const TOOL_META: Record<string, { label: string; icon: string; color: string }> = {
  search_tasks:  { label: '搜索任务', icon: '🔍', color: 'from-blue-500 to-blue-600' },
  create_task:   { label: '创建任务', icon: '➕', color: 'from-emerald-500 to-emerald-600' },
  update_task:   { label: '更新任务', icon: '✏️', color: 'from-amber-500 to-amber-600' },
  delete_task:   { label: '删除任务', icon: '🗑️', color: 'from-red-500 to-red-600' },
  analyze_tasks: { label: '项目分析', icon: '📊', color: 'from-violet-500 to-violet-600' },
  generate_report:{ label: '生成报告', icon: '📝', color: 'from-cyan-500 to-cyan-600' },
}

const ARG_LABELS: Record<string, string> = {
  title: '标题', status: '状态', priority: '优先级',
  due_date: '截止日期', description: '描述', query: '关键词',
  progress_percent: '进度', estimated_hours: '预估工时',
  tags: '标签', depends_on: '依赖', start_date: '开始日期', parent_id: '父任务',
}

const STATUS_LABELS: Record<string, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞',
}
const PRIORITY_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', urgent: '紧急',
}

function formatArgValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (key === 'status') return STATUS_LABELS[String(value)] || String(value)
  if (key === 'priority') return PRIORITY_LABELS[String(value)] || String(value)
  if (key === 'progress_percent') return `${value}%`
  if (Array.isArray(value)) {
    if (value.length === 0) return '无'
    return value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join('、')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const ToolCallCard = memo(function ToolCallCard({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false)
  const meta = TOOL_META[message.toolName || ''] || { label: message.toolName || '执行操作', icon: '🔧', color: 'from-gray-400 to-gray-500' }
  const hasResult = message.toolSuccess !== undefined
  const isSuccess = message.toolSuccess === true
  const isRunning = !hasResult

  // Auto-expand on error
  const effectiveExpanded = hasResult && !isSuccess ? true : expanded

  const args = message.toolArgs
    ? Object.entries(message.toolArgs).filter(([, v]) => v !== undefined && v !== null && v !== '')
    : []

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'max-w-[85%] rounded-xl border transition-all duration-200 overflow-hidden shadow-sm',
          isRunning && 'bg-white border-border/40',
          hasResult && isSuccess && 'bg-white border-emerald-200',
          hasResult && !isSuccess && 'bg-white border-red-200',
        )}
      >
        {/* Summary row */}
        <button
          onClick={() => hasResult && setExpanded(!expanded)}
          className={cn(
            'w-full flex items-center gap-3 px-3.5 py-2.5 text-left group',
            hasResult && 'cursor-pointer hover:bg-muted/30',
          )}
        >
          {/* Gradient icon badge */}
          <span
            className={cn(
              'flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br flex items-center justify-center text-sm shadow-sm',
              isRunning ? 'bg-muted text-muted-foreground' : meta.color,
              isRunning && '!bg-muted',
            )}
          >
            {isRunning ? (
              <span className="inline-flex w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : isSuccess ? (
              <span className="text-white text-xs font-bold">✓</span>
            ) : (
              <span className="text-white text-xs font-bold">✕</span>
            )}
          </span>

          {/* Title + subtitle */}
          <span className="flex-1 min-w-0 text-left">
            <span className={cn(
              'text-xs font-semibold block truncate',
              isRunning && 'text-muted-foreground',
              hasResult && isSuccess && 'text-emerald-800',
              hasResult && !isSuccess && 'text-red-800',
            )}>
              {meta.icon} {meta.label}
            </span>
            <span className={cn(
              'text-[10px] block',
              isRunning && 'text-muted-foreground/60',
              hasResult && isSuccess && 'text-emerald-500',
              hasResult && !isSuccess && 'text-red-500',
            )}>
              {isRunning ? '正在执行...' : isSuccess ? '执行成功' : '执行失败'}
            </span>
          </span>

          {/* Expand chevron */}
          {hasResult && (
            <svg
              width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
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
          <div className="border-t border-border/40">
            {/* Args */}
            {args.length > 0 && (
              <div className="px-3.5 pt-3 pb-1">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  请求参数
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {args.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20"
                    >
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {ARG_LABELS[key] || key}
                      </span>
                      <span className="text-[11px] font-medium text-foreground truncate">
                        {formatArgValue(key, value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Result */}
            {hasResult && message.content && (
              <div className="px-3.5 py-3">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  执行结果
                </div>
                {message.toolData ? (
                  <RichResultCard message={message} />
                ) : (
                  <div className={cn(
                    'rounded-lg p-3 text-xs leading-relaxed border',
                    isSuccess
                      ? 'bg-emerald-50/70 text-emerald-800 border-emerald-100'
                      : 'bg-red-50/70 text-red-800 border-red-100',
                  )}>
                    {message.content}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
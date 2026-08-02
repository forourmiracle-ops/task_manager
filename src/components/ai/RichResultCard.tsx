import { memo } from 'react'
import { cn } from '@/lib/utils'
import type { Message } from '@/store/ai-slice'

// ─── Analyze Tasks Result ───────────────────────────────────────────

interface AnalyzeData {
  statusCounts: Record<string, number>
  priorityCounts: Record<string, number>
  overdue: number
  blocked: number
  totalProgress: number
  doneRatio: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; barColor: string }> = {
  todo:        { label: '待办',   color: 'text-slate-600', barColor: 'bg-slate-400' },
  in_progress: { label: '进行中', color: 'text-blue-600',  barColor: 'bg-blue-500' },
  done:        { label: '已完成', color: 'text-emerald-600', barColor: 'bg-emerald-500' },
  blocked:     { label: '阻塞',   color: 'text-red-600',   barColor: 'bg-red-500' },
}

const PRIORITY_CONFIG: Record<string, { label: string; dotColor: string; bgColor: string }> = {
  urgent: { label: '紧急', dotColor: 'bg-red-500',   bgColor: 'bg-red-50 text-red-700 border-red-200' },
  high:   { label: '高',   dotColor: 'bg-orange-500', bgColor: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { label: '中',   dotColor: 'bg-amber-500',  bgColor: 'bg-amber-50 text-amber-700 border-amber-200' },
  low:    { label: '低',   dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

function AnalyzeResult({ data }: { data: AnalyzeData }) {
  const total = Object.values(data.statusCounts).reduce((a, b) => a + b, 0)
  const maxStatus = Math.max(...Object.values(data.statusCounts), 1)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="任务总数" value={total} color="text-slate-700" />
        <SummaryCard label="平均进度" value={`${data.totalProgress}%`} color="text-blue-700" />
        <SummaryCard label="完成率" value={`${data.doneRatio}%`} color="text-emerald-700" />
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">总体进度</span>
          <span className="text-[10px] font-bold text-foreground">{data.totalProgress}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${data.totalProgress}%` }}
          />
        </div>
      </div>

      {/* Status distribution bars */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">状态分布</div>
        <div className="space-y-1.5">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = data.statusCounts[key] || 0
            const pct = maxStatus > 0 ? (count / maxStatus) * 100 : 0
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[10px] w-10 text-right text-muted-foreground flex-shrink-0">{cfg.label}</span>
                <div className="flex-1 h-4 rounded bg-muted/40 overflow-hidden">
                  <div
                    className={cn('h-full rounded transition-all duration-500', cfg.barColor)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn('text-[10px] font-bold w-6 flex-shrink-0', cfg.color)}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Priority tags */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">优先级分布</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => {
            const count = data.priorityCounts[key] || 0
            if (count === 0) return null
            return (
              <span key={key} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border', cfg.bgColor)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dotColor)} />
                {cfg.label} {count}
              </span>
            )
          })}
        </div>
      </div>

      {/* Risk warnings */}
      {(data.overdue > 0 || data.blocked > 0) && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">风险提醒</div>
          {data.overdue > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <span className="text-xs">⚠️</span>
              <span className="text-[11px] text-red-700">
                <strong>{data.overdue}</strong> 个任务已逾期
              </span>
            </div>
          )}
          {data.blocked > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
              <span className="text-xs">🚫</span>
              <span className="text-[11px] text-amber-700">
                <strong>{data.blocked}</strong> 个任务被阻塞
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-muted/30 to-muted/10 border border-border/40 px-3 py-2.5 text-center">
      <div className={cn('text-lg font-bold', color)}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

// ─── Generate Report Result ─────────────────────────────────────────

interface ReportData {
  completed: number
  inProgress: number
  created: number
  dueSoon: number
}

const REPORT_SECTIONS = [
  { key: 'completed', label: '已完成', icon: '✅', color: 'border-emerald-200 bg-emerald-50/50', textColor: 'text-emerald-700' },
  { key: 'inProgress', label: '进行中', icon: '🔄', color: 'border-blue-200 bg-blue-50/50', textColor: 'text-blue-700' },
  { key: 'created', label: '新增任务', icon: '➕', color: 'border-violet-200 bg-violet-50/50', textColor: 'text-violet-700' },
  { key: 'dueSoon', label: '即将到期', icon: '⏰', color: 'border-amber-200 bg-amber-50/50', textColor: 'text-amber-700' },
] as const

function ReportResult({ data }: { data: ReportData }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {REPORT_SECTIONS.map((section) => {
        const count = data[section.key as keyof ReportData] ?? 0
        return (
          <div key={section.key} className={cn('rounded-xl border px-3 py-2.5', section.color)}>
            <div className="text-xs mb-1">{section.icon}</div>
            <div className={cn('text-lg font-bold', section.textColor)}>{count}</div>
            <div className="text-[10px] text-muted-foreground">{section.label}</div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Search Tasks Result ────────────────────────────────────────────

interface TaskItem {
  id: string
  title: string
  status: string
  priority: string
  due_date?: string | null
  progress_percent: number
}

const STATUS_LABEL: Record<string, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞',
}
const STATUS_DOT: Record<string, string> = {
  todo: 'bg-slate-400', in_progress: 'bg-blue-500', done: 'bg-emerald-500', blocked: 'bg-red-500',
}
const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-emerald-400', medium: 'bg-amber-400', high: 'bg-orange-500', urgent: 'bg-red-500',
}

function SearchResult({ data }: { data: TaskItem[] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="text-center py-3 text-xs text-muted-foreground">
        未找到匹配的任务
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {data.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/40 transition-colors"
        >
          {/* Status dot */}
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[task.status] || 'bg-slate-400')} />

          {/* Title & meta */}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-foreground truncate">{task.title}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">{STATUS_LABEL[task.status] || task.status}</span>
              <span className="text-[10px] text-muted-foreground/50">·</span>
              <span className="flex items-center gap-0.5">
                <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_DOT[task.priority] || 'bg-slate-400')} />
                <span className="text-[10px] text-muted-foreground">{task.priority}</span>
              </span>
              {task.due_date && (
                <>
                  <span className="text-[10px] text-muted-foreground/50">·</span>
                  <span className="text-[10px] text-muted-foreground">截止 {task.due_date}</span>
                </>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                style={{ width: `${task.progress_percent}%` }}
              />
            </div>
            <span className="text-[10px] font-medium text-muted-foreground w-7 text-right">
              {task.progress_percent}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main RichResultCard ────────────────────────────────────────────

export const RichResultCard = memo(function RichResultCard({ message }: { message: Message }) {
  const toolName = message.toolName
  const toolData = message.toolData

  if (!toolData) return null

  switch (toolName) {
    case 'analyze_tasks':
      return <AnalyzeResult data={toolData as AnalyzeData} />

    case 'generate_report':
      return <ReportResult data={toolData as ReportData} />

    case 'search_tasks':
      return <SearchResult data={toolData as TaskItem[]} />

    default:
      return null
  }
})
import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useDailyTasksStore, todayStr, XP_DAILY_TASK, XP_PERFECT_DAY } from '@/store/daily-tasks-store'
import { useGamificationStore } from '@/store/gamification-store'
import { cn, PRIORITY_COLORS, PRIORITY_LABELS } from '@/lib/utils'
import type { Task } from '@/types'

/** Preset icons offered when creating a daily task */
const ICON_PRESETS = ['📌', '💧', '🏃', '📚', '🧘', '🍎', '💤', '📝', '🎯', '🧹', '💊', '🌱']

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

/** Animated SVG progress ring for today's daily-task completion */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const R = 34
  const CIRC = 2 * Math.PI * R
  const pct = total === 0 ? 0 : done / total
  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 84 84" className="w-24 h-24 -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-primary progress-ring-arc"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-bold text-foreground">{done}/{total}</span>
        <span className="text-[9px] text-muted-foreground mt-0.5">已打卡</span>
      </div>
    </div>
  )
}

/** Single daily-task row with animated checkbox and hover actions */
function DailyTaskRow({
  icon,
  title,
  checked,
  onToggle,
  onRemove,
}: {
  icon: string
  title: string
  checked: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  // XP floater shown briefly after each check
  const [floaterId, setFloaterId] = useState(0)

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors',
        checked
          ? 'border-primary/25 bg-primary/5'
          : 'border-border bg-card hover:border-primary/30',
      )}
    >
      <button
        onClick={() => {
          onToggle()
          if (!checked) setFloaterId(Date.now())
        }}
        className={cn(
          'relative w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
          checked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/40 hover:border-primary text-transparent',
        )}
        title={checked ? '取消打卡' : `打卡 +${XP_DAILY_TASK} XP`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={checked ? 'daily-check-pop' : ''}
        >
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
        {/* XP floater on check */}
        {floaterId > 0 && checked && (
          <span
            key={floaterId}
            className="xp-float-up absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-primary whitespace-nowrap pointer-events-none"
            onAnimationEnd={() => setFloaterId(0)}
          >
            +{XP_DAILY_TASK}
          </span>
        )}
      </button>

      <span className="text-base flex-shrink-0">{icon}</span>
      <span
        className={cn(
          'flex-1 text-sm truncate transition-colors',
          checked ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {title}
      </span>

      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 p-1 rounded-lg hover:bg-accent transition-all flex-shrink-0"
        title="删除该每日任务"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </button>
    </div>
  )
}

/** Compact row for a real task due today / overdue */
function DueTaskRow({ task, overdue }: { task: Task; overdue?: boolean }) {
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  return (
    <button
      onClick={() => setSelectedTaskId(task.id)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors text-left"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium }}
        title={PRIORITY_LABELS[task.priority]}
      />
      <span className="flex-1 text-sm text-foreground truncate">{task.title}</span>
      {overdue && (
        <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
          已逾期
        </span>
      )}
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground flex-shrink-0">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  )
}

/**
 * "Today" landing view — daily quests (check-in habits), tasks due today,
 * and overdue warnings. Dopamind-style daily dashboard.
 */
export function TodayView() {
  const { userId } = useAuth()
  const { data: tasks } = useTasks()
  const defs = useDailyTasksStore((s) => s.defs)
  const completions = useDailyTasksStore((s) => s.completions)
  const addDef = useDailyTasksStore((s) => s.addDef)
  const removeDef = useDailyTasksStore((s) => s.removeDef)
  const toggleToday = useDailyTasksStore((s) => s.toggleToday)
  const streak = useGamificationStore((s) => s.streak)
  const completionsByDate = useGamificationStore((s) => s.completionsByDate)

  const [newTitle, setNewTitle] = useState('')
  const [newIcon, setNewIcon] = useState(ICON_PRESETS[0])

  const today = todayStr()
  const todayMarks = completions[today] ?? {}
  const enabledDefs = useMemo(() => defs.filter((d) => d.enabled), [defs])
  const doneCount = enabledDefs.filter((d) => todayMarks[d.id]).length
  const allDone = enabledDefs.length > 0 && doneCount === enabledDefs.length

  const now = new Date()

  const { dueToday, overdue } = useMemo(() => {
    if (!tasks) return { dueToday: [] as Task[], overdue: [] as Task[] }
    const due: Task[] = []
    const over: Task[] = []
    for (const t of tasks) {
      if (t.status === 'done' || !t.due_date) continue
      if (t.due_date === today) due.push(t)
      else if (t.due_date < today) over.push(t)
    }
    over.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
    return { dueToday: due, overdue: over }
  }, [tasks, today])

  const handleAdd = () => {
    const title = newTitle.trim()
    if (!title || !userId) return
    addDef(userId, title, newIcon)
    setNewTitle('')
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10">
      <div className="max-w-2xl mx-auto px-4 py-5 md:py-8 flex flex-col gap-4">
        {/* Header card: greeting + progress ring + streak */}
        <div className="rounded-2xl border border-border bg-card p-4 md:p-5 flex items-center gap-4 shadow-sm">
          <ProgressRing done={doneCount} total={enabledDefs.length} />
          <div className="flex-1 min-w-0">
            <p className="text-base md:text-lg font-bold text-foreground leading-tight">
              {greeting()}，今天是 {now.getMonth() + 1} 月 {now.getDate()} 日 · 周{WEEKDAY_LABELS[now.getDay()]}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {allDone
                ? `🌟 每日任务全部完成，已领取 +${XP_PERFECT_DAY} XP 完美奖励！`
                : enabledDefs.length === 0
                  ? '还没有每日任务，从下方添加第一个打卡目标吧'
                  : `今日打卡进度 ${doneCount}/${enabledDefs.length}，全部完成可领取 +${XP_PERFECT_DAY} XP 完美奖励`}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-lg">
                🔥 连续 {streak} 天
              </span>
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                今日完成 {completionsByDate[today] ?? 0} 项
              </span>
            </div>
          </div>
        </div>

        {/* Daily quests */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">每日任务</h2>
            <span className="text-[10px] text-muted-foreground">每天重置 · 打卡 +{XP_DAILY_TASK} XP</span>
          </div>

          <div className="flex flex-col gap-2">
            {enabledDefs.map((d) => (
              <DailyTaskRow
                key={d.id}
                icon={d.icon}
                title={d.title}
                checked={!!todayMarks[d.id]}
                onToggle={() => userId && toggleToday(userId, d.id)}
                onRemove={() => removeDef(d.id)}
              />
            ))}
            {enabledDefs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                每日任务适合固定习惯：喝水、运动、背英语、复盘……
                <br />
                每天打卡可维持 🔥 连续记录
              </p>
            )}
          </div>

          {/* Add new daily task */}
          <div className="mt-3 pt-3 border-t border-border/60">
            <div className="flex items-center gap-1.5 mb-2 overflow-x-auto scrollbar-none">
              {ICON_PRESETS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewIcon(icon)}
                  className={cn(
                    'w-7 h-7 rounded-lg text-sm flex items-center justify-center flex-shrink-0 transition-all',
                    newIcon === icon ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-accent',
                  )}
                >
                  {icon}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="添加每日任务，如：背 20 个单词"
                className="flex-1 px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
              />
              <button
                onClick={handleAdd}
                disabled={!newTitle.trim()}
                className="px-3.5 py-2 text-xs font-bold bg-gradient-to-br from-primary to-blue-600 text-primary-foreground rounded-xl hover:brightness-110 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                添加
              </button>
            </div>
          </div>
        </section>

        {/* Due today */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground">今日到期</h2>
            <span className="text-[10px] text-muted-foreground">{dueToday.length} 项</span>
          </div>
          <div className="flex flex-col gap-2">
            {dueToday.map((t) => (
              <DueTaskRow key={t.id} task={t} />
            ))}
            {dueToday.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">今天没有到期任务，可以从容推进</p>
            )}
          </div>
        </section>

        {/* Overdue warning */}
        {overdue.length > 0 && (
          <section className="rounded-2xl border border-red-200 bg-red-50/50 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-red-600">⚠️ 逾期任务</h2>
              <span className="text-[10px] font-semibold text-red-500">{overdue.length} 项待处理</span>
            </div>
            <div className="flex flex-col gap-2">
              {overdue.slice(0, 5).map((t) => (
                <DueTaskRow key={t.id} task={t} overdue />
              ))}
              {overdue.length > 5 && (
                <p className="text-[10px] text-red-400 text-center pt-1">还有 {overdue.length - 5} 项，点击任务可打开详情处理</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

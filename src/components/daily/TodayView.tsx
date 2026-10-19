import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useAuth } from '@/hooks/useAuth'
import { useTasks } from '@/hooks/useTasks'
import { useDailyTasksStore, todayStr, segmentsFor, progressOf, XP_DAILY_TASK, XP_DAILY_SEGMENT, XP_PERFECT_DAY, type DailyTaskDef } from '@/store/daily-tasks-store'
import { useGamificationStore } from '@/store/gamification-store'
import { cn, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/utils'
import type { Task } from '@/types'

/** Preset icons offered when creating a daily task */
const ICON_PRESETS = ['📌', '💧', '🏃', '📚', '🧘', '🍎', '💤', '📝', '🎯', '🧹', '💊', '🌱']

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** Days until a YYYY-MM-DD date (negative = overdue) */
function daysUntil(dateStr: string): number {
  const today = new Date(`${todayStr()}T00:00:00`)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

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

/**
 * Dopamind-style big card for one daily task — the whole card is the tap
 * target. Segmented tasks (e.g. "喝2杯水") advance one segment per tap with
 * progress dots; completion pops a checkmark badge + XP floater.
 */
function DailyTaskCard({
  def,
  progress,
  onTap,
  onRemove,
}: {
  def: DailyTaskDef
  progress: number
  onTap: () => 'partial' | 'completed' | 'perfect' | 'unchecked'
  onRemove: () => void
}) {
  const [floater, setFloater] = useState<{ id: number; text: string } | null>(null)
  const total = segmentsFor(def)
  const segmented = total > 1
  const checked = progress >= total

  const handleTap = () => {
    const result = onTap()
    if (result === 'partial') {
      setFloater({ id: Date.now(), text: `+${XP_DAILY_SEGMENT}` })
    } else if (result === 'completed' || result === 'perfect') {
      setFloater({ id: Date.now(), text: `+${XP_DAILY_TASK} XP` })
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleTap()
        }
      }}
      className={cn(
        'group relative flex flex-col items-center gap-2 px-3 py-5 rounded-2xl border-2 cursor-pointer select-none transition-all',
        checked
          ? 'border-primary/50 bg-gradient-to-br from-primary/15 to-blue-500/10 shadow-md'
          : progress > 0
            ? 'border-primary/30 bg-primary/5 hover:border-primary/40 active:scale-[0.98]'
            : 'border-border bg-card hover:border-primary/30 hover:shadow-sm active:scale-[0.98]',
      )}
    >
      {/* Delete — always subtly visible on touch devices, hover-revealed on desktop */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground/60 md:text-muted-foreground/0 md:group-hover:text-muted-foreground hover:!text-red-500 hover:bg-accent transition-all"
        title="删除该每日任务"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3l10 10M13 3L3 13" />
        </svg>
      </button>

      {/* Icon with check badge */}
      <div className="relative">
        <span className="text-3xl md:text-4xl leading-none">{def.icon}</span>
        {checked && (
          <span className="absolute -right-2 -bottom-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="daily-check-pop">
              <path d="M3 8.5l3.5 3.5L13 4.5" />
            </svg>
          </span>
        )}
        {/* XP floater on tap */}
        {floater && (
          <span
            key={floater.id}
            className="xp-float-up absolute -top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-primary whitespace-nowrap pointer-events-none"
            onAnimationEnd={() => setFloater(null)}
          >
            {floater.text}
          </span>
        )}
      </div>

      <span
        className={cn(
          'text-sm font-medium text-center leading-snug break-all line-clamp-2 transition-colors',
          checked ? 'text-primary' : 'text-foreground',
        )}
      >
        {def.title}
      </span>

      {/* Segmented progress dots (≤10) or thin bar (>10) */}
      {segmented && (
        total <= 10 ? (
          <div className="flex items-center gap-1">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  i < progress ? 'bg-primary scale-110' : 'bg-muted-foreground/25',
                )}
              />
            ))}
          </div>
        ) : (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${(progress / total) * 100}%` }}
            />
          </div>
        )
      )}

      <span
        className={cn(
          'text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors',
          checked ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground',
        )}
      >
        {checked
          ? '已完成 ✓'
          : segmented
            ? progress > 0
              ? `${progress}/${total} · 点按 +1`
              : `共 ${total} 段 · 点按打卡`
            : `打卡 +${XP_DAILY_TASK} XP`}
      </span>
    </div>
  )
}

/** Urgency badge for an upcoming / overdue task */
function DueBadge({ task }: { task: Task }) {
  if (!task.due_date) {
    return (
      <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
        {STATUS_LABELS[task.status] ?? task.status}
      </span>
    )
  }
  const d = daysUntil(task.due_date)
  if (d < 0) {
    return (
      <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
        逾期{-d}天
      </span>
    )
  }
  if (d === 0) {
    return (
      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
        今天截止
      </span>
    )
  }
  if (d === 1) {
    return (
      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
        明天截止
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
      {d} 天后
    </span>
  )
}

/** Compact row for an upcoming / in-flight task — tap to open the detail panel */
function FocusTaskRow({ task }: { task: Task }) {
  const setSelectedTaskId = useAppStore((s) => s.setSelectedTaskId)
  const overdue = !!task.due_date && daysUntil(task.due_date) < 0
  return (
    <button
      onClick={() => setSelectedTaskId(task.id)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-colors text-left',
        overdue ? 'border-red-200 bg-red-50/40 hover:border-red-300' : 'border-border bg-card hover:border-primary/30',
      )}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium }}
        title={PRIORITY_LABELS[task.priority]}
      />
      <span className="flex-1 text-sm text-foreground truncate">{task.title}</span>
      <DueBadge task={task} />
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground flex-shrink-0">
        <path d="M6 3l5 5-5 5" />
      </svg>
    </button>
  )
}

/**
 * "Today" landing view — daily quest cards (Dopamind-style check-ins) plus a
 * focus list of in-flight and upcoming-due tasks for quick review.
 * Desktop uses a two-column layout to avoid dead space; mobile stacks.
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
  const [adding, setAdding] = useState(false)

  const today = todayStr()
  const todayMarks = completions[today] ?? {}
  const enabledDefs = useMemo(() => defs.filter((d) => d.enabled), [defs])
  const doneCount = enabledDefs.filter((d) => progressOf(todayMarks[d.id]) >= segmentsFor(d)).length
  const allDone = enabledDefs.length > 0 && doneCount === enabledDefs.length

  const now = new Date()

  /** Focus list: in-flight tasks + anything due within 7 days (overdue first) */
  const focusTasks = useMemo(() => {
    if (!tasks) return [] as Task[]
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 7)
    const horizonStr = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`
    return tasks
      .filter((t) => {
        if (t.status === 'done') return false
        if (t.due_date && t.due_date <= horizonStr) return true
        return t.status === 'in_progress'
      })
      .sort((a, b) => {
        // Dated tasks first (soonest on top), undated in-progress last
        if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1
        if (a.due_date) return -1
        if (b.due_date) return 1
        return 0
      })
  }, [tasks])

  const overdueCount = focusTasks.filter((t) => t.due_date && daysUntil(t.due_date) < 0).length

  const handleAdd = () => {
    const title = newTitle.trim()
    if (!title || !userId) return
    addDef(userId, title, newIcon)
    setNewTitle('')
    setAdding(false)
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-muted/10">
      <div className="max-w-2xl lg:max-w-6xl mx-auto px-4 py-5 md:py-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:items-start flex flex-col gap-4">
          {/* ===== Left column: header + daily quests ===== */}
          <div className="flex flex-col gap-4 min-w-0">
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
                      ? '还没有每日任务，点击下方卡片添加第一个打卡目标吧'
                      : `今日打卡进度 ${doneCount}/${enabledDefs.length}，全部完成可领取 +${XP_PERFECT_DAY} XP 完美奖励`}
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-lg">
                    🔥 连续 {streak} 天
                  </span>
                  <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg">
                    今日完成 {completionsByDate[today] ?? 0} 项
                  </span>
                </div>
              </div>
            </div>

            {/* Daily quests — Dopamind-style big cards */}
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">每日任务</h2>
                <span className="text-[10px] text-muted-foreground">每天重置 · 点卡打卡 · 带数量自动分段</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {enabledDefs.map((d) => (
                  <DailyTaskCard
                    key={d.id}
                    def={d}
                    progress={progressOf(todayMarks[d.id])}
                    onTap={() => (userId ? toggleToday(userId, d.id) : 'unchecked')}
                    onRemove={() => removeDef(d.id)}
                  />
                ))}

                {/* Add card — dashed placeholder, expands into the editor */}
                {!adding ? (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex flex-col items-center justify-center gap-2 px-3 py-5 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    <span className="text-xs font-medium">添加每日任务</span>
                  </button>
                ) : (
                  <div className="col-span-2 sm:col-span-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-3">
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
                        placeholder="如：喝 8 杯水（自动拆分分段打卡）"
                        autoFocus
                        className="flex-1 px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-1.5 focus:ring-ring"
                      />
                      <button
                        onClick={handleAdd}
                        disabled={!newTitle.trim()}
                        className="px-3.5 py-2 text-xs font-bold bg-gradient-to-br from-primary to-blue-600 text-primary-foreground rounded-xl hover:brightness-110 shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        添加
                      </button>
                      <button
                        onClick={() => setAdding(false)}
                        className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground rounded-xl hover:bg-accent transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {enabledDefs.length === 0 && !adding && (
                <p className="text-xs text-muted-foreground text-center pt-3">
                  每日任务适合固定习惯：喝水、运动、背英语、复盘…… 每天打卡可维持 🔥 连续记录
                </p>
              )}
            </section>
          </div>

          {/* ===== Right column: focus list (in-flight + due soon) ===== */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-foreground">近期任务</h2>
              <div className="flex items-center gap-2">
                {overdueCount > 0 && (
                  <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md">
                    {overdueCount} 项逾期
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">在做 + 7 天内到期</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
              {focusTasks.map((t) => (
                <FocusTaskRow key={t.id} task={t} />
              ))}
              {focusTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  近期没有在做或即将到期的任务
                  <br />
                  可以到项目视图规划新任务
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

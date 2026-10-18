import { useState } from 'react'
import { useGamificationStore, levelForXp, xpForLevel } from '@/store/gamification-store'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Last 7 calendar days as YYYY-MM-DD, oldest first */
function last7Days(): string[] {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return days
}

/**
 * Gamification summary widget. Sits in the app header: flame streak counter +
 * level badge with an XP progress bar. Click opens the full stats modal with
 * the 7-day completion trend. Mobile renders a compact flame chip.
 */
export function StatsBar() {
  const [open, setOpen] = useState(false)
  const xp = useGamificationStore((s) => s.xp)
  const streak = useGamificationStore((s) => s.streak)
  const bestStreak = useGamificationStore((s) => s.bestStreak)
  const totalCompleted = useGamificationStore((s) => s.totalCompleted)
  const completionsByDate = useGamificationStore((s) => s.completionsByDate)

  const level = levelForXp(xp)
  const levelFloor = xpForLevel(level)
  const levelCeil = xpForLevel(level + 1)
  const levelProgress = levelCeil > levelFloor ? (xp - levelFloor) / (levelCeil - levelFloor) : 0

  // Recomputed every render — cheap (7 iterations) and always fresh when the modal opens
  const week = last7Days()
  const weekCounts = week.map((d) => completionsByDate[d] ?? 0)
  const weekMax = Math.max(1, ...weekCounts)
  const todayCount = completionsByDate[todayStr()] ?? 0

  return (
    <>
      {/* Header widget */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-accent transition-colors"
        title="查看我的成就统计"
      >
        <span className="flex items-center gap-0.5 text-xs font-bold text-orange-500">
          🔥 {streak}
        </span>
        <span className="hidden sm:flex flex-col items-start gap-0.5">
          <span className="text-[10px] font-bold text-primary leading-none">Lv.{level}</span>
          <span className="w-12 h-1 rounded-full bg-muted overflow-hidden">
            <span
              className="block h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.round(levelProgress * 100)}%` }}
            />
          </span>
        </span>
      </button>

      {/* Stats modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] max-md:pt-0 bg-black/60 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="border border-border rounded-2xl max-md:rounded-none w-full max-w-sm max-md:max-w-full mx-4 max-md:mx-0 max-md:h-full overflow-hidden flex flex-col bg-background shadow-elevated">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/10">
              <h3 className="text-sm font-bold">我的成就</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-auto">
              {/* Level + XP */}
              <div className="bg-muted/20 rounded-xl p-3 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-primary">等级 Lv.{level}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {xp} / {levelCeil} XP
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.round(levelProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  再获得 {levelCeil - xp} XP 升至 Lv.{level + 1}（低/中/高/紧急 = 10/20/30/50 XP）
                </p>
              </div>

              {/* Streak + totals */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-muted/20 rounded-xl p-3 border border-border/50 text-center">
                  <p className="text-lg font-bold text-orange-500">🔥 {streak}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">连续打卡</p>
                </div>
                <div className="bg-muted/20 rounded-xl p-3 border border-border/50 text-center">
                  <p className="text-lg font-bold text-green-600">{todayCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">今日完成</p>
                </div>
                <div className="bg-muted/20 rounded-xl p-3 border border-border/50 text-center">
                  <p className="text-lg font-bold text-foreground">{totalCompleted}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">累计完成</p>
                </div>
              </div>

              {/* 7-day trend */}
              <div className="bg-muted/20 rounded-xl p-3 border border-border/50">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  近 7 天完成趋势
                </p>
                {weekCounts.every((c) => c === 0) ? (
                  <div className="h-20 flex items-center justify-center">
                    <p className="text-[11px] text-muted-foreground">完成任务后，这里会显示你的每日完成趋势</p>
                  </div>
                ) : (
                  <div className="flex items-end gap-1.5 h-20">
                    {week.map((day, i) => (
                      <div key={day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                        <span className="text-[9px] text-muted-foreground">{weekCounts[i] || ''}</span>
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${i === 6 ? 'bg-primary' : 'bg-primary/30'}`}
                          style={{ height: `${Math.max(4, (weekCounts[i] / weekMax) * 56)}px` }}
                          title={`${day.slice(5)}: ${weekCounts[i]} 个`}
                        />
                        <span className="text-[9px] text-muted-foreground/70">{day.slice(8)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {bestStreak > 0 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  最长连续纪录：{bestStreak} 天 · 每天至少完成 1 个任务即可延续打卡
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

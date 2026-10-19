import { useEffect, useMemo } from 'react'
import { useGamificationStore, type RewardVariant } from '@/store/gamification-store'

const CONFETTI_COLORS = ['#4D6BFE', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']
const GOLD_COLORS = ['#f59e0b', '#fbbf24', '#f97316', '#fde68a', '#eab308', '#ffffff']

interface Particle {
  left: number
  delay: number
  duration: number
  color: string
  size: number
  rotate: number
  drift: number
}

/** Per-variant presentation tuning */
const VARIANT_STYLE: Record<
  RewardVariant,
  { particles: number; displayMs: number; gold: boolean; icon: string }
> = {
  normal: { particles: 36, displayMs: 3000, gold: false, icon: '🎉' },
  bonus: { particles: 36, displayMs: 3000, gold: false, icon: '🎁' },
  milestone: { particles: 56, displayMs: 4200, gold: true, icon: '🏅' },
  perfect: { particles: 72, displayMs: 4600, gold: true, icon: '🌟' },
}

/**
 * Dopamind-style completion reward: confetti burst from the top + a floating
 * XP card. Variants: normal completion, streak milestone (golden), perfect day
 * (full golden burst + rays), level-up (trophy). Fully pointer-transparent.
 */
export function CelebrationOverlay() {
  const lastReward = useGamificationStore((s) => s.lastReward)
  const clearReward = useGamificationStore((s) => s.clearReward)

  const style = lastReward ? VARIANT_STYLE[lastReward.variant] : null

  const particles = useMemo<Particle[]>(() => {
    if (!lastReward || !style) return []
    const palette = style.gold ? GOLD_COLORS : CONFETTI_COLORS
    return Array.from({ length: style.particles }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.2,
      color: palette[i % palette.length],
      size: 5 + Math.random() * (style.gold ? 7 : 5),
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 120,
    }))
  }, [lastReward, style])

  useEffect(() => {
    if (!lastReward || !style) return
    const timer = setTimeout(clearReward, style.displayMs)
    return () => clearTimeout(timer)
  }, [lastReward, style, clearReward])

  if (!lastReward || !style) return null

  const golden = style.gold || lastReward.leveledUp
  const icon = lastReward.leveledUp ? '🏆' : style.icon

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden" aria-live="polite">
      {/* Confetti particles */}
      {particles.map((p, i) => (
        <span
          key={`${lastReward.id}-${i}`}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--drift' as string]: `${p.drift}px`,
            ['--rotate' as string]: `${p.rotate}deg`,
          }}
        />
      ))}

      {/* Perfect day: radiant backdrop behind the card */}
      {lastReward.variant === 'perfect' && (
        <div className="absolute left-1/2 bottom-24 md:bottom-16 -translate-x-1/2 translate-y-1/2 perfect-rays" />
      )}

      {/* Reward card */}
      <div className="absolute left-1/2 bottom-24 md:bottom-16 -translate-x-1/2 reward-card-enter">
        <div
          className={
            golden
              ? 'flex items-center gap-3 px-5 py-3 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100 shadow-[0_8px_30px_rgba(245,158,11,0.35)]'
              : 'flex items-center gap-3 px-5 py-3 rounded-2xl border border-border bg-card shadow-elevated'
          }
        >
          <div
            className={
              golden
                ? 'w-10 h-10 rounded-xl bg-amber-400/90 flex items-center justify-center text-xl flex-shrink-0 shadow-md'
                : 'w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0'
            }
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight">
              +{lastReward.xp} XP · {lastReward.message}
            </p>
            <p className="text-[11px] text-muted-foreground truncate max-w-[220px]">
              {lastReward.taskTitle}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {lastReward.streak > 1 && (
                <span className="text-[10px] font-semibold text-orange-500">
                  🔥 连续 {lastReward.streak} 天
                </span>
              )}
              {lastReward.leveledUp && (
                <span className="text-[10px] font-bold text-primary">
                  升级到 Lv.{lastReward.newLevel}！
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

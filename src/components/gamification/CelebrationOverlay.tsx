import { useEffect, useMemo } from 'react'
import { useGamificationStore } from '@/store/gamification-store'

const CONFETTI_COLORS = ['#4D6BFE', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']
const PARTICLE_COUNT = 36
const DISPLAY_MS = 3000

interface Particle {
  left: number
  delay: number
  duration: number
  color: string
  size: number
  rotate: number
  drift: number
}

/**
 * Dopamind-style completion reward: confetti burst from the top + a floating
 * XP card. Renders whenever the gamification store publishes a reward event,
 * then auto-dismisses. Fully pointer-transparent — never blocks interaction.
 */
export function CelebrationOverlay() {
  const lastReward = useGamificationStore((s) => s.lastReward)
  const clearReward = useGamificationStore((s) => s.clearReward)

  const particles = useMemo<Particle[]>(() => {
    if (!lastReward) return []
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 5 + Math.random() * 5,
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 120,
    }))
  }, [lastReward])

  useEffect(() => {
    if (!lastReward) return
    const timer = setTimeout(clearReward, DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [lastReward, clearReward])

  if (!lastReward) return null

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

      {/* Reward card */}
      <div className="absolute left-1/2 bottom-24 md:bottom-16 -translate-x-1/2 reward-card-enter">
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl border border-border bg-card shadow-elevated">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">
            {lastReward.leveledUp ? '🏆' : '🎉'}
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

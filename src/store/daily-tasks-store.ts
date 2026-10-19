import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useGamificationStore } from '@/store/gamification-store'

/** Flat XP for fully completing a daily task */
export const XP_DAILY_TASK = 15
/** Small silent XP per segment tap on a segmented daily task */
export const XP_DAILY_SEGMENT = 2
/** Bonus XP when every enabled daily task is completed in one day */
export const XP_PERFECT_DAY = 50

export interface DailyTaskDef {
  id: string
  title: string
  /** Emoji icon picked from a preset list */
  icon: string
  enabled: boolean
  createdAt: string
}

/**
 * Smart segmentation: titles containing a quantity like "喝2杯水" / "背10个单词"
 * become staged check-ins. Returns the segment count (1 = simple binary task).
 */
export function segmentsFor(def: DailyTaskDef): number {
  const m = def.title.match(/(\d+)\s*(?:杯|个|次|页|遍|组|章|节|分钟|下|题|圈|条|公里|km|单词)?/i)
  if (!m) return 1
  const n = parseInt(m[1], 10)
  return n >= 2 && n <= 20 ? n : 1
}

/** Progress of one def on one day. Older data stored an ISO string = done (1) */
export function progressOf(v: number | string | undefined): number {
  if (typeof v === 'number') return v
  return v ? 1 : 0
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr(): string {
  return dateStr(new Date())
}

function genId(): string {
  return `dt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

interface DailyTasksState {
  /** Bound account — daily tasks reset if a different user signs in */
  userId: string | null
  defs: DailyTaskDef[]
  /** dateStr -> defId -> completed segment count (1 = done for binary tasks) */
  completions: Record<string, Record<string, number>>
  /** Dates for which the perfect-day bonus was already awarded */
  perfectDays: Record<string, true>
  addDef: (userId: string, title: string, icon: string) => void
  removeDef: (id: string) => void
  setEnabled: (id: string, enabled: boolean) => void
  /**
   * Tap a daily task card.
   * - Segmented task (e.g. "喝2杯水"): each tap advances one segment with a
   *   small silent XP grant; the final segment awards full XP + celebration.
   * - Binary task: tap toggles done.
   * - Tapping a fully completed card resets it (already-awarded XP is kept —
   *   documented generous rule).
   * Checking the final segment may trigger the perfect-day bonus.
   * @returns 'partial' | 'completed' | 'perfect' | 'unchecked'
   */
  toggleToday: (userId: string, defId: string) => 'partial' | 'completed' | 'perfect' | 'unchecked'
}

export const useDailyTasksStore = create<DailyTasksState>()(
  persist(
    (set, get) => ({
      userId: null,
      defs: [],
      completions: {},
      perfectDays: {},

      addDef: (userId, title, icon) => {
        const state = get()
        const base = state.userId && state.userId !== userId
          ? { defs: [] as DailyTaskDef[], completions: {} as Record<string, Record<string, number>>, perfectDays: {} as Record<string, true> }
          : state
        const def: DailyTaskDef = {
          id: genId(),
          title: title.trim(),
          icon,
          enabled: true,
          createdAt: new Date().toISOString(),
        }
        set({ userId, defs: [...base.defs, def], completions: base.completions, perfectDays: base.perfectDays })
      },

      removeDef: (id) => {
        const state = get()
        // Also purge historical checkmarks for this def
        const completions: Record<string, Record<string, number>> = {}
        for (const [date, marks] of Object.entries(state.completions)) {
          const rest = { ...marks }
          delete rest[id]
          completions[date] = rest
        }
        set({ defs: state.defs.filter((d) => d.id !== id), completions })
      },

      setEnabled: (id, enabled) => {
        set({ defs: get().defs.map((d) => (d.id === id ? { ...d, enabled } : d)) })
      },

      toggleToday: (userId, defId) => {
        const state = get()
        // Switch account → reset instead of leaking across users
        const base = state.userId && state.userId !== userId
          ? { defs: [] as DailyTaskDef[], completions: {} as Record<string, Record<string, number>>, perfectDays: {} as Record<string, true> }
          : state
        const def = base.defs.find((d) => d.id === defId)
        if (!def) return 'unchecked'

        const today = todayStr()
        const todayMarks = { ...(base.completions[today] ?? {}) }
        const gamification = useGamificationStore.getState()
        const total = segmentsFor(def)
        const current = progressOf(todayMarks[defId])

        // Fully done → tap again resets (XP already awarded is kept)
        if (current >= total) {
          delete todayMarks[defId]
          set({
            userId,
            defs: base.defs,
            perfectDays: base.perfectDays,
            completions: { ...base.completions, [today]: todayMarks },
          })
          return 'unchecked'
        }

        const next = current + 1
        todayMarks[defId] = next
        const checkedAt = new Date().toISOString()

        const isFinalSegment = next >= total

        if (isFinalSegment) {
          // Full completion: award XP via the gamification store. Synthetic
          // taskId + check timestamp make the built-in dedupe allow one reward
          // per def per day, and the completion feeds today's streak.
          gamification.recordCompletion(userId, `daily:${defId}`, checkedAt, 'low', `${def.icon} ${def.title}`, XP_DAILY_TASK)
        } else {
          // Segment tick: small XP, silent (no celebration overlay per tap)
          gamification.recordCompletion(userId, `daily:${defId}#${next}`, checkedAt, 'low', `${def.icon} ${def.title}`, XP_DAILY_SEGMENT, true)
        }

        // Perfect day: every enabled def fully completed and bonus not yet awarded
        const enabledDefs = base.defs.filter((d) => d.enabled)
        const isPerfect =
          enabledDefs.length > 0 &&
          enabledDefs.every((d) => progressOf(todayMarks[d.id]) >= segmentsFor(d)) &&
          !base.perfectDays[today]

        set({
          userId,
          defs: base.defs,
          completions: { ...base.completions, [today]: todayMarks },
          perfectDays: isPerfect ? { ...base.perfectDays, [today]: true } : base.perfectDays,
        })

        if (isPerfect) {
          gamification.awardBonusXp(userId, XP_PERFECT_DAY, '完美一天', '每日任务全部完成！', 'perfect')
          return 'perfect'
        }
        return isFinalSegment ? 'completed' : 'partial'
      },
    }),
    {
      name: 'taskflow-daily-tasks',
      version: 1,
    },
  ),
)

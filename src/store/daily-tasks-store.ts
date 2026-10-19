import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useGamificationStore } from '@/store/gamification-store'

/** Flat XP for checking off a daily task */
export const XP_DAILY_TASK = 15
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
  /** dateStr -> defId -> ISO check time. Drives the per-day checklist */
  completions: Record<string, Record<string, string>>
  /** Dates for which the perfect-day bonus was already awarded */
  perfectDays: Record<string, true>
  addDef: (userId: string, title: string, icon: string) => void
  removeDef: (id: string) => void
  setEnabled: (id: string, enabled: boolean) => void
  /**
   * Check / uncheck a daily task for today.
   * Checking awards XP through the gamification store (which also feeds the
   * streak) and may trigger a perfect-day bonus. Unchecking only removes the
   * check mark — already-awarded XP is kept (documented behaviour).
   * @returns 'checked' | 'unchecked' | 'perfect' — lets the UI pick an animation
   */
  toggleToday: (userId: string, defId: string) => 'checked' | 'unchecked' | 'perfect'
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
          ? { defs: [] as DailyTaskDef[], completions: {} as Record<string, Record<string, string>>, perfectDays: {} as Record<string, true> }
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
        const completions: Record<string, Record<string, string>> = {}
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
          ? { defs: [] as DailyTaskDef[], completions: {} as Record<string, Record<string, string>>, perfectDays: {} as Record<string, true> }
          : state
        const def = base.defs.find((d) => d.id === defId)
        if (!def) return 'unchecked'

        const today = todayStr()
        const todayMarks = { ...(base.completions[today] ?? {}) }
        const gamification = useGamificationStore.getState()

        if (todayMarks[defId]) {
          // Uncheck — XP already awarded is kept (simple, generous rule)
          delete todayMarks[defId]
          set({
            userId,
            defs: base.defs,
            perfectDays: base.perfectDays,
            completions: { ...base.completions, [today]: todayMarks },
          })
          return 'unchecked'
        }

        const checkedAt = new Date().toISOString()
        todayMarks[defId] = checkedAt

        // Award XP via the gamification store. Synthetic taskId + the check
        // timestamp make the built-in dedupe naturally allow one reward per
        // def per day, and the completion feeds today's streak.
        gamification.recordCompletion(userId, `daily:${defId}`, checkedAt, 'low', `${def.icon} ${def.title}`, XP_DAILY_TASK)

        // Perfect day: every enabled def is now checked and the bonus hasn't
        // been awarded for today yet
        const enabledDefs = base.defs.filter((d) => d.enabled)
        const isPerfect =
          enabledDefs.length > 0 &&
          enabledDefs.every((d) => todayMarks[d.id]) &&
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
        return 'checked'
      },
    }),
    {
      name: 'taskflow-daily-tasks',
      version: 1,
    },
  ),
)

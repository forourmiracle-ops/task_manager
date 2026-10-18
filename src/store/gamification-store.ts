import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TaskPriority } from '@/types'

/** XP reward per priority — higher priority tasks yield more XP */
export const XP_BY_PRIORITY: Record<TaskPriority, number> = {
  low: 10,
  medium: 20,
  high: 30,
  urgent: 50,
}

/** Level curve: level N requires 50 * (N-1)^2 XP. Level 1 starts at 0 XP. */
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1
}

export function xpForLevel(level: number): number {
  return 50 * (level - 1) * (level - 1)
}

export interface RewardEvent {
  id: number
  xp: number
  message: string
  taskTitle: string
  leveledUp: boolean
  newLevel: number
  streak: number
}

const REWARD_MESSAGES = [
  '干得漂亮！',
  '保持节奏！',
  '又搞定一个！',
  '状态火热！',
  '效率拉满！',
  '势不可挡！',
]

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return dateStr(new Date())
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dateStr(d)
}

/** Longest run of consecutive days in a set of YYYY-MM-DD strings */
function longestRun(dates: Set<string>): number {
  let best = 0
  for (const start of dates) {
    const prev = new Date(`${start}T00:00:00`)
    prev.setDate(prev.getDate() - 1)
    if (dates.has(dateStr(prev))) continue // not a run start
    let len = 1
    const cursor = new Date(`${start}T00:00:00`)
    while (true) {
      cursor.setDate(cursor.getDate() + 1)
      if (!dates.has(dateStr(cursor))) break
      len++
    }
    best = Math.max(best, len)
  }
  return best
}

/** Streak still alive today: consecutive days ending today or yesterday */
function currentRun(dates: Set<string>): number {
  let cursor = new Date()
  if (!dates.has(dateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!dates.has(dateStr(cursor))) return 0
  }
  let len = 0
  while (dates.has(dateStr(cursor))) {
    len++
    cursor.setDate(cursor.getDate() - 1)
  }
  return len
}

interface GamificationState {
  /** Bound account — gamification data resets if a different user signs in */
  userId: string | null
  xp: number
  totalCompleted: number
  streak: number
  bestStreak: number
  lastActiveDate: string | null
  /** Completion count per day (YYYY-MM-DD), drives the 7-day trend chart */
  completionsByDate: Record<string, number>
  /** Dedupe guard: taskId -> updated_at already rewarded */
  counted: Record<string, string>
  /** Account for which historical completions were backfilled (runs once per account) */
  backfilledFor: string | null
  lastReward: RewardEvent | null
  recordCompletion: (
    userId: string,
    taskId: string,
    updatedAt: string,
    priority: TaskPriority,
    taskTitle: string,
  ) => void
  /**
   * One-time import of existing done tasks so the stats panel reflects real
   * history instead of starting from zero. Silent — no reward animation.
   */
  backfill: (
    userId: string,
    doneTasks: Array<{ id: string; updated_at: string; priority: TaskPriority }>,
  ) => void
  clearReward: () => void
}

export const useGamificationStore = create<GamificationState>()(
  persist(
    (set, get) => ({
      userId: null,
      xp: 0,
      totalCompleted: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDate: null,
      completionsByDate: {},
      counted: {},
      backfilledFor: null,
      lastReward: null,

      recordCompletion: (userId, taskId, updatedAt, priority, taskTitle) => {
        const state = get()
        // Switch account → reset stats instead of leaking across users
        const accountMismatch = !!state.userId && state.userId !== userId
        const base = {
          xp: accountMismatch ? 0 : state.xp,
          totalCompleted: accountMismatch ? 0 : state.totalCompleted,
          streak: accountMismatch ? 0 : state.streak,
          bestStreak: accountMismatch ? 0 : state.bestStreak,
          lastActiveDate: accountMismatch ? null : state.lastActiveDate,
          completionsByDate: accountMismatch ? {} as Record<string, number> : state.completionsByDate,
          counted: accountMismatch ? {} as Record<string, string> : state.counted,
          backfilledFor: accountMismatch ? null : state.backfilledFor,
        }

        // Dedupe: the same completion event (taskId + updatedAt) is rewarded once
        if (base.counted[taskId] === updatedAt) return

        const gained = XP_BY_PRIORITY[priority] ?? XP_BY_PRIORITY.medium
        const prevLevel = levelForXp(base.xp)
        const xp = base.xp + gained
        const newLevel = levelForXp(xp)

        // Streak: completing ≥1 task per day keeps the chain alive
        const today = todayStr()
        let streak = base.streak
        if (base.lastActiveDate === today) {
          // same day — streak unchanged
        } else if (base.lastActiveDate === yesterdayStr()) {
          streak += 1
        } else {
          streak = 1
        }
        const bestStreak = Math.max(base.bestStreak, streak)

        const completionsByDate = {
          ...base.completionsByDate,
          [today]: (base.completionsByDate[today] ?? 0) + 1,
        }

        // Keep the counted map bounded — drop entries older than the newest 500
        const counted = { ...base.counted, [taskId]: updatedAt }
        const countedKeys = Object.keys(counted)
        if (countedKeys.length > 500) {
          for (const key of countedKeys.slice(0, countedKeys.length - 500)) {
            delete counted[key]
          }
        }

        set({
          userId,
          xp,
          totalCompleted: base.totalCompleted + 1,
          streak,
          bestStreak,
          lastActiveDate: today,
          completionsByDate,
          counted,
          lastReward: {
            id: Date.now(),
            xp: gained,
            message: REWARD_MESSAGES[Math.floor(Math.random() * REWARD_MESSAGES.length)],
            taskTitle,
            leveledUp: newLevel > prevLevel,
            newLevel,
            streak,
          },
        })
      },

      backfill: (userId, doneTasks) => {
        const state = get()
        // Run once per account; never overwrite live stats
        if (state.backfilledFor === userId) return
        if (state.userId === userId && state.totalCompleted > 0) {
          set({ backfilledFor: userId })
          return
        }
        if (state.userId && state.userId !== userId) return // wait for recordCompletion to reset

        const completionsByDate: Record<string, number> = {}
        const counted: Record<string, string> = {}
        const dates = new Set<string>()
        let xp = 0

        for (const t of doneTasks) {
          xp += XP_BY_PRIORITY[t.priority] ?? XP_BY_PRIORITY.medium
          counted[t.id] = t.updated_at
          const d = new Date(t.updated_at)
          if (Number.isNaN(d.getTime())) continue
          const key = dateStr(d)
          completionsByDate[key] = (completionsByDate[key] ?? 0) + 1
          dates.add(key)
        }

        set({
          userId,
          xp,
          totalCompleted: doneTasks.length,
          streak: currentRun(dates),
          bestStreak: longestRun(dates),
          lastActiveDate: dates.has(todayStr())
            ? todayStr()
            : dates.has(yesterdayStr())
              ? yesterdayStr()
              : null,
          completionsByDate,
          counted,
          backfilledFor: userId,
        })
      },

      clearReward: () => set({ lastReward: null }),
    }),
    {
      name: 'taskflow-gamification',
      version: 1,
    },
  ),
)

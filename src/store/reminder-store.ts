import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ReminderEntry {
  taskId: string
  taskTitle: string
  /** ISO datetime string of when to fire */
  remindAt: string
}

export interface FiredReminder extends ReminderEntry {
  firedAt: number
}

interface ReminderState {
  /** taskId -> reminder. Local-first: survives offline mode, no DB migration needed */
  reminders: Record<string, ReminderEntry>
  /** Queue of fired reminders awaiting user dismissal (in-app toast) */
  fired: FiredReminder[]
  setReminder: (entry: ReminderEntry) => void
  clearReminder: (taskId: string) => void
  fireReminder: (taskId: string) => void
  dismissFired: (taskId: string) => void
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      reminders: {},
      fired: [],

      setReminder: (entry) => {
        set({ reminders: { ...get().reminders, [entry.taskId]: entry } })
        // Ask for browser notification permission lazily, only when the user
        // actually opts into reminders
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          void Notification.requestPermission()
        }
      },

      clearReminder: (taskId) => {
        const next = { ...get().reminders }
        delete next[taskId]
        set({ reminders: next })
      },

      fireReminder: (taskId) => {
        const entry = get().reminders[taskId]
        if (!entry) return
        const next = { ...get().reminders }
        delete next[taskId]
        set({
          reminders: next,
          fired: [...get().fired, { ...entry, firedAt: Date.now() }],
        })
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification('任务提醒', { body: entry.taskTitle, tag: entry.taskId })
          } catch { /* some platforms require SW-based notifications — toast already covers it */ }
        }
      },

      dismissFired: (taskId) => {
        set({ fired: get().fired.filter((f) => f.taskId !== taskId) })
      },
    }),
    {
      name: 'taskflow-reminders',
      version: 1,
      partialize: (state) => ({ reminders: state.reminders }),
    },
  ),
)

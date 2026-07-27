import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createUISlice, type UISlice, type ProjectViewTab } from './ui-slice'
import { createFilterSlice, type FilterSlice } from './filter-slice'
import { createSettingsSlice, type SettingsSlice, type DensityMode } from './settings-slice'
import { createAISlice, type AISlice } from './ai-slice'

export type { ThemeMode, DefaultDimension } from './settings-slice'
export type { ViewStartMode } from './settings-slice'
export type { ProjectViewTab } from './ui-slice'
export type { DensityMode } from './settings-slice'
export type { Message } from './ai-slice'

export type AppState = UISlice & FilterSlice & SettingsSlice & AISlice

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createAISlice(...args),
      ...createUISlice(...args),
      ...createFilterSlice(...args),
      ...createSettingsSlice(...args),
    }),
    {
      name: 'taskflow-ai-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        messages: state.messages,
      }),
      version: 1,
    }
  )
)
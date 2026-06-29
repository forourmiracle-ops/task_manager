import { create } from 'zustand'
import { createUISlice, type UISlice } from './ui-slice'
import { createFilterSlice, type FilterSlice } from './filter-slice'
import { createSettingsSlice, type SettingsSlice } from './settings-slice'

export type { ThemeMode, DefaultDimension } from './settings-slice'

export type AppState = UISlice & FilterSlice & SettingsSlice

export const useAppStore = create<AppState>()((...args) => ({
  ...createUISlice(...args),
  ...createFilterSlice(...args),
  ...createSettingsSlice(...args),
}))
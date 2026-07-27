import { create } from 'zustand'
import { createUISlice, type UISlice, type ProjectViewTab } from './ui-slice'
import { createFilterSlice, type FilterSlice } from './filter-slice'
import { createSettingsSlice, type SettingsSlice, type DensityMode } from './settings-slice'

export type { ThemeMode, DefaultDimension } from './settings-slice'
export type { ViewStartMode } from './settings-slice'
export type { ProjectViewTab } from './ui-slice'
export type { DensityMode } from './settings-slice'

export type AppState = UISlice & FilterSlice & SettingsSlice

export const useAppStore = create<AppState>()((...args) => ({
  ...createUISlice(...args),
  ...createFilterSlice(...args),
  ...createSettingsSlice(...args),
}))
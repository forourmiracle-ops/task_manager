import type { StateCreator } from 'zustand'
import type { Dimension } from '@/types'

export type ThemeMode = 'light' | 'dark' | 'eye-care'
export type DefaultDimension = 'auto' | Dimension
export type ViewStartMode = 'periodStart' | 'fromToday'

const STORED_THEME = (localStorage.getItem('taskflow-theme') || 'light') as ThemeMode
const STORED_FONT_SIZE = Number(localStorage.getItem('taskflow-font-size') || '4')
const STORED_DEFAULT_DIMENSION = (localStorage.getItem('taskflow-default-dimension') || 'auto') as DefaultDimension
const STORED_VIEW_START = (localStorage.getItem('taskflow-view-start') || 'periodStart') as ViewStartMode

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('taskflow-theme', theme)
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--font-scale', String(size))
  localStorage.setItem('taskflow-font-size', String(size))
}

// Initialize on load
applyTheme(STORED_THEME)
applyFontSize(STORED_FONT_SIZE)

export interface SettingsSlice {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  fontSize: number
  setFontSize: (size: number) => void
  defaultDimension: DefaultDimension
  setDefaultDimension: (dim: DefaultDimension) => void
  viewStartMode: ViewStartMode
  setViewStartMode: (mode: ViewStartMode) => void
}

export const createSettingsSlice: StateCreator<SettingsSlice, [], [], SettingsSlice> = (set) => ({
  theme: STORED_THEME,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  fontSize: STORED_FONT_SIZE,
  setFontSize: (size) => {
    const clamped = Math.max(1, Math.min(8, Math.round(size)))
    applyFontSize(clamped)
    set({ fontSize: clamped })
  },

  defaultDimension: STORED_DEFAULT_DIMENSION,
  setDefaultDimension: (dim) => {
    localStorage.setItem('taskflow-default-dimension', dim)
    set({ defaultDimension: dim })
  },

  viewStartMode: STORED_VIEW_START,
  setViewStartMode: (mode) => {
    localStorage.setItem('taskflow-view-start', mode)
    set({ viewStartMode: mode })
  },
})
import type { StateCreator } from 'zustand'
import type { Dimension } from '@/types'

export type ThemeMode = 'light' | 'dark' | 'eye-care'
export type DefaultDimension = 'auto' | Dimension
export type ViewStartMode = 'periodStart' | 'fromToday'
export type DensityMode = 'comfortable' | 'compact'

const STORED_THEME = (localStorage.getItem('taskflow-theme') || 'light') as ThemeMode
const STORED_FONT_SIZE = Number(localStorage.getItem('taskflow-font-size') || '4')
const STORED_DEFAULT_DIMENSION = (localStorage.getItem('taskflow-default-dimension') || 'auto') as DefaultDimension
const STORED_VIEW_START = (localStorage.getItem('taskflow-view-start') || 'periodStart') as ViewStartMode
const STORED_DEEPSEEK_KEY = localStorage.getItem('taskflow-deepseek-key') || ''
const STORED_EXPAND_TEMPLATE_LIB = localStorage.getItem('taskflow-expand-template-lib') === 'true'
const STORED_DENSITY = (localStorage.getItem('taskflow-density') || 'comfortable') as DensityMode

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('taskflow-theme', theme)
}

function applyFontSize(size: number) {
  document.documentElement.style.setProperty('--font-scale', String(size))
  localStorage.setItem('taskflow-font-size', String(size))
}

function applyDensity(density: DensityMode) {
  document.documentElement.setAttribute('data-density', density)
  localStorage.setItem('taskflow-density', density)
}

// Initialize on load
applyTheme(STORED_THEME)
applyFontSize(STORED_FONT_SIZE)
applyDensity(STORED_DENSITY)

export interface SettingsSlice {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  fontSize: number
  setFontSize: (size: number) => void
  defaultDimension: DefaultDimension
  setDefaultDimension: (dim: DefaultDimension) => void
  viewStartMode: ViewStartMode
  setViewStartMode: (mode: ViewStartMode) => void
  deepseekApiKey: string
  setDeepseekApiKey: (key: string) => void
  expandTemplateLib: boolean
  setExpandTemplateLib: (v: boolean) => void
  density: DensityMode
  setDensity: (density: DensityMode) => void
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

  deepseekApiKey: STORED_DEEPSEEK_KEY,
  setDeepseekApiKey: (key) => {
    localStorage.setItem('taskflow-deepseek-key', key)
    set({ deepseekApiKey: key })
  },

  expandTemplateLib: STORED_EXPAND_TEMPLATE_LIB,
  setExpandTemplateLib: (v) => {
    localStorage.setItem('taskflow-expand-template-lib', String(v))
    set({ expandTemplateLib: v })
  },

  density: STORED_DENSITY,
  setDensity: (density) => {
    applyDensity(density)
    set({ density })
  },
})
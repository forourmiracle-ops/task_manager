import { create } from 'zustand'
import type { ViewType, Dimension } from '@/types'

export type ThemeMode = 'light' | 'dark' | 'eye-care'
export type DefaultDimension = 'auto' | Dimension

const STORED_THEME = (localStorage.getItem('taskflow-theme') || 'light') as ThemeMode
const STORED_FONT_SIZE = Number(localStorage.getItem('taskflow-font-size') || '4')
const STORED_DEFAULT_DIMENSION = (localStorage.getItem('taskflow-default-dimension') || 'auto') as DefaultDimension

interface AppState {
  // Navigation
  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  // Task selection
  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  // Creating task
  isCreating: boolean
  creatingParentId: string | null
  setCreatingParentId: (id: string | null) => void
  startCreating: (parentId: string | null) => void
  stopCreating: () => void

  // Filters
  searchQuery: string
  setSearchQuery: (query: string) => void
  statusFilter: string | null
  setStatusFilter: (status: string | null) => void
  priorityFilter: string | null
  setPriorityFilter: (priority: string | null) => void

  // Detail panel
  detailPanelOpen: boolean
  setDetailPanelOpen: (open: boolean) => void

  // Theme
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void

  // Font size (1-8)
  fontSize: number
  setFontSize: (size: number) => void

  // Default dimension
  defaultDimension: DefaultDimension
  setDefaultDimension: (dim: DefaultDimension) => void
}

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

export const useAppStore = create<AppState>((set) => ({
  currentView: 'gantt',
  setCurrentView: (view) => set({ currentView: view }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id, detailPanelOpen: !!id }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  creatingParentId: null,
  setCreatingParentId: (id) => set({ creatingParentId: id }),
  isCreating: false,
  startCreating: (parentId) => set({ isCreating: true, creatingParentId: parentId }),
  stopCreating: () => set({ isCreating: false, creatingParentId: null }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  statusFilter: null,
  setStatusFilter: (status) => set({ statusFilter: status }),

  priorityFilter: null,
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),

  detailPanelOpen: false,
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  theme: STORED_THEME,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  fontSize: STORED_FONT_SIZE,
  setFontSize: (size) => {
    applyFontSize(Math.max(1, Math.min(8, Math.round(size))))
    set({ fontSize: Math.max(1, Math.min(8, Math.round(size))) })
  },

  defaultDimension: STORED_DEFAULT_DIMENSION,
  setDefaultDimension: (dim) => {
    localStorage.setItem('taskflow-default-dimension', dim)
    set({ defaultDimension: dim })
  },
}))
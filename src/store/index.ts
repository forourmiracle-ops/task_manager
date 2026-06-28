import { create } from 'zustand'
import type { ViewType } from '@/types'

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
}

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
}))
import type { StateCreator } from 'zustand'
import type { ViewType } from '@/types'

export interface UISlice {
  currentView: ViewType
  setCurrentView: (view: ViewType) => void
  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  detailPanelOpen: boolean
  setDetailPanelOpen: (open: boolean) => void
  isCreating: boolean
  creatingParentId: string | null
  setCreatingParentId: (id: string | null) => void
  startCreating: (parentId: string | null) => void
  stopCreating: () => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  currentView: 'gantt',
  setCurrentView: (view) => set({ currentView: view }),

  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id, detailPanelOpen: !!id }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  detailPanelOpen: false,
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),

  creatingParentId: null,
  setCreatingParentId: (id) => set({ creatingParentId: id }),
  isCreating: false,
  startCreating: (parentId) => set({ isCreating: true, creatingParentId: parentId }),
  stopCreating: () => set({ isCreating: false, creatingParentId: null }),
})
import type { StateCreator } from 'zustand'
import type { ViewType } from '@/types'

export type ProjectViewTab = 'list' | 'board' | 'table' | 'gallery' | 'calendar' | 'gantt'

const STORED_PROJECT_VIEW_TAB = (() => {
  try {
    const v = localStorage.getItem('taskflow-project-view-tab')
    if (v && ['list', 'board', 'table', 'gallery', 'calendar', 'gantt'].includes(v)) {
      return v as ProjectViewTab
    }
  } catch { /* noop */ }
  return 'gantt'
})()

export interface UISlice {
  currentView: ViewType
  setCurrentView: (view: ViewType) => void
  projectViewTab: ProjectViewTab
  setProjectViewTab: (tab: ProjectViewTab) => void
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
  importDialogOpen: boolean
  setImportDialogOpen: (open: boolean) => void
  editingTaskId: string | null
  setEditingTaskId: (id: string | null) => void
}

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  currentView: 'project',
  setCurrentView: (view) => set({ currentView: view }),

  projectViewTab: STORED_PROJECT_VIEW_TAB,
  setProjectViewTab: (tab) => {
    try { localStorage.setItem('taskflow-project-view-tab', tab) } catch { /* noop */ }
    set({ projectViewTab: tab })
  },

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

  importDialogOpen: false,
  setImportDialogOpen: (open) => set({ importDialogOpen: open }),

  editingTaskId: null,
  setEditingTaskId: (id) => set({ editingTaskId: id }),
})
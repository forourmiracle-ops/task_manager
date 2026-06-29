import type { StateCreator } from 'zustand'

export interface FilterSlice {
  searchQuery: string
  setSearchQuery: (query: string) => void
  statusFilter: string | null
  setStatusFilter: (status: string | null) => void
  priorityFilter: string | null
  setPriorityFilter: (priority: string | null) => void
}

export const createFilterSlice: StateCreator<FilterSlice, [], [], FilterSlice> = (set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  statusFilter: null,
  setStatusFilter: (status) => set({ statusFilter: status }),

  priorityFilter: null,
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),
})
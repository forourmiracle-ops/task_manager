import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { ProjectViewTab } from '@/store'

const VIEW_TAB_SHORTCUTS: Record<string, ProjectViewTab> = {
  '1': 'list',
  '2': 'board',
  '3': 'table',
  '4': 'gallery',
  '5': 'calendar',
  '6': 'gantt',
}

export function useKeyboardShortcuts() {
  const {
    startCreating,
    setDetailPanelOpen,
    setSelectedTaskId,
    setSidebarOpen,
    sidebarOpen,
    setProjectViewTab,
    currentView,
    setCurrentView,
  } = useAppStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
        return
      }

      const ctrl = e.ctrlKey || e.metaKey

      // N - New task
      if (e.key === 'n' && !ctrl) {
        e.preventDefault()
        startCreating(null)
        return
      }

      // / - Focus search
      if (e.key === '/') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
        searchInput?.focus()
        return
      }

      // Esc - Close panel
      if (e.key === 'Escape') {
        setDetailPanelOpen(false)
        setSelectedTaskId(null)
        return
      }

      // Ctrl+B - Toggle sidebar
      if (e.key === 'b' && ctrl) {
        e.preventDefault()
        setSidebarOpen(!sidebarOpen)
        return
      }

      // Ctrl+1~6 - Switch project view tab
      if (ctrl && currentView === 'project' && VIEW_TAB_SHORTCUTS[e.key]) {
        e.preventDefault()
        setProjectViewTab(VIEW_TAB_SHORTCUTS[e.key])
        return
      }

      // Ctrl+Shift+A - AI Assistant
      if (e.key === 'A' && ctrl && e.shiftKey) {
        e.preventDefault()
        setCurrentView('ai')
        return
      }

      // Ctrl+Shift+S - Settings
      if (e.key === 'S' && ctrl && e.shiftKey) {
        e.preventDefault()
        setCurrentView('settings')
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    startCreating,
    setDetailPanelOpen,
    setSelectedTaskId,
    setSidebarOpen,
    sidebarOpen,
    setProjectViewTab,
    currentView,
    setCurrentView,
  ])
}
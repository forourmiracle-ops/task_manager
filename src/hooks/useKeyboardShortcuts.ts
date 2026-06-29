import { useEffect } from 'react'
import { useAppStore } from '@/store'

export function useKeyboardShortcuts() {
  const { startCreating, setDetailPanelOpen, setSelectedTaskId, setSidebarOpen, sidebarOpen } = useAppStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
        return
      }

      // N - New task
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
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
      if (e.key === 'b' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSidebarOpen(!sidebarOpen)
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [startCreating, setDetailPanelOpen, setSelectedTaskId, setSidebarOpen, sidebarOpen])
}
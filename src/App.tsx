import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { Sidebar } from '@/components/layout/Sidebar'
import { GanttView } from '@/components/gantt/GanttView'
import { BoardView } from '@/components/board/BoardView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { AIAssistantView } from '@/components/ai/AIAssistantView'
import { SettingsView } from '@/components/settings/SettingsView'
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog'
import { DetailPanel } from '@/components/tasks/DetailPanel'
import type { ViewType } from '@/types'

const VIEW_LABELS: Record<ViewType, string> = {
  gantt: '甘特图',
  board: '看板',
  calendar: '日历',
  ai: 'AI 助手',
  settings: '设置',
}

export default function App() {
  const {
    currentView,
    setCurrentView,
    sidebarOpen,
    setSidebarOpen,
    startCreating,
  } = useAppStore()

  // Keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' && e.ctrlKey) {
        e.preventDefault()
        startCreating(null)
      }
      if (e.key === 'b' && e.ctrlKey) {
        e.preventDefault()
        setSidebarOpen(!sidebarOpen)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen, setSidebarOpen, startCreating])

  const renderView = () => {
    switch (currentView) {
      case 'gantt':
        return <GanttView />
      case 'board':
        return <BoardView />
      case 'calendar':
        return <CalendarView />
      case 'ai':
        return <AIAssistantView />
      case 'settings':
        return <SettingsView />
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation */}
      <header className="border-b border-border flex items-center px-4 gap-3 bg-background flex-shrink-0 shadow-card" style={{ height: 44 }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
          title="切换侧边栏 (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 3h12M2 8h12M2 13h12" />
          </svg>
        </button>
        <span className="text-sm font-bold tracking-tight text-foreground">TaskFlow</span>

        <div className="w-px h-5 bg-border mx-1" />

        <nav className="flex gap-1">
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                currentView === view
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Quick Create */}
        <button
          onClick={() => startCreating(null)}
          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 shadow-sm transition-all"
          title="新建项目 (Ctrl+N)"
        >
          + 新建
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        {renderView()}
        <DetailPanel />
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden border-t border-border flex items-center bg-background flex-shrink-0" style={{ height: 48 }}>
        {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`flex-1 flex flex-col items-center justify-center text-[10px] ${
              currentView === view
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            }`}
          >
            <span className="text-sm">
              {view === 'gantt' ? '📊' : view === 'board' ? '📋' : view === 'calendar' ? '📅' : view === 'ai' ? '🤖' : '⚙'}
            </span>
            {VIEW_LABELS[view]}
          </button>
        ))}
      </nav>

      {/* Create Task Dialog */}
      <CreateTaskDialog />
    </div>
  )
}
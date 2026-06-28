import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { Sidebar } from '@/components/layout/Sidebar'
import { GanttView } from '@/components/gantt/GanttView'
import { BoardView } from '@/components/board/BoardView'
import { CalendarView } from '@/components/calendar/CalendarView'
import { AIAssistantView } from '@/components/ai/AIAssistantView'
import { SettingsView } from '@/components/settings/SettingsView'
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
    <div className="h-screen flex flex-col">
      {/* Top Navigation */}
      <header className="h-10 border-b border-border flex items-center px-3 gap-1 bg-background flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-xs text-muted-foreground hover:text-foreground px-1"
          title="切换侧边栏 (Ctrl+B)"
        >
          ☰
        </button>
        <span className="text-xs font-semibold mr-4">TaskFlow</span>

        <nav className="flex gap-0.5">
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                currentView === view
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
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
          className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90"
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
      <nav className="md:hidden h-12 border-t border-border flex items-center bg-background flex-shrink-0">
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
    </div>
  )
}
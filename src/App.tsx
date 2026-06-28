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

const VIEW_LABELS: Record<ViewType, { label: string; icon: React.ReactNode }> = {
  gantt: {
    label: '甘特图',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 7h12M6 7v6M10 7v6" />
      </svg>
    ),
  },
  board: {
    label: '看板',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="5" height="10" rx="1" />
        <rect x="9" y="3" width="5" height="6" rx="1" />
      </svg>
    ),
  },
  calendar: {
    label: '日历',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="11" rx="1" />
        <path d="M2 7h12M5 2v3M11 2v3" />
      </svg>
    ),
  },
  ai: {
    label: 'AI 助手',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5L8 2z" />
      </svg>
    ),
  },
  settings: {
    label: '设置',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M12.7 8a4.7 4.7 0 00-.8-2.6l1.8-1.8-1.4-1.4-1.8 1.8A4.7 4.7 0 008 3.3H7.3a4.7 4.7 0 00-2.6.8L2.9 2.3 1.5 3.7l1.8 1.8A4.7 4.7 0 003.3 8v.7a4.7 4.7 0 00.8 2.6l-1.8 1.8 1.4 1.4 1.8-1.8a4.7 4.7 0 002.6.8h.7a4.7 4.7 0 002.6-.8l1.8 1.8 1.4-1.4-1.8-1.8a4.7 4.7 0 00.8-2.6V8z" />
      </svg>
    ),
  },
}

export default function App() {
  const {
    currentView,
    setCurrentView,
    sidebarOpen,
    setSidebarOpen,
    startCreating,
  } = useAppStore()

  // Keyboard shortcuts
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
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Navigation */}
      <header className="border-b border-border flex items-center px-4 gap-3 bg-background/95 backdrop-blur flex-shrink-0 z-40" style={{ height: 48 }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors"
          title="切换侧边栏 (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8l3-3 4 4 3-3" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-foreground">TaskFlow</span>
        </div>

        <div className="w-px h-5 bg-border mx-1 hidden md:block" />

        <nav className="hidden md:flex gap-0.5">
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                currentView === view
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {VIEW_LABELS[view].icon}
              {VIEW_LABELS[view].label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Quick Create */}
        <button
          onClick={() => startCreating(null)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 shadow-sm transition-all"
          title="新建项目 (Ctrl+N)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 3v10M3 8h10" />
          </svg>
          <span className="hidden sm:inline">新建</span>
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        {renderView()}
        <DetailPanel />
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden border-t border-border flex items-center bg-background flex-shrink-0 z-40" style={{ height: 52 }}>
        {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
          <button
            key={view}
            onClick={() => setCurrentView(view)}
            className={`flex-1 flex flex-col items-center justify-center text-[10px] transition-colors ${
              currentView === view
                ? 'text-primary font-semibold'
                : 'text-muted-foreground'
            }`}
          >
            <span className={currentView === view ? 'text-primary' : ''}>{VIEW_LABELS[view].icon}</span>
            {VIEW_LABELS[view].label}
          </button>
        ))}
      </nav>

      {/* Create Task Dialog */}
      <CreateTaskDialog />
    </div>
  )
}

import { useEffect, useState, lazy, Suspense } from 'react'
import { useAppStore } from '@/store'
import { Sidebar } from '@/components/layout/Sidebar'
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog'
import { DetailPanel } from '@/components/tasks/DetailPanel'
import { DraftToastContainer } from '@/components/ui/DraftToast'
import { ImportDialog } from '@/components/ui/ImportDialog'
import { CheatSheet } from '@/components/ui/CheatSheet'
import { RemoteUpdateBanner, useRemoteUpdateConflict } from '@/components/ui/RemoteUpdateBanner'
import { AppUpdateBanner } from '@/components/ui/AppUpdateBanner'
import { OfflineBanner } from '@/components/ui/OfflineBanner'
import { LocalTaskMigration } from '@/components/ui/LocalTaskMigration'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useRealtimeSubscription } from '@/hooks/useTasks'
import { useRecurringTaskExecutor } from '@/hooks/useRecurringTaskExecutor'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { AuthView } from '@/components/auth/AuthView'
import type { ViewType } from '@/types'

// Lazy-loaded views — code-split into separate chunks, loaded on first access
const ProjectView = lazy(() => import('@/components/views/ProjectView').then(m => ({ default: m.ProjectView })))
const AIAssistantView = lazy(() => import('@/components/ai/AIAssistantView').then(m => ({ default: m.AIAssistantView })))
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })))

const ViewSkeleton = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-xs text-muted-foreground">加载中...</span>
    </div>
  </div>
)

const VIEW_LABELS: Record<ViewType, { label: string; icon: React.ReactNode }> = {
  project: {
    label: '项目',
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 7h12M6 7v6M10 7v6" />
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
    importDialogOpen,
    setImportDialogOpen,
  } = useAppStore()

  // Auth guard — redirect to login if not authenticated
  const { session, isAuthenticated, loading: authLoading } = useAuth()

  useKeyboardShortcuts()
  useRecurringTaskExecutor()

  // Remote edit conflict detection
  const {
    bannerUpdate,
    setEditingTask,
    handleRemoteChange,
    handleViewLatest,
    handleDismiss,
  } = useRemoteUpdateConflict()
  useRealtimeSubscription(handleRemoteChange)

  // Track editing state from DetailPanel for precise conflict detection
  const editingTaskId = useAppStore((s) => s.editingTaskId)
  useEffect(() => {
    setEditingTask(editingTaskId)
  }, [editingTaskId, setEditingTask])

  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)

  // ? key to open cheat sheet — must be BEFORE any early return to keep hook count stable
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        setCheatSheetOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auth loading state
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">加载中...</span>
        </div>
      </div>
    )
  }

  // Auth guard — show login page if not authenticated
  if (!isAuthenticated) {
    return <AuthView />
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden min-h-0">
      {/* Remote update conflict banner — non-blocking, top center */}
      <RemoteUpdateBanner
        update={bannerUpdate}
        onViewLatest={handleViewLatest}
        onDismiss={handleDismiss}
      />

      {/* App update banner — shows when a new version is available on GitHub */}
      <AppUpdateBanner />

      {/* Top Navigation */}
      <header className="border-b border-border flex items-center px-4 gap-3 bg-background/95 backdrop-blur flex-shrink-0 z-40" style={{ height: 52 }}>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors"
          title="切换侧边栏 (Ctrl+B)"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </svg>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center shadow-md">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M2 9l4-4 3 3 5-5" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight text-foreground">TaskFlow</span>
            <span className="text-[10px] text-muted-foreground font-medium">任务管理系统</span>
          </div>
        </div>

        <div className="w-px h-6 bg-border mx-1 hidden md:block" />

        <nav className="hidden md:flex gap-1 p-1 rounded-xl bg-muted/30">
          {(Object.keys(VIEW_LABELS) as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                currentView === view
                  ? 'bg-background text-primary shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {VIEW_LABELS[view].icon}
              {VIEW_LABELS[view].label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {session?.user?.email}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-accent transition-colors"
            title="退出登录"
          >
            退出
          </button>

          {/* Quick Create */}
          <button
            onClick={() => startCreating(null)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:opacity-90 shadow-md transition-all"
            title="新建项目 (Ctrl+N)"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M8 3v10M3 8h10" />
            </svg>
            <span className="hidden sm:inline">新建项目</span>
          </button>
        </div>
      </header>

      {/* Main Content — only active view rendered, lazy-loaded on demand */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar />
        <Suspense fallback={<ViewSkeleton />}>
          {currentView === 'project' && <ProjectView />}
          {currentView === 'ai' && <AIAssistantView />}
          {currentView === 'settings' && <SettingsView />}
        </Suspense>
        <DetailPanel />
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden border-t border-border flex items-center bg-background flex-shrink-0 z-40 safe-bottom" style={{ height: 56 }}>
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
            <span className={currentView === view ? 'text-primary bg-primary/10 p-1 rounded-lg' : ''}>{VIEW_LABELS[view].icon}</span>
            {VIEW_LABELS[view].label}
          </button>
        ))}
      </nav>

      {/* Create Task Dialog */}
      <CreateTaskDialog />

      {/* Draft Toast */}
      <DraftToastContainer />

      {/* CheatSheet */}
      <CheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />

      {/* Import Dialog */}
      <ImportDialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} />

      {/* Offline Banner */}
      <OfflineBanner />

      {/* Local → Cloud migration prompt */}
      <LocalTaskMigration />
    </div>
  )
}

import { lazy, Suspense, memo } from 'react'
import { useAppStore } from '@/store'
import { ViewTabBar } from './ViewTabBar'

const GanttView = lazy(() => import('@/components/gantt/GanttView').then(m => ({ default: m.GanttView })))
const BoardView = lazy(() => import('@/components/board/BoardView').then(m => ({ default: m.BoardView })))
const CalendarView = lazy(() => import('@/components/calendar/CalendarView').then(m => ({ default: m.CalendarView })))
const ListView = lazy(() => import('./ListView').then(m => ({ default: m.ListView })))
const TableView = lazy(() => import('./TableView').then(m => ({ default: m.TableView })))
const GalleryView = lazy(() => import('./GalleryView').then(m => ({ default: m.GalleryView })))

const ViewSkeleton = () => (
  <div className="flex-1 flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <span className="text-xs text-muted-foreground">加载中...</span>
    </div>
  </div>
)

export const ProjectView = memo(function ProjectView() {
  const projectViewTab = useAppStore((s) => s.projectViewTab)

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <ViewTabBar />
      <Suspense fallback={<ViewSkeleton />}>
        {projectViewTab === 'gantt' && <GanttView />}
        {projectViewTab === 'board' && <BoardView />}
        {projectViewTab === 'calendar' && <CalendarView />}
        {projectViewTab === 'list' && <ListView />}
        {projectViewTab === 'table' && <TableView />}
        {projectViewTab === 'gallery' && <GalleryView />}
      </Suspense>
    </div>
  )
})
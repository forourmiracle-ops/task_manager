import { memo } from 'react'
import { useAppStore, type ProjectViewTab } from '@/store'

const TABS: { id: ProjectViewTab; label: string; icon: string }[] = [
  { id: 'list', label: '列表', icon: '📋' },
  { id: 'board', label: '看板', icon: '🗂' },
  { id: 'table', label: '表格', icon: '📊' },
  { id: 'gallery', label: '画廊', icon: '🎨' },
  { id: 'calendar', label: '日历', icon: '📅' },
  { id: 'gantt', label: '甘特图', icon: '📈' },
]

export const ViewTabBar = memo(function ViewTabBar() {
  const projectViewTab = useAppStore((s) => s.projectViewTab)
  const setProjectViewTab = useAppStore((s) => s.setProjectViewTab)

  return (
    <div className="flex items-center border-b border-border px-4 gap-0.5 overflow-x-auto flex-shrink-0"
      style={{ height: 40, scrollbarWidth: 'none' }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setProjectViewTab(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors whitespace-nowrap ${
            projectViewTab === tab.id
              ? 'bg-primary/10 text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
})
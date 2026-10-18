import { memo } from 'react'
import { useAppStore, type ProjectViewTab } from '@/store'

// 视图收敛后的 4 个核心视图，按使用场景排序：
// 甘特图（时间规划·核心亮点）→ 看板（状态流转）→ 日历（日程）→ 列表（明细）
const TABS: { id: ProjectViewTab; label: string; icon: string }[] = [
  { id: 'gantt', label: '甘特图', icon: '📈' },
  { id: 'board', label: '看板', icon: '🗂' },
  { id: 'calendar', label: '日历', icon: '📅' },
  { id: 'list', label: '列表', icon: '📋' },
]

export const ViewTabBar = memo(function ViewTabBar() {
  const projectViewTab = useAppStore((s) => s.projectViewTab)
  const setProjectViewTab = useAppStore((s) => s.setProjectViewTab)

  return (
    <div className="flex items-center border-b border-border px-2 md:px-4 flex-shrink-0"
      style={{ height: 44 }}
    >
      {/* Pill container — same visual language as the desktop header nav */}
      <div className="flex items-center gap-0.5 p-1 rounded-xl bg-muted/30 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setProjectViewTab(tab.id)}
            className={`flex items-center gap-1 md:gap-1.5 px-2.5 md:px-3.5 py-1.5 text-xs rounded-lg transition-all whitespace-nowrap ${
              projectViewTab === tab.id
                ? 'bg-background text-primary font-bold shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent font-medium'
            }`}
          >
            <span>{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
})
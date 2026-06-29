interface CheatSheetProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { keys: 'N', description: '新建任务' },
  { keys: '/', description: '聚焦搜索' },
  { keys: 'Esc', description: '关闭面板 / 弹窗' },
  { keys: 'Ctrl+B', description: '切换侧边栏' },
  { keys: 'Ctrl+Z', description: '撤销甘特图拖拽' },
  { keys: '?', description: '显示此快捷键面板' },
  { keys: 'Ctrl+Enter', description: '快速创建任务' },
]

export function CheatSheet({ open, onClose }: CheatSheetProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="border border-border rounded-2xl w-full max-w-sm mx-4 overflow-hidden" style={{ backgroundColor: 'hsl(var(--background))', boxShadow: '0 24px 70px -12px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/10">
          <h3 className="text-sm font-bold">键盘快捷键</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-1.5">
          {SHORTCUTS.map(({ keys, description }) => (
            <div key={keys} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/20 transition-colors">
              <span className="text-xs text-muted-foreground">{description}</span>
              <kbd className="px-2 py-0.5 text-[11px] font-mono font-bold bg-muted/30 border border-border rounded-md text-foreground">
                {keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-border bg-muted/10">
          <p className="text-[10px] text-muted-foreground text-center">
            按 <kbd className="px-1 py-0.5 text-[9px] font-mono bg-muted/30 border border-border rounded">?</kbd> 随时打开此面板
          </p>
        </div>
      </div>
    </div>
  )
}
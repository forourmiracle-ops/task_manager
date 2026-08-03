import { memo, useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const DIMENSION_LABELS: { key: string; label: string }[] = [
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'quarter', label: '季' },
  { key: 'halfyear', label: '半年' },
  { key: 'year', label: '年' },
]

const goTodayLabels = ['回到今天', '今日置首', '回到今天']

interface GanttToolbarProps {
  dimension: string
  viewStartMode: string
  goTodayStage: number
  fontSize: number
  onDimensionChange: (dim: string) => void
  onViewStartModeChange: (mode: string) => void
  onGoToday: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onExportPNG: () => void
  onExportCSV: () => void
  onUndo: () => void
  canUndo: boolean
}

export const GanttToolbar = memo(function GanttToolbar({
  dimension,
  viewStartMode,
  goTodayStage,
  fontSize,
  onDimensionChange,
  onViewStartModeChange,
  onGoToday,
  onZoomIn,
  onZoomOut,
  onExportPNG,
  onExportCSV,
  onUndo,
  canUndo,
}: GanttToolbarProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/10 flex-shrink-0 overflow-x-auto scrollbar-none">
      {/* Dimension selector — compact pill group */}
      <div className="flex items-center rounded-lg bg-muted/30 p-0.5 gap-0.5 flex-shrink-0">
        {DIMENSION_LABELS.map(({ key, label }) => (
          <button
            type="button"
            key={key}
            onClick={() => onDimensionChange(key)}
            className={cn(
              'px-2.5 py-1 text-[11px] rounded-md font-medium transition-all',
              dimension === key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-border flex-shrink-0" />

      {/* View start mode */}
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors flex-shrink-0 flex items-center gap-1"
        onClick={() => onViewStartModeChange(viewStartMode === 'periodStart' ? 'fromToday' : 'periodStart')}
        title={viewStartMode === 'periodStart' ? '当前：对齐周期边界' : '当前：从今日起算'}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 3h4v10H2zM10 7h4v6h-4z" />
        </svg>
        <span className="hidden sm:inline">{viewStartMode === 'periodStart' ? '周期对齐' : '今日起算'}</span>
      </button>

      {/* Go today */}
      <button
        type="button"
        className="px-2.5 py-1 text-[11px] font-medium text-primary rounded-md hover:bg-primary/5 transition-colors flex-shrink-0 flex items-center gap-1"
        onClick={onGoToday}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4v4l3 2" />
        </svg>
        <span className="hidden sm:inline">{goTodayLabels[goTodayStage]}</span>
      </button>

      <div className="flex-1" />

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 rounded-md bg-muted/30 p-0.5 flex-shrink-0">
        <button
          type="button"
          className="px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded transition-colors"
          onClick={onZoomOut}
          title="缩小"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </button>
        <span className="text-[10px] text-muted-foreground min-w-[14px] text-center font-medium">{fontSize}</span>
        <button
          type="button"
          className="px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground rounded transition-colors"
          onClick={onZoomIn}
          title="放大"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </button>
      </div>

      {/* Export */}
      <div className="relative flex-shrink-0" ref={exportRef}>
        <button
          type="button"
          className="px-2.5 py-1 text-[11px] font-medium text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors flex items-center gap-1"
          onClick={() => setShowExportMenu(!showExportMenu)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <span className="hidden sm:inline">导出</span>
        </button>
        {showExportMenu && (
          <div className="absolute top-full right-0 mt-1 border border-border rounded-lg bg-background shadow-lg z-30 py-1 min-w-[100px]">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors"
              onClick={() => { onExportPNG(); setShowExportMenu(false) }}
            >
              PNG 图片
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-accent transition-colors"
              onClick={() => { onExportCSV(); setShowExportMenu(false) }}
            >
              CSV 格式
            </button>
          </div>
        )}
      </div>

      {/* Undo */}
      <button
        type="button"
        className={cn(
          'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 flex-shrink-0',
          canUndo
            ? 'text-muted-foreground hover:bg-accent hover:text-foreground'
            : 'text-muted-foreground/30 cursor-not-allowed',
        )}
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销 (Ctrl+Z)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10h10a5 5 0 010 10H9" />
          <path d="M7 6l-4 4 4 4" />
        </svg>
        <span className="hidden sm:inline">撤销</span>
      </button>
    </div>
  )
})
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface DraftToastData {
  message: string
  onUndo: () => void
}

let showToast: ((data: DraftToastData | null) => void) | null = null

export function showDraftToast(data: DraftToastData | null) {
  showToast?.(data)
}

export function DraftToastContainer() {
  const [toast, setToast] = useState<DraftToastData | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  showToast = useCallback((data: DraftToastData | null) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!data) {
      setVisible(false)
      setTimeout(() => setToast(null), 300)
      return
    }
    setToast(data)
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setVisible(true))
    // Auto-dismiss after 3.5s
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => setToast(null), 300)
    }, 3500)
  }, [])

  // Click outside to dismiss
  useEffect(() => {
    if (!visible) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisible(false)
        setTimeout(() => setToast(null), 300)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [visible])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      showToast = null
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!toast) return null

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-xs rounded-lg border border-border shadow-xl px-3 py-2 flex items-center gap-2 transition-all duration-300 ease-out',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      )}
      style={{ backgroundColor: 'hsl(var(--background))' }}
    >
      {/* Icon */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-amber-500 flex-shrink-0">
        <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      {/* Content */}
      <p className="text-xs text-foreground truncate flex-1 min-w-0">{toast.message}</p>
      <button
        onClick={() => {
          toast.onUndo()
          setVisible(false)
          setTimeout(() => setToast(null), 300)
        }}
        className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors flex-shrink-0"
      >
        撤销
      </button>
    </div>
  )
}
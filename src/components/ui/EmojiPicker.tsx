import { memo, useState, useCallback, useRef, useEffect } from 'react'

// Curated emoji set for task/project icons
const COMMON_EMOJIS = [
  '📋', '📝', '🎯', '🚀', '💡', '🔧', '🐛', '✨', '🔥', '⭐',
  '📊', '📈', '📅', '🗂', '📁', '🎨', '🛠', '💼', '🏠', '📚',
  '🎓', '🏃', '💪', '🧠', '🎵', '🎮', '✈', '🍕', '☕', '🌱',
  '🏗', '📦', '🔒', '🔑', '💬', '📢', '🎉', '✅', '❌', '⚠',
  '🔄', '⏰', '📌', '🔗', '💎', '🧩', '🎪', '🏆', '💻', '📱',
  '🌍', '🤖', '🧪', '📷', '🎬', '💰', '📨', '🗓', '🧹', '🔍',
]

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: '常用', emojis: COMMON_EMOJIS.slice(0, 20) },
  { label: '项目', emojis: ['🚀', '🎯', '🏗', '📦', '🛠', '🔧', '💼', '🏠', '🎨', '💻', '📱', '🧩', '🎪', '🏆', '🧪', '🌍'] },
  { label: '状态', emojis: ['✅', '🔄', '⏳', '⚠', '❌', '🔒', '📌', '🔥', '⭐', '💡', '✨', '🎉', '🏃', '💪'] },
  { label: '文档', emojis: ['📋', '📝', '📊', '📈', '📅', '🗂', '📁', '📚', '📨', '📢', '💬', '🎓', '📷', '🎬', '🔍'] },
]

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
  open: boolean
  onClose: () => void
}

export const EmojiPicker = memo(function EmojiPicker({ value, onChange, open, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute z-50 bg-popover border border-border rounded-xl shadow-elevated p-3 w-72"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      {/* Category tabs */}
      <div className="flex gap-0.5 mb-3 border-b border-border pb-2">
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            onClick={() => setActiveCategory(i)}
            className={`px-2 py-1 text-[10px] rounded-md font-medium transition-colors ${
              i === activeCategory
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-10 gap-1">
        {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onChange(emoji)
              onClose()
            }}
            className={`w-7 h-7 flex items-center justify-center text-sm rounded-md transition-colors ${
              emoji === value
                ? 'bg-primary/10 ring-1 ring-primary/30'
                : 'hover:bg-muted'
            }`}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
})

/** Lightweight emoji button + picker combo */
interface EmojiButtonProps {
  value: string
  onChange: (emoji: string) => void
  size?: 'sm' | 'md'
}

export const EmojiButton = memo(function EmojiButton({ value, onChange, size = 'md' }: EmojiButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center justify-center rounded-lg border border-border hover:border-border hover:bg-muted/50 transition-colors ${
          size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-lg'
        }`}
        title="选择图标"
      >
        {value || '📋'}
      </button>
      <EmojiPicker
        value={value}
        onChange={onChange}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  )
})
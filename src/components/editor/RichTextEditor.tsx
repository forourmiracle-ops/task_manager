import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/extension-bubble-menu'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { SuggestionProps } from '@tiptap/suggestion'

// ── Slash Command items ──
interface SlashCommand {
  id: string
  label: string
  icon: string
  description: string
  action: (editor: ReturnType<typeof useEditor>) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: '标题 1',
    icon: 'H1',
    description: '大标题',
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: '标题 2',
    icon: 'H2',
    description: '中标题',
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: '标题 3',
    icon: 'H3',
    description: '小标题',
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: '无序列表',
    icon: '•',
    description: '项目符号列表',
    action: (editor) => editor?.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: '有序列表',
    icon: '1.',
    description: '编号列表',
    action: (editor) => editor?.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: '待办清单',
    icon: '☑',
    description: '可勾选的交互式清单',
    action: (editor) => editor?.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: '引用',
    icon: '❝',
    description: '引用块',
    action: (editor) => editor?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'code',
    label: '代码块',
    icon: '<>',
    description: '代码片段',
    action: (editor) => editor?.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'divider',
    label: '分割线',
    icon: '—',
    description: '水平分割线',
    action: (editor) => editor?.chain().focus().setHorizontalRule().run(),
  },
]

// ── Slash Command Plugin ──
const slashCommandPluginKey = new PluginKey('slashCommand')

function createSlashCommandPlugin() {
  return new Plugin({
    key: slashCommandPluginKey,
    props: {
      handleKeyDown(view, event) {
        // Track slash command state in a DOM attribute
        const { state } = view
        const { from } = state.selection
        const $from = state.doc.resolve(from)
        const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)

        if (event.key === 'Escape') {
          if (slashCommandPluginKey.getState(state)?.active) {
            view.dom.dispatchEvent(new CustomEvent('slash-close'))
            return true
          }
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (slashCommandPluginKey.getState(state)?.active) {
            view.dom.dispatchEvent(new CustomEvent('slash-navigate', { detail: { key: event.key } }))
            return true
          }
        }

        if (event.key === 'Enter') {
          if (slashCommandPluginKey.getState(state)?.active) {
            view.dom.dispatchEvent(new CustomEvent('slash-select'))
            return true
          }
        }

        return false
      },
    },
    state: {
      init() {
        return { active: false, query: '', range: null as { from: number; to: number } | null }
      },
      apply(tr, prev) {
        const meta = tr.getMeta(slashCommandPluginKey)
        if (meta) return { ...prev, ...meta }
        return prev
      },
    },
  })
}

// ── SlashCommandMenu component ──
interface SlashMenuProps {
  editor: ReturnType<typeof useEditor>
  query: string
  range: { from: number; to: number }
  onClose: () => void
}

const SlashCommandMenu = memo(function SlashCommandMenu({ editor, query, range, onClose }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const filtered = SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.id.toLowerCase().includes(query.toLowerCase()),
  )

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Keyboard navigation
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.key === 'ArrowDown') {
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (detail?.key === 'ArrowUp') {
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      }
    }
    const handleSelect = () => {
      const cmd = filtered[selectedIndex]
      if (cmd) {
        // Delete the slash command text
        editor?.chain().focus().deleteRange(range).run()
        cmd.action(editor)
      }
      onClose()
    }
    const handleClose = () => onClose()

    document.addEventListener('slash-navigate', handleNavigate)
    document.addEventListener('slash-select', handleSelect)
    document.addEventListener('slash-close', handleClose)
    return () => {
      document.removeEventListener('slash-navigate', handleNavigate)
      document.removeEventListener('slash-select', handleSelect)
      document.removeEventListener('slash-close', handleClose)
    }
  }, [editor, range, filtered, selectedIndex, onClose])

  if (filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-popover border border-border rounded-xl shadow-elevated p-1 w-56 overflow-hidden"
      style={{ top: '100%', left: 0, marginTop: 4 }}
    >
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => {
            editor?.chain().focus().deleteRange(range).run()
            cmd.action(editor)
            onClose()
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg transition-colors ${
            i === selectedIndex
              ? 'bg-primary/10 text-primary'
              : 'text-foreground hover:bg-muted'
          }`}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="w-8 h-7 flex items-center justify-center rounded-md bg-muted/50 text-xs font-bold text-muted-foreground flex-shrink-0">
            {cmd.icon}
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-xs font-semibold">{cmd.label}</span>
            <span className="text-[10px] text-muted-foreground truncate">{cmd.description}</span>
          </div>
        </button>
      ))}
    </div>
  )
})

// ── RichTextEditor ──
interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  className?: string
}

export const RichTextEditor = memo(function RichTextEditor({
  content,
  onChange,
  placeholder = '输入内容... 输入 / 使用快捷命令',
  editable = true,
  className = '',
}: RichTextEditorProps) {
  const [slashState, setSlashState] = useState<{
    active: boolean
    query: string
    range: { from: number; to: number }
  }>({ active: false, query: '', range: { from: 0, to: 0 } })

  const slashPluginRef = useRef(createSlashCommandPlugin())

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {},
        bulletList: {},
        orderedList: {},
        blockquote: {},
        horizontalRule: {},
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline underline-offset-2 hover:opacity-80' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-lg max-w-full' },
      }),
      Placeholder.configure({ placeholder }),
      slashPluginRef.current,
      // Custom extension to detect / typing
      Extension.create({
        name: 'slashHandler',
        addKeyboardShortcuts() {
          return {
            '/': () => {
              const { state } = this.editor
              const { from, empty } = state.selection
              if (!empty) return false

              const $from = state.doc.resolve(from)
              const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)

              // Only trigger at start of line or after whitespace
              if (textBefore === '' || textBefore.endsWith(' ') || textBefore.endsWith('\n')) {
                const pos = from
                // Use a slight delay to let the / character be inserted
                setTimeout(() => {
                  const tr = this.editor.state.tr
                  tr.setMeta(slashCommandPluginKey, {
                    active: true,
                    query: '',
                    range: { from: pos, to: pos + 1 },
                  })
                  this.editor.view.dispatch(tr)
                  setSlashState({
                    active: true,
                    query: '',
                    range: { from: pos, to: pos + 1 },
                  })
                }, 10)
              }
              return false
            },
          }
        },
        onUpdate() {
          const meta = slashCommandPluginKey.getState(this.editor.state)
          if (meta?.active) {
            const { state } = this.editor
            const { from } = state.selection
            const $from = state.doc.resolve(from)
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
            const slashIndex = textBefore.lastIndexOf('/')
            if (slashIndex >= 0) {
              const query = textBefore.slice(slashIndex + 1)
              const fromPos = $from.start() + slashIndex
              const range = { from: fromPos, to: fromPos + query.length + 1 }
              setSlashState({ active: true, query, range })
              // Update plugin state
              const tr = this.editor.state.tr
              tr.setMeta(slashCommandPluginKey, { active: true, query, range })
              this.editor.view.dispatch(tr)
            } else {
              setSlashState((prev) => ({ ...prev, active: false }))
            }
          }
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      if (html !== content) {
        onChange(html)
      }
      // Check for slash command
      const { state } = editor
      const { from } = state.selection
      const $from = state.doc.resolve(from)
      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)

      if (slashState.active) {
        const slashIndex = textBefore.lastIndexOf('/')
        if (slashIndex >= 0) {
          const query = textBefore.slice(slashIndex + 1)
          // Non-slash chars or space means close
          if (query.includes(' ') || query.length > 20) {
            setSlashState((prev) => ({ ...prev, active: false }))
            const tr = editor.state.tr
            tr.setMeta(slashCommandPluginKey, { active: false, query: '', range: null })
            editor.view.dispatch(tr)
          } else {
            const fromPos = $from.start() + slashIndex
            const range = { from: fromPos, to: fromPos + query.length + 1 }
            setSlashState({ active: true, query, range })
          }
        }
      }
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none min-h-[80px] px-3 py-2 ${className}`,
      },
    },
  })

  // Sync external content changes
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  const closeSlash = useCallback(() => {
    setSlashState((prev) => ({ ...prev, active: false }))
    if (editor) {
      const tr = editor.state.tr
      tr.setMeta(slashCommandPluginKey, { active: false, query: '', range: null })
      editor.view.dispatch(tr)
    }
  }, [editor])

  if (!editor) return null

  return (
    <div className="rich-text-editor relative">
      {/* Bubble menu for text formatting */}
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-elevated p-1"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${
              editor.isActive('bold') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs italic font-bold transition-colors ${
              editor.isActive('italic') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors line-through ${
              editor.isActive('strike') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            S
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-mono font-bold transition-colors ${
              editor.isActive('code') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {'</>'}
          </button>
          <button
            onClick={() => {
              const url = window.prompt('链接地址:')
              if (url) editor.chain().focus().setLink({ href: url }).run()
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${
              editor.isActive('link') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            🔗
          </button>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {/* Slash command menu */}
      {slashState.active && (
        <SlashCommandMenu
          editor={editor}
          query={slashState.query}
          range={slashState.range}
          onClose={closeSlash}
        />
      )}
    </div>
  )
})

/** Lazy-loadable wrapper for code-splitting */
export default RichTextEditor
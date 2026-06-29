import { useState, useRef, useCallback } from 'react'
import { useComments, useCreateComment } from '@/hooks/useComments'
import { format } from 'date-fns'

interface CommentSectionProps {
  taskId: string
}

export function CommentSection({ taskId }: CommentSectionProps) {
  const { data: comments = [], isLoading } = useComments(taskId)
  const createComment = useCreateComment()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const content = text.trim()
    if (!content) return
    createComment.mutate(
      { task_id: taskId, content, author_id: 'user' },
      { onSuccess: () => setText('') },
    )
  }, [text, taskId, createComment])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleTextareaInput = useCallback(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
    }
  }, [])

  return (
    <div className="border-t border-border mt-4 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        评论
      </h4>

      {/* Comment list */}
      <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">加载中...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无评论</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                {c.author_id.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{c.author_id}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.created_at), 'MM-dd HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-0.5">
                  {c.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); handleTextareaInput() }}
          onKeyDown={handleKeyDown}
          placeholder="添加评论... (Enter 发送, Shift+Enter 换行)"
          rows={1}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || createComment.isPending}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {createComment.isPending ? '...' : '发送'}
        </button>
      </div>
    </div>
  )
}
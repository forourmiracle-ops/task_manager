import { useState, useRef, useEffect, memo, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTasks } from '@/hooks/useTasks'
import { useAuth } from '@/hooks/useAuth'
import { useAppStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { runWithTools } from '@/lib/ai-tools/run-with-tools'
import { executeDeleteTask } from '@/lib/ai-tools/delete-task'
import { ToolCallCard } from '@/components/ai/ToolCallCard'
import { ConfirmCard } from '@/components/ai/ConfirmCard'
import { MarkdownContent } from '@/components/ai/MarkdownContent'
import type { ToolContext } from '@/lib/ai-tools/types'

interface PendingConfirmation {
  messageId: string
  toolName: string
  taskId: string
  taskTitle: string
}

export const AIAssistantView = memo(function AIAssistantView() {
  const { data: tasks } = useTasks()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const deepseekApiKey = useAppStore((s) => s.deepseekApiKey)
  const messages = useAppStore((s) => s.messages)
  const isLoading = useAppStore((s) => s.isLoading)
  const addMessage = useAppStore((s) => s.addMessage)
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant)
  const addToolCall = useAppStore((s) => s.addToolCall)
  const updateToolResult = useAppStore((s) => s.updateToolResult)
  const setLoading = useAppStore((s) => s.setLoading)
  const clearMessages = useAppStore((s) => s.clearMessages)

  const [input, setInput] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)

  // Auto-scroll when new content arrives
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    if (isNearBottom || !isUserScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    isUserScrolledUpRef.current = !isNearBottom
  }

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [setLoading])

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingConfirmation) return

    const { messageId, taskId } = pendingConfirmation
    setPendingConfirmation(null)

    const context: ToolContext = {
      queryClient,
      userId: session?.user?.id ?? '',
      supabase,
    }

    const result = await executeDeleteTask(taskId, context)
    updateToolResult(messageId, { success: result.success, content: result.message })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }, [pendingConfirmation, queryClient, session?.user?.id, updateToolResult])

  const handleCancelDelete = useCallback(() => {
    if (!pendingConfirmation) return

    const { messageId } = pendingConfirmation
    setPendingConfirmation(null)
    updateToolResult(messageId, {
      success: false,
      content: '用户取消了删除操作。',
    })
  }, [pendingConfirmation, updateToolResult])

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading || pendingConfirmation) return

    const userMessage = input.trim()
    setInput('')
    addMessage({ role: 'user', content: userMessage })
    setLoading(true)

    const apiKey = deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY || ''
    if (!apiKey) {
      addMessage({ role: 'assistant', content: '未配置 DeepSeek API Key。请在「设置」页面中填入你的 API Key。' })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    const context: ToolContext = {
      queryClient,
      userId: session?.user?.id ?? '',
      supabase,
    }

    // Build system prompt with task context
    const systemPrompt = `你是一个项目管理 AI 助手。当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}。当前用户有以下任务：${JSON.stringify(
      tasks?.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, progress: t.progress_percent, due: t.due_date })) || []
    )}。你可以使用工具来搜索、创建、更新、删除任务，以及分析项目和生成报告。当用户请求操作时，请直接使用工具执行，不需要先询问确认（除非是删除操作）。`

    // Build messages for API
    const apiMessages: Array<{
      role: string
      content: string | null
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
      tool_call_id?: string
      name?: string
    }> = [{ role: 'system', content: systemPrompt }]

    // Convert UI messages to API format
    const currentMessages = useAppStore.getState().messages
    for (const msg of currentMessages) {
      switch (msg.role) {
        case 'user':
          apiMessages.push({ role: 'user', content: msg.content })
          break
        case 'assistant':
          apiMessages.push({ role: 'assistant', content: msg.content })
          break
        case 'tool_result':
          // tool_results are added during the loop, not from history
          break
        case 'tool_call':
          // tool_calls are added during the loop, not from history
          break
      }
    }

    try {
      await runWithTools(apiMessages, apiKey, context, controller.signal, {
        onTextDelta: (delta) => {
          const msgs = useAppStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant') {
            updateLastAssistant(last.content + delta)
          } else {
            addMessage({ role: 'assistant', content: delta })
          }
        },

        onToolCall: (tool) => {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tool.function.arguments)
          } catch { /* ignore parse errors */ }

          const msgId = crypto.randomUUID() // fallback; addToolCall generates its own
          addToolCall({
            role: 'tool_call',
            content: '',
            toolName: tool.function.name,
            toolArgs: args,
          })

          // Return the actual message ID from store
          const msgs = useAppStore.getState().messages
          return msgs[msgs.length - 1]?.id || msgId
        },

        onToolResult: (msgId, result) => {
          if (result.requiresConfirmation) {
            const confirmData = result.data as { taskId: string; taskTitle: string } | undefined
            if (confirmData) {
              const msgs = useAppStore.getState().messages
              const callMsg = msgs.find((m) => m.id === msgId)
              setPendingConfirmation({
                messageId: msgId,
                toolName: callMsg?.toolName || 'delete_task',
                taskId: confirmData.taskId,
                taskTitle: confirmData.taskTitle,
              })
              return
            }
          }
          updateToolResult(msgId, { success: result.success, content: result.message, data: result.data })
        },

        onDone: () => {
          // Ensure the last assistant message is properly saved
          const msgs = useAppStore.getState().messages
          const last = msgs[msgs.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            // Remove empty assistant message
            useAppStore.setState({ messages: msgs.slice(0, -1) })
          }
        },

        onError: (error) => {
          addMessage({ role: 'assistant', content: error })
        },
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        const msgs = useAppStore.getState().messages
        const last = msgs[msgs.length - 1]
        if (last?.role === 'assistant' && last.content) {
          updateLastAssistant(last.content + '\n\n*[已停止]*')
        }
      } else {
        const msg = err instanceof Error ? err.message : '未知错误'
        addMessage({ role: 'assistant', content: `AI 服务调用失败：${msg}` })
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">AI 助手</h2>
          <p className="text-xs text-muted-foreground mt-1">基于 DeepSeek 的智能任务管理助手</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              清空对话
            </button>
          )}
          {!deepseekApiKey && (
            <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
              未配置 API Key
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm w-full">
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/80 mx-auto flex items-center justify-center shadow-lg mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold">AI 任务助手</h3>
                <p className="text-xs text-muted-foreground mt-1">基于 DeepSeek，智能管理你的任务</p>
              </div>
              <div className="space-y-2">
                {[
                  { icon: '🔍', label: '搜索任务', desc: '按状态、关键词查找', color: 'border-blue-200 bg-blue-50/50' },
                  { icon: '➕', label: '创建任务', desc: '快速创建新任务', color: 'border-emerald-200 bg-emerald-50/50' },
                  { icon: '✏️', label: '更新任务', desc: '修改状态、进度等', color: 'border-amber-200 bg-amber-50/50' },
                  { icon: '📊', label: '项目分析', desc: '识别风险与瓶颈', color: 'border-violet-200 bg-violet-50/50' },
                  { icon: '📝', label: '生成报告', desc: '日/周报摘要', color: 'border-cyan-200 bg-cyan-50/50' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${item.color} transition-colors`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <div className="text-xs font-semibold">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            // Render tool call card (includes result once available)
            if (msg.role === 'tool_call') {
              // Check if this is pending confirmation
              if (pendingConfirmation && pendingConfirmation.messageId === msg.id) {
                return (
                  <ConfirmCard
                    key={msg.id}
                    message="确认删除以下任务？"
                    taskTitle={pendingConfirmation.taskTitle}
                    taskStatus=""
                    onConfirm={handleConfirmDelete}
                    onCancel={handleCancelDelete}
                  />
                )
              }
              return <ToolCallCard key={msg.id} message={msg} />
            }

            // Render user/assistant messages
            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white border border-border/50 shadow-sm'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  ) : (
                    <MarkdownContent content={msg.content} />
                  )}
                </div>
              </div>
            )
          })
        )}
        {isLoading && (
          <div className="flex justify-start items-center gap-2">
            <div className="bg-muted/50 rounded-lg px-4 py-2.5 text-sm border border-border/30 flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              <span className="text-xs text-muted-foreground">AI 正在思考</span>
            </div>
            <button
              onClick={handleStop}
              className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-destructive/30 hover:bg-destructive/5 transition-colors"
            >
              停止
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-border flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
            rows={2}
            disabled={!!pendingConfirmation}
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !!pendingConfirmation}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  )
})
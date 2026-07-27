import { useState, useRef, useEffect, memo, useCallback, type FormEvent, type KeyboardEvent } from 'react'
import { useTasks } from '@/hooks/useTasks'
import { useAppStore } from '@/store'

const WELCOME_MESSAGE = '你好！我是 DeepSeek AI 助手。我可以帮你：\n\n1. **智能拆解**：输入任务描述，我帮你自动生成多层级子任务\n2. **项目分析**：分析当前任务进度，识别风险\n\n请告诉我你需要什么帮助？'

export const AIAssistantView = memo(function AIAssistantView() {
  const { data: tasks } = useTasks()
  const deepseekApiKey = useAppStore((s) => s.deepseekApiKey)
  const messages = useAppStore((s) => s.messages)
  const isLoading = useAppStore((s) => s.isLoading)
  const addMessage = useAppStore((s) => s.addMessage)
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant)
  const setLoading = useAppStore((s) => s.setLoading)
  const clearMessages = useAppStore((s) => s.clearMessages)

  const [input, setInput] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUpRef = useRef(false)

  // Auto-scroll when new content arrives (streaming) or new messages added
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

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    addMessage({ role: 'user', content: userMessage })
    setLoading(true)

    // Resolve API key: store first, then env, then empty
    const apiKey = deepseekApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY || ''
    if (!apiKey) {
      addMessage({ role: 'assistant', content: '未配置 DeepSeek API Key。请在「设置」页面中填入你的 API Key。' })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    // Build message history for API (excluding the one we just added, which is already in store)
    const currentMessages = useAppStore.getState().messages

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            {
              role: 'system',
              content: `你是一个项目管理 AI 助手。当前日期：${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}。当前用户有以下任务：${JSON.stringify(
                tasks?.map((t) => ({ id: t.id, title: t.title, status: t.status, progress: t.progress_percent, due: t.due_date })) || []
              )}。请根据用户需求提供帮助。如果需要拆解任务，请生成结构化的子任务列表，格式为 JSON 数组：[{title: string, children?: [...]}]，最多 4 层。`,
            },
            ...currentMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        const errMsg = errData?.error?.message || `HTTP ${response.status}`
        throw new Error(errMsg)
      }

      if (!response.body) {
        throw new Error('响应体为空')
      }

      // Add an empty assistant message placeholder that we'll stream into
      addMessage({ role: 'assistant', content: '' })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const chunk = JSON.parse(dataStr)
            const delta = chunk.choices?.[0]?.delta?.content
            if (delta) {
              assistantContent += delta
              updateLastAssistant(assistantContent)
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Parse task breakdown from the final content
      const jsonMatch = assistantContent.match(/```json\n([\s\S]*?)\n```/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          if (Array.isArray(parsed)) {
            addMessage({
              role: 'assistant',
              content: '已从回复中检测到任务结构。你可以将上述任务添加到项目中。需要我帮你添加吗？回复"添加"即可。',
            })
          }
        } catch {
          // Not valid JSON
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User stopped — mark the partial message
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
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-4 py-2 text-sm bg-muted">
              <div className="whitespace-pre-wrap break-words">{WELCOME_MESSAGE}</div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <div className="whitespace-pre-wrap break-words overflow-x-auto">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start items-center gap-2">
            <div className="bg-muted rounded-lg px-4 py-2 text-sm">
              <span className="animate-pulse">思考中...</span>
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
        <div className="flex items-center gap-2 mb-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              className="w-3 h-3"
            />
            联网搜索
          </label>
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送，Shift+Enter 换行)"
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  )
})
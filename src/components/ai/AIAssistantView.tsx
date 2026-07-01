import { useState, useRef, useEffect, memo, type FormEvent, type KeyboardEvent } from 'react'
import { useTasks } from '@/hooks/useTasks'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export const AIAssistantView = memo(function AIAssistantView() {
  const { data: tasks } = useTasks()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '你好！我是 DeepSeek AI 助手。我可以帮你：\n\n1. **智能拆解**：输入任务描述，我帮你自动生成多层级子任务\n2. **项目分析**：分析当前任务进度，识别风险\n\n请告诉我你需要什么帮助？',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setLoading(true)

    try {
      // Call DeepSeek API via Supabase Edge Function (or direct for now)
      const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY || ''
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是一个项目管理 AI 助手。当前用户有以下任务：${JSON.stringify(
                tasks?.map((t) => ({ id: t.id, title: t.title, status: t.status, progress: t.progress_percent, due: t.due_date })) || []
              )}。请根据用户需求提供帮助。如果需要拆解任务，请生成结构化的子任务列表，格式为 JSON 数组：[{title: string, children?: [...]}]，最多 4 层。`,
            },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
          stream: false,
        }),
      })

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || '抱歉，AI 服务暂时不可用。'

      setMessages((prev) => [...prev, { role: 'assistant', content }])

      // Try to parse task breakdown from response
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/)
        if (jsonMatch) {
          const tasks = JSON.parse(jsonMatch[1])
          if (Array.isArray(tasks)) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: '已从回复中检测到任务结构。你可以将上述任务添加到项目中。需要我帮你添加吗？回复"添加"即可。',
              },
            ])
          }
        }
      } catch {
        // Not structured, ignore
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '抱歉，连接 AI 服务时出错。请确保已配置 VITE_DEEPSEEK_API_KEY 环境变量。' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold">AI 助手</h2>
        <p className="text-xs text-muted-foreground mt-1">基于 DeepSeek 的智能任务管理助手</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2 text-sm">
              <span className="animate-pulse">思考中...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-border">
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
            disabled={loading || !input.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            发送
          </button>
        </div>
      </form>
    </div>
  )
})
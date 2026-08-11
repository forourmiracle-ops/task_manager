import type { ToolContext, ToolResult } from './types'
import { getTool } from './tool-registry'
import { getToolDefinitionsForAPI } from './tool-registry'

interface DeepSeekMessage {
  role: string
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

interface Callbacks {
  onTextDelta: (delta: string) => void
  onToolCall: (tool: ToolCall) => string
  onToolResult: (id: string, result: ToolResult) => void
  onDone: () => void
  onError: (error: string) => void
}

const MAX_LOOPS = 10
const MAX_RESULT_LENGTH = 2000

/** 截断工具结果中的标题/描述等不可信数据，防止长文本注入 */
function sanitizeToolResult(content: string): string {
  if (content.length <= MAX_RESULT_LENGTH) return content
  return content.slice(0, MAX_RESULT_LENGTH) + '…[已截断]'
}

export async function runWithTools(
  messages: DeepSeekMessage[],
  supabaseUrl: string,
  accessToken: string,
  context: ToolContext,
  signal: AbortSignal,
  callbacks: Callbacks,
): Promise<void> {
  const tools = getToolDefinitionsForAPI()
  const proxyUrl = `${supabaseUrl}/functions/v1/ai-proxy`

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    if (signal.aborted) {
      callbacks.onError('操作已取消。')
      return
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages,
        tools,
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => null)
      const errMsg = errData?.error || `HTTP ${response.status}`
      if (response.status === 401) {
        callbacks.onError('登录已过期，请重新登录后重试。')
      } else {
        callbacks.onError(`AI 服务调用失败：${errMsg}`)
      }
      return
    }

    if (!response.body) {
      callbacks.onError('响应体为空')
      return
    }

    const { toolCalls, textContent } = await parseStreamResponse(response.body, callbacks.onTextDelta, signal)

    if (toolCalls.length === 0) {
      callbacks.onDone()
      return
    }

    // Add assistant message with tool_calls to messages BEFORE tool results
    messages.push({
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    })

    // Execute all tool calls
    for (const tc of toolCalls) {
      const msgId = callbacks.onToolCall(tc)
      const tool = getTool(tc.function.name)

      if (!tool) {
        callbacks.onToolResult(msgId, {
          success: false,
          message: `未知工具: ${tc.function.name}`,
        })
        messages.push({
          role: 'tool',
          content: `未知工具: ${tc.function.name}`,
          tool_call_id: tc.id,
        })
        continue
      }

      try {
        const args = JSON.parse(tc.function.arguments)
        const result = await tool.execute(args, context)
        callbacks.onToolResult(msgId, result)

        // 需要用户确认时，停止流式继续，不再回填模型
        if (result.requiresConfirmation) {
          return
        }

        // Refresh task data after any mutation
        context.queryClient.invalidateQueries({ queryKey: ['tasks'] })

        // Add tool result to messages for AI context (sanitized)
        const resultStr = sanitizeToolResult(JSON.stringify({ success: result.success, message: result.message }))
        messages.push({
          role: 'tool',
          content: resultStr,
          tool_call_id: tc.id,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '工具执行失败'
        callbacks.onToolResult(msgId, { success: false, message: errorMsg })
        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: false, message: errorMsg }),
          tool_call_id: tc.id,
        })
      }
    }
  }

  callbacks.onError('操作过于复杂，请分步描述')
}

async function parseStreamResponse(
  body: ReadableStream<Uint8Array>,
  onTextDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<{ toolCalls: ToolCall[]; textContent: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let textContent = ''

  const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>()

  while (true) {
    if (signal.aborted) break

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
        const delta = chunk.choices?.[0]?.delta

        if (delta?.content) {
          textContent += delta.content
          onTextDelta(delta.content)
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, {
                id: tc.id || '',
                name: tc.function?.name || '',
                arguments: '',
              })
            }
            const existing = toolCallMap.get(idx)!
            if (tc.id) existing.id = tc.id
            if (tc.function?.name) existing.name = tc.function.name
            if (tc.function?.arguments) existing.arguments += tc.function.arguments
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  const toolCalls: ToolCall[] = Array.from(toolCallMap.values()).map((tc) => ({
    id: tc.id,
    function: { name: tc.name, arguments: tc.arguments },
  }))

  return { toolCalls, textContent }
}
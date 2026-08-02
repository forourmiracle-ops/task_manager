import type { StateCreator } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  timestamp: number
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolSuccess?: boolean
  toolData?: unknown
}

export interface AISlice {
  messages: Message[]
  isLoading: boolean
  activeToolCalls: string[]
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastAssistant: (content: string) => void
  addToolCall: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateToolResult: (messageId: string, result: { success: boolean; content: string; data?: unknown }) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

const FIFO_LIMIT = 100

export const createAISlice: StateCreator<AISlice, [], [], AISlice> = (set) => ({
  messages: [],
  isLoading: false,
  activeToolCalls: [],

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages.slice(-(FIFO_LIMIT - 1)),
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
      ],
    })),

  updateLastAssistant: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content }
      }
      return { messages: msgs }
    }),

  addToolCall: (msg) =>
    set((s) => {
      const id = crypto.randomUUID()
      return {
        messages: [
          ...s.messages.slice(-(FIFO_LIMIT - 1)),
          { ...msg, id, timestamp: Date.now() },
        ],
        activeToolCalls: [...s.activeToolCalls, id],
      }
    }),

  updateToolResult: (messageId, result) =>
    set((s) => {
      const msgs = [...s.messages]
      const idx = msgs.findIndex((m) => m.id === messageId)
      if (idx !== -1) {
        msgs[idx] = {
          ...msgs[idx],
          content: result.content,
          toolSuccess: result.success,
          toolData: result.data,
        }
      }
      return {
        messages: msgs,
        activeToolCalls: s.activeToolCalls.filter((id) => id !== messageId),
      }
    }),

  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [], isLoading: false, activeToolCalls: [] }),
})
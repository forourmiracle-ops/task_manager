import type { StateCreator } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AISlice {
  messages: Message[]
  isLoading: boolean
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastAssistant: (content: string) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}

export const createAISlice: StateCreator<AISlice, [], [], AISlice> = (set) => ({
  messages: [],
  isLoading: false,

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages.slice(-49),
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

  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [], isLoading: false }),
})
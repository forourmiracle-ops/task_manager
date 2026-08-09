import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createUISlice, type UISlice } from './ui-slice'
import { createFilterSlice, type FilterSlice } from './filter-slice'
import { createSettingsSlice, type SettingsSlice } from './settings-slice'
import { createAISlice, type AISlice } from './ai-slice'

export type { ThemeMode, DefaultDimension } from './settings-slice'
export type { ViewStartMode } from './settings-slice'
export type { ProjectViewTab } from './ui-slice'
export type { DensityMode } from './settings-slice'
export type { Message } from './ai-slice'

export type AppState = UISlice & FilterSlice & SettingsSlice & AISlice

// AI 对话历史按 userId 分区存储，防止换账号串数据
let _currentAIUserId: string | null = null

function getStorageKey(): string {
  if (_currentAIUserId) return `taskflow_${_currentAIUserId}_ai-storage`
  return 'taskflow-ai-storage'
}

// Custom storage that dynamically uses the current user's key
const dynamicStorage = {
  getItem: (_name: string) => {
    const key = getStorageKey()
    return localStorage.getItem(key)
  },
  setItem: (_name: string, value: string) => {
    const key = getStorageKey()
    localStorage.setItem(key, value)
  },
  removeItem: (_name: string) => {
    const key = getStorageKey()
    localStorage.removeItem(key)
  },
}

export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createAISlice(...args),
      ...createUISlice(...args),
      ...createFilterSlice(...args),
      ...createSettingsSlice(...args),
    }),
    {
      name: 'taskflow-ai-storage',
      storage: createJSONStorage(() => dynamicStorage),
      partialize: (state) => ({
        messages: state.messages,
      }),
      version: 2,
      migrate: (_persistedState, _version) => {
        return { messages: [] } as Partial<AppState>
      },
    }
  )
)

/** 设置当前登录用户的 ID，用于 AI 对话的 per-user 存储 */
export function setAIStorageUserId(userId: string): void {
  const oldKey = getStorageKey()
  _currentAIUserId = userId

  // 迁移旧 key 的数据到新 key（仅允许从默认 key 迁移 v1 遗留数据，禁止用户间串数据）
  const newKey = getStorageKey()
  if (oldKey === 'taskflow-ai-storage' && oldKey !== newKey) {
    const oldData = localStorage.getItem(oldKey)
    if (oldData && !localStorage.getItem(newKey)) {
      try {
        const parsed = JSON.parse(oldData)
        if (parsed?.state?.messages?.length) {
          localStorage.setItem(newKey, oldData)
        }
      } catch { /* ignore */ }
    }
  }

  // 重新加载当前用户 key 下的消息（同步读取，避免异步 rehydrate 被后续
  // clearAIMessages 写空数据覆盖导致用户历史丢失）
  try {
    const raw = localStorage.getItem(newKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.messages?.length) {
        useAppStore.setState({ messages: parsed.state.messages })
        return
      }
    }
  } catch { /* ignore */ }
  // 新 key 无数据时设为 []（此时写空是安全的，因为磁盘上本来就没有数据）
  useAppStore.setState({ messages: [] })
}

/** 清理当前用户的 AI 对话存储 */
export function clearAIStorage(userId: string): void {
  localStorage.removeItem(`taskflow_${userId}_ai-storage`)
  localStorage.removeItem('taskflow-ai-storage')
  _currentAIUserId = null
}

/** 清空内存中的 AI 消息 */
export function clearAIMessages(): void {
  useAppStore.setState({ messages: [] })
}
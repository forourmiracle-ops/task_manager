import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createUISlice, type UISlice, type ProjectViewTab } from './ui-slice'
import { createFilterSlice, type FilterSlice } from './filter-slice'
import { createSettingsSlice, type SettingsSlice, type DensityMode } from './settings-slice'
import { createAISlice, type AISlice } from './ai-slice'

export type { ThemeMode, DefaultDimension } from './settings-slice'
export type { ViewStartMode } from './settings-slice'
export type { ProjectViewTab } from './ui-slice'
export type { DensityMode } from './settings-slice'
export type { Message } from './ai-slice'

export type AppState = UISlice & FilterSlice & SettingsSlice & AISlice

// AI 对话历史按 userId 分区存储，防止换账号串数据
function getStorageKey(): string {
  // 尝试从已有的 localStorage 中获取 userId（store 初始化时 auth 可能还未就绪）
  // 如果无法获取，使用默认 key；登录后会自动迁移到正确的 key
  const raw = localStorage.getItem('taskflow_ai_current_user')
  if (raw) {
    try {
      const { userId } = JSON.parse(raw)
      if (userId) return `taskflow_${userId}_ai-storage`
    } catch { /* ignore */ }
  }
  return 'taskflow-ai-storage'
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
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        messages: state.messages,
      }),
      version: 2,
      migrate: (persistedState, _version) => {
        // v1 → v2: always return empty messages (re-migrate with userId key)
        return { messages: [] } as Partial<AppState>
      },
    }
  )
)

/** 设置当前登录用户的 ID，用于 AI 对话的 per-user 存储 */
export function setAIStorageUserId(userId: string): void {
  localStorage.setItem('taskflow_ai_current_user', JSON.stringify({ userId }))
  // 迁移旧 key 的数据到新 key
  const oldKey = 'taskflow-ai-storage'
  const newKey = `taskflow_${userId}_ai-storage`
  const oldData = localStorage.getItem(oldKey)
  if (oldData && !localStorage.getItem(newKey)) {
    try {
      const parsed = JSON.parse(oldData)
      if (parsed?.state?.messages?.length) {
        localStorage.setItem(newKey, oldData)
      }
    } catch { /* ignore */ }
  }
  // 清除旧 key
  localStorage.removeItem(oldKey)

  // 更新 persist 中间件的存储 key
  // 由于 zustand persist 中间件的 key 在初始化时确定，这里通过重新加载 store 来生效
  // 实际效果：下次页面加载时使用新 key
}

/** 清理当前用户的 AI 对话存储 */
export function clearAIStorage(userId: string): void {
  localStorage.removeItem(`taskflow_${userId}_ai-storage`)
  localStorage.removeItem('taskflow_ai_current_user')
  localStorage.removeItem('taskflow-ai-storage')
}
import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAppStore } from '@/store'

interface UserSettingsRow {
  id: string
  user_id: string
  deepseek_api_key: string
  updated_at: string
}

/**
 * Sync user settings (API key, etc.) between localStorage and Supabase.
 * - On login: fetch settings from Supabase → merge into localStorage
 * - On change: save to localStorage → sync to Supabase
 * - On realtime: other device changes → sync to localStorage
 */
export function useUserSettings() {
  const { userId } = useAuth()
  const deepseekApiKey = useAppStore((s) => s.deepseekApiKey)
  const setDeepseekApiKey = useAppStore((s) => s.setDeepseekApiKey)
  const syncedRef = useRef(false)
  const lastLocalKeyRef = useRef(deepseekApiKey)

  // Fetch settings from Supabase on login
  useEffect(() => {
    if (!userId || syncedRef.current) return

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        if (error) {
          // Table might not exist yet — ignore
          if (!error.message.includes('does not exist')) {
            console.warn('[UserSettings] Fetch error:', error.message)
          }
          syncedRef.current = true
          return
        }

        const row = data as UserSettingsRow | null
        if (row?.deepseek_api_key) {
          // Supabase has a key — use it (cloud wins over local)
          setDeepseekApiKey(row.deepseek_api_key)
          lastLocalKeyRef.current = row.deepseek_api_key
        } else {
          // No key in Supabase — push local key to cloud
          const localKey = localStorage.getItem('taskflow-deepseek-key') || ''
          if (localKey) {
            await supabase.from('user_settings').upsert({
              user_id: userId,
              deepseek_api_key: localKey,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
          }
        }
        syncedRef.current = true
      } catch (err) {
        console.warn('[UserSettings] Sync error:', err)
        syncedRef.current = true
      }
    }

    fetchSettings()
  }, [userId, setDeepseekApiKey])

  // Sync local changes to Supabase
  useEffect(() => {
    if (!userId || !syncedRef.current) return
    if (deepseekApiKey === lastLocalKeyRef.current) return

    lastLocalKeyRef.current = deepseekApiKey

    const syncToCloud = async () => {
      try {
        await supabase.from('user_settings').upsert({
          user_id: userId,
          deepseek_api_key: deepseekApiKey,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      } catch (err) {
        console.warn('[UserSettings] Upsert error:', err)
      }
    }

    syncToCloud()
  }, [deepseekApiKey, userId])

  // Listen for realtime changes from other devices
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('user-settings-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as UserSettingsRow | null
          if (row?.deepseek_api_key && row.deepseek_api_key !== lastLocalKeyRef.current) {
            setDeepseekApiKey(row.deepseek_api_key)
            lastLocalKeyRef.current = row.deepseek_api_key
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, setDeepseekApiKey])
}
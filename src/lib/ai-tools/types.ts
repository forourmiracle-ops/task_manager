import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ToolContext {
  queryClient: QueryClient
  userId: string
  supabase: SupabaseClient
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  message: string
  data?: unknown
  requiresConfirmation?: boolean
}
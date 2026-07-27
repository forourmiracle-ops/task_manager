import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Template, RecurringTask } from '@/types'

const TEMPLATES_KEY = 'templates'
const RECURRING_KEY = 'recurring-tasks'

// ─── Templates ───────────────────────────────────────────────

async function fetchTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Template[]) || []
}

async function createTemplate(tmpl: Partial<Template>): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: tmpl.name || '新模板',
      description: tmpl.description || '',
      type: tmpl.type || 'task',
      scope: 'custom',
      icon: tmpl.icon || '📋',
      content: tmpl.content || { version: 1, title: '新模板' },
    })
    .select()
    .single()
  if (error) throw error
  return data as Template
}

async function updateTemplate(tmpl: Partial<Template> & { id: string }): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .update({
      name: tmpl.name,
      description: tmpl.description,
      icon: tmpl.icon,
      content: tmpl.content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tmpl.id)
    .select()
    .single()
  if (error) throw error
  return data as Template
}

async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}

async function duplicateTemplate(id: string): Promise<Template> {
  const { data: source, error: fetchErr } = await supabase
    .from('templates')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr || !source) throw fetchErr || new Error('Template not found')

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: `${source.name} (副本)`,
      description: source.description,
      type: source.type,
      scope: 'custom',
      icon: source.icon,
      content: source.content,
    })
    .select()
    .single()
  if (error) throw error
  return data as Template
}

// ─── Recurring Tasks ─────────────────────────────────────────

async function fetchRecurringTasks(): Promise<RecurringTask[]> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data as RecurringTask[]) || []
}

async function createRecurringTask(rt: Partial<RecurringTask>): Promise<RecurringTask> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .insert({
      template_id: rt.template_id!,
      parent_task_id: rt.parent_task_id || null,
      frequency: rt.frequency || 'daily',
      interval: rt.interval || 1,
      days_of_week: rt.days_of_week || [],
      next_run: rt.next_run || new Date().toISOString(),
      enabled: rt.enabled ?? true,
    })
    .select()
    .single()
  if (error) throw error
  return data as RecurringTask
}

async function updateRecurringTask(rt: Partial<RecurringTask> & { id: string }): Promise<RecurringTask> {
  const { data, error } = await supabase
    .from('recurring_tasks')
    .update({
      frequency: rt.frequency,
      interval: rt.interval,
      days_of_week: rt.days_of_week,
      next_run: rt.next_run,
      last_run: rt.last_run,
      enabled: rt.enabled,
      parent_task_id: rt.parent_task_id,
    })
    .eq('id', rt.id)
    .select()
    .single()
  if (error) throw error
  return data as RecurringTask
}

async function deleteRecurringTask(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_tasks').delete().eq('id', id)
  if (error) throw error
}

// ─── RPC: Claim recurring task (atomic) ─────────────────────

async function claimRecurringTask(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('fn_claim_recurring_task', {
    p_task_id: id,
  })
  if (error) throw error
  return data as string | null
}

// ─── Hooks ───────────────────────────────────────────────────

export function useTemplates() {
  return useQuery({
    queryKey: [TEMPLATES_KEY],
    queryFn: fetchTemplates,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] }),
  })
}

export function useUpdateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] }),
  })
}

export function useDuplicateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: duplicateTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: [TEMPLATES_KEY] }),
  })
}

export function useRecurringTasks() {
  return useQuery({
    queryKey: [RECURRING_KEY],
    queryFn: fetchRecurringTasks,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateRecurringTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createRecurringTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECURRING_KEY] }),
  })
}

export function useUpdateRecurringTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateRecurringTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECURRING_KEY] }),
  })
}

export function useDeleteRecurringTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteRecurringTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: [RECURRING_KEY] }),
  })
}

export function useClaimRecurringTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimRecurringTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RECURRING_KEY] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
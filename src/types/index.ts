export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type CycleType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface CycleConfig {
  weekday?: number
  monthDay?: number
  interval?: number
  customCron?: string
}

export interface Task {
  id: string
  parent_id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  start_date: string | null
  due_date: string | null
  progress_percent: number
  estimated_hours: number | null
  actual_hours: number | null
  cycle_type: CycleType
  cycle_config: CycleConfig | null
  sprint_id: string | null
  depends_on: string[]
  tags: string[]
  sort_order: number
  user_id: string
  created_at: string
  updated_at: string
  // Computed on client
  children?: Task[]
  depth?: number
}

export interface Sprint {
  id: string
  name: string
  start_date: string
  end_date: string
  goal: string
  created_at: string
}

export interface Comment {
  id: string
  task_id: string
  content: string
  author_id: string
  created_at: string
}

export interface Attachment {
  id: string
  task_id: string
  file_name: string
  storage_path: string
  size: number
  created_at: string
}

export interface Reminder {
  id: string
  task_id: string
  remind_at: string
  method: 'browser'
  created_at: string
}

export interface AISession {
  id: string
  session_type: 'task_breakdown' | 'project_analysis'
  messages: AIMessage[]
  created_at: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ViewType = 'project' | 'ai' | 'settings'
export type Dimension = 'week' | 'month' | 'quarter' | 'halfyear' | 'year'

export type TemplateType = 'project' | 'task' | 'recurring'
export type TemplateScope = 'builtin' | 'custom'
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly'

export interface TemplateContent {
  version: number
  title: string
  description?: string
  defaultValues?: Partial<Pick<Task, 'status' | 'priority' | 'estimated_hours' | 'tags'>>
  children?: TemplateContent[]
}

export interface Template {
  id: string
  name: string
  description: string
  type: TemplateType
  scope: TemplateScope
  icon: string
  content: TemplateContent
  is_public: boolean
  user_id: string | null
  created_at: string
  updated_at: string
}

export interface RecurringTask {
  id: string
  template_id: string
  parent_task_id: string | null
  frequency: RecurringFrequency
  interval: number
  days_of_week: number[]
  next_run: string
  last_run: string | null
  enabled: boolean
  user_id: string
  created_at: string
}
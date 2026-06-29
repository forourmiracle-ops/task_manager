import type { Task, TaskStatus, TaskPriority } from '@/types'

const VALID_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked']
const VALID_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']

export interface ImportResult {
  tasks: Partial<Task>[]
  errors: string[]
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current.trim())
  return result
}

export function parseCSV(content: string): ImportResult {
  const errors: string[] = []
  const tasks: Partial<Task>[] = []
  const lines = content.split('\n').filter((l) => l.trim())

  if (lines.length === 0) {
    return { tasks, errors: ['CSV 文件为空'] }
  }

  // Skip header line
  const dataLines = lines[0].toLowerCase().includes('标题') ? lines.slice(1) : lines

  for (let i = 0; i < dataLines.length; i++) {
    const cols = parseCSVLine(dataLines[i])
    if (cols.length < 4) {
      errors.push(`第 ${i + 2} 行：列数不足`)
      continue
    }

    const title = cols[0].trim()
    if (!title) {
      errors.push(`第 ${i + 2} 行：标题为空，已跳过`)
      continue
    }

    const status = cols[1]?.trim() || 'todo'
    const priority = cols[2]?.trim() || 'medium'
    const startDate = cols[3]?.trim() || null
    const dueDate = cols[4]?.trim() || null
    const progress = Number(cols[5]) || 0
    const estimatedHours = cols[6]?.trim() ? Number(cols[6]) : null
    const parentId = cols[7]?.trim() || null
    const tags = cols[8]?.trim() ? cols[8].split(';').map((s) => s.trim()).filter(Boolean) : []

    if (!VALID_STATUSES.includes(status as TaskStatus)) {
      errors.push(`第 ${i + 2} 行：无效状态 "${status}"，已设为 todo`)
    }
    if (!VALID_PRIORITIES.includes(priority as TaskPriority)) {
      errors.push(`第 ${i + 2} 行：无效优先级 "${priority}"，已设为 medium`)
    }

    tasks.push({
      title,
      status: (VALID_STATUSES.includes(status as TaskStatus) ? status : 'todo') as TaskStatus,
      priority: (VALID_PRIORITIES.includes(priority as TaskPriority) ? priority : 'medium') as TaskPriority,
      start_date: startDate,
      due_date: dueDate,
      progress_percent: Math.max(0, Math.min(100, progress)),
      estimated_hours: estimatedHours,
      parent_id: parentId,
      tags,
      sort_order: i,
    })
  }

  return { tasks, errors }
}

export function parseJSON(content: string): ImportResult {
  const errors: string[] = []
  try {
    const data = JSON.parse(content)
    const arr = Array.isArray(data) ? data : [data]
    const tasks: Partial<Task>[] = arr.map((item: Record<string, unknown>, i: number) => ({
      title: String(item.title || ''),
      description: String(item.description || ''),
      status: (VALID_STATUSES.includes(item.status as TaskStatus) ? item.status : 'todo') as TaskStatus,
      priority: (VALID_PRIORITIES.includes(item.priority as TaskPriority) ? item.priority : 'medium') as TaskPriority,
      start_date: (item.start_date as string) || null,
      due_date: (item.due_date as string) || null,
      progress_percent: Math.max(0, Math.min(100, Number(item.progress_percent) || 0)),
      estimated_hours: item.estimated_hours ? Number(item.estimated_hours) : null,
      parent_id: (item.parent_id as string) || null,
      tags: Array.isArray(item.tags) ? item.tags as string[] : [],
      depends_on: Array.isArray(item.depends_on) ? item.depends_on as string[] : [],
      sort_order: i,
    }))
    return { tasks, errors }
  } catch {
    return { tasks: [], errors: ['JSON 解析失败：文件格式不正确'] }
  }
}

export function parseFile(filename: string, content: string): ImportResult {
  if (filename.endsWith('.csv')) {
    return parseCSV(content)
  }
  if (filename.endsWith('.json')) {
    return parseJSON(content)
  }
  return { tasks: [], errors: ['不支持的文件格式，请使用 .csv 或 .json'] }
}
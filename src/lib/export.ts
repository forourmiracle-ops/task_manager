import type { Task } from '@/types'

const CSV_HEADERS = ['标题', '状态', '优先级', '开始日期', '截止日期', '进度', '预估工时', '父任务ID', '标签']

function taskToCSVRow(task: Task): string {
  return [
    escapeCsv(task.title),
    task.status,
    task.priority,
    task.start_date || '',
    task.due_date || '',
    String(task.progress_percent || 0),
    task.estimated_hours ? String(task.estimated_hours) : '',
    task.parent_id || '',
    (task.tags || []).join(';'),
  ].join(',')
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export function exportToCSV(tasks: Task[]): string {
  return [CSV_HEADERS.join(','), ...tasks.map(taskToCSVRow)].join('\n')
}

export function exportToJSON(tasks: Task[]): string {
  return JSON.stringify(tasks, null, 2)
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
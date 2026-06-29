import { useState, useRef } from 'react'
import { useCreateTask } from '@/hooks/useTasks'
import { parseFile, type ImportResult } from '@/lib/import'
import type { Task } from '@/types'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
}

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [result, setResult] = useState<ImportResult | null>(null)
  const [filename, setFilename] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const createTask = useCreateTask()

  if (!open) return null

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const text = await file.text()
    const r = parseFile(file.name, text)
    setResult(r)
    setDone(false)
    setImported(0)
  }

  const handleImport = async () => {
    if (!result || result.tasks.length === 0) return
    setImporting(true)
    let count = 0
    for (const task of result.tasks) {
      if (!task.title) continue
      try {
        await new Promise<void>((resolve, reject) => {
          createTask.mutate(task as Parameters<typeof createTask.mutate>[0], {
            onSuccess: () => { count++; resolve() },
            onError: (err) => { console.error('Import error:', err); resolve() },
          })
        })
      } catch {
        // continue
      }
    }
    setImported(count)
    setImporting(false)
    setDone(true)
  }

  const handleReset = () => {
    setResult(null)
    setFilename('')
    setDone(false)
    setImported(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-md"
      onClick={handleOverlayClick}
    >
      <div className="border border-border rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ backgroundColor: 'hsl(var(--background))', boxShadow: '0 24px 70px -12px rgba(0,0,0,0.35)' }}>
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/10">
          <h3 className="text-sm font-bold">导入任务</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-auto">
          {!result ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                  <path d="M8 2v10M4 6l4-4 4 4M2 12v2h12v-2" />
                </svg>
              </div>
              <p className="text-xs text-muted-foreground">选择 CSV 或 JSON 文件导入任务</p>
              <label className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 cursor-pointer transition-all">
                选择文件
                <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFile} className="hidden" />
              </label>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">文件：</span>
                <span className="font-semibold">{filename}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">解析到：</span>
                <span className="font-semibold text-primary">{result.tasks.length} 条任务</span>
                {result.errors.length > 0 && (
                  <span className="text-red-500">({result.errors.length} 个警告)</span>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50/50 border border-red-200 rounded-lg p-2.5 max-h-24 overflow-auto">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-[10px] text-red-600">{err}</p>
                  ))}
                </div>
              )}

              {result.tasks.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="text-[10px] font-bold text-muted-foreground bg-muted/20 px-3 py-1.5 border-b border-border">
                    预览（前 5 条）
                  </div>
                  {result.tasks.slice(0, 5).map((t, i) => (
                    <div key={i} className="px-3 py-2 border-b border-border/50 last:border-b-0 text-xs flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="truncate font-medium">{t.title}</span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{t.start_date || '-'} ~ {t.due_date || '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              {done && (
                <div className="bg-green-50/50 border border-green-200 rounded-lg p-2.5 text-xs text-green-700">
                  成功导入 {imported} 条任务
                </div>
              )}
            </>
          )}
        </div>

        {result && (
          <div className="flex gap-2 px-4 py-3.5 border-t border-border bg-muted/10">
            <button onClick={handleReset} className="flex-1 py-2 text-xs font-medium border border-border rounded-lg hover:bg-accent transition-colors">
              重新选择
            </button>
            <button
              onClick={handleImport}
              disabled={done || importing || result.tasks.length === 0}
              className="flex-1 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50 shadow-sm transition-all"
            >
              {importing ? '导入中...' : done ? `已导入 ${imported} 条` : `导入 ${result.tasks.length} 条`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
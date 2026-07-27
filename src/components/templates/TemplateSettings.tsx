import { useState, memo } from 'react'
import { useTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate, useDuplicateTemplate } from '@/hooks/useTemplates'
import { useAppStore } from '@/store'
import type { Template, TemplateType, TemplateContent } from '@/types'

const TYPE_LABELS: Record<TemplateType, string> = {
  project: '项目模板',
  task: '任务模板',
  recurring: '重复任务',
}

export const TemplateSettings = memo(function TemplateSettings() {
  const { data: templates, isLoading } = useTemplates()
  const createTemplate = useCreateTemplate()
  const updateTemplate = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()
  const duplicateTemplate = useDuplicateTemplate()
  const expandTemplateLib = useAppStore((s) => s.expandTemplateLib)
  const setExpandTemplateLib = useAppStore((s) => s.setExpandTemplateLib)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('📋')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const customTemplates = (templates || []).filter((t) => t.scope === 'custom')
  const builtinTemplates = (templates || []).filter((t) => t.scope === 'builtin')

  const handleCreate = async () => {
    await createTemplate.mutateAsync({
      name: '新模板',
      type: 'task',
      content: { version: 1, title: '新任务' },
    })
  }

  const handleStartEdit = (t: Template) => {
    setEditingId(t.id)
    setEditName(t.name)
    setEditDesc(t.description)
    setEditIcon(t.icon)
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    await updateTemplate.mutateAsync({
      id: editingId,
      name: editName,
      description: editDesc,
      icon: editIcon,
    })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await deleteTemplate.mutateAsync(id)
    setShowDeleteConfirm(null)
  }

  const handleDuplicate = async (id: string) => {
    await duplicateTemplate.mutateAsync(id)
  }

  const handleExport = () => {
    const data = JSON.stringify(customTemplates, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'taskflow-templates.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const imported = JSON.parse(text) as Template[]
        for (const t of imported) {
          await createTemplate.mutateAsync({
            name: t.name,
            description: t.description,
            type: t.type,
            icon: t.icon,
            content: t.content,
          })
        }
      } catch {
        alert('导入失败：文件格式不正确')
      }
    }
    input.click()
  }

  if (isLoading) {
    return (
      <div className="p-6 text-xs text-muted-foreground">加载中...</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">模板管理</h3>
          <p className="text-xs text-muted-foreground mt-1">管理自定义模板，内置模板可复制后编辑</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent"
          >
            导入
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent"
            disabled={customTemplates.length === 0}
          >
            导出
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            新建模板
          </button>
        </div>
      </div>

      {/* Preference */}
      <div className="bg-muted/20 rounded-xl p-4 border border-border/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={expandTemplateLib}
            onChange={(e) => setExpandTemplateLib(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary"
          />
          <span className="text-xs">新建项目/任务时，默认展开模板库</span>
        </label>
      </div>

      {/* Custom templates */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          自定义模板 ({customTemplates.length})
        </h4>
        {customTemplates.length === 0 ? (
          <div className="text-xs text-muted-foreground bg-muted/20 rounded-lg p-4 border border-border/50">
            暂无自定义模板。点击"新建模板"创建，或从内置模板复制。
          </div>
        ) : (
          <div className="space-y-1">
            {customTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/50 transition-colors"
              >
                {editingId === t.id ? (
                  <>
                    <input
                      type="text"
                      value={editIcon}
                      onChange={(e) => setEditIcon(e.target.value)}
                      className="w-8 text-center text-sm border border-border rounded bg-background"
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
                    />
                    <button onClick={handleSaveEdit} className="text-xs text-primary font-semibold">保存</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground">取消</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground">{TYPE_LABELS[t.type]}</div>
                    </div>
                    <button
                      onClick={() => handleStartEdit(t)}
                      className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
                    >
                      编辑
                    </button>
                    {showDeleteConfirm === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-xs text-destructive font-semibold px-2 py-1"
                        >
                          确认删除
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="text-xs text-muted-foreground px-2 py-1"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowDeleteConfirm(t.id)}
                        className="text-xs text-muted-foreground hover:text-destructive px-2 py-1"
                      >
                        删除
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Builtin templates */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          内置模板 ({builtinTemplates.length})
        </h4>
        <div className="space-y-1">
          {builtinTemplates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/10"
            >
              <span className="text-sm">{t.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{TYPE_LABELS[t.type]} · 内置</div>
              </div>
              <button
                onClick={() => handleDuplicate(t.id)}
                className="text-xs text-primary hover:underline px-2 py-1"
              >
                复制为自定义
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
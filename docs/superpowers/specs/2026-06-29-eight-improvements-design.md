# 八项综合改进设计文档

**日期**: 2026-06-29
**状态**: 设计完成，待实现

---

## 概述

本轮涵盖 4 个用户反馈的 Bug/UX 问题 + 4 个 Gemini 测试报告确认的需求：

| # | 来源 | 模块 | 类型 |
|---|------|------|------|
| 1 | 用户 | 草稿功能修复 | Bug |
| 2 | 用户 | 回到今天显示修复 | Bug |
| 3 | 用户 | 拖拽视觉反馈 | UX |
| 4 | 用户 | 拖拽撤回 | UX |
| 5 | Gemini | 甘特图虚拟列表 | 性能 |
| 6 | Gemini | 保存并创建下一个 | UX |
| 7 | Gemini | 数据导入/导出 | 功能 |
| 8 | Gemini | 键盘快捷键 | UX |

---

## 1. 草稿功能修复

### 根因

`commitEdit` 草稿分支中，`mutate` 是异步的，`onSettled` 回调可能在 React 组件卸载后才执行，导致 `committingRef` 永不释放。此外 `buildPayload` 返回 null 时的回退 payload 类型不完整。

### 修复

```tsx
if (conflictMessage) {
  setValidationError(conflictMessage)
  const payload = buildPayload(field, value)
  const oldValue = field === 'start_date' ? (t.start_date || '') : (t.due_date || '')
  const draftPayload = payload || { id: t.id, [field]: value || null }
  setEditingField(null)
  setEditValue('')

  updateTask.mutate(draftPayload as Partial<Task> & { id: string }, {
    onSuccess: () => {
      showDraftToast({
        message: `日期与父任务冲突：${conflictMessage}`,
        onUndo: () => {
          updateTask.mutate({ id: t.id, [field]: oldValue || null } as Partial<Task> & { id: string })
        },
      })
    },
    onSettled: () => { committingRef.current = false },
    onError: () => { committingRef.current = false },
  })
  return
}
```

### 涉及文件

- `src/components/tasks/DetailPanel.tsx`

---

## 2. 回到今天修复

### 根因

`useLayoutEffect` 中设置 `scrollLeft` 时，`scrollWidth` 可能尚未更新（DOM 布局异步），导致 `scrollLeft` 被裁剪为 0 或旧值。

### 修复

双重 `requestAnimationFrame` 确保布局完成：

```tsx
useLayoutEffect(() => {
  const el = dateScrollRef.current
  if (!el || DAY_WIDTH <= 0) return

  const scrollPos = getScrollTarget(viewStartMode, dimension, todayOffset, startDate, DAY_WIDTH)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, scrollPos)
    })
  })
}, [todayOffset, dimension, DAY_WIDTH, allFlatTasks.length, viewStartMode])
```

### 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 3. 拖拽视觉反馈

### 设计

| 状态 | 视觉表现 |
|------|---------|
| 拖拽开始 | 源行：`opacity-40` + `border-2 border-primary` 虚线边框 |
| 经过目标 | 目标行上方：3px 蓝色实线（`bg-primary`）指示插入位置 |
| 拖拽中 | 鼠标：`cursor-grabbing` |
| 释放 | 所有视觉反馈清除，源行恢复 |

### 实现

使用 `useState` 追踪 `dragState: { sourceId, targetIdx }`。在 `onDragOver` 中更新 `targetIdx`，在 `onDragLeave`/`onDrop`/`onDragEnd` 中清除。

每个任务行根据 `dragState` 动态添加 CSS 类：

```tsx
className={cn(
  'flex items-center ...',
  dragState?.sourceId === task.id && 'opacity-40 border-2 border-dashed border-primary',
)}
```

插入指示线用绝对定位的 `<div>`：

```tsx
{dragState?.targetIdx === idx && dragState.sourceId !== task.id && (
  <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-20" />
)}
```

### 涉及文件

- `src/components/gantt/GanttView.tsx` — 左右面板任务行

---

## 4. 拖拽撤回

### 设计

每次拖拽完成后记录操作快照，`Ctrl+Z` 撤销上次拖拽。

### 实现

```tsx
interface DragSnapshot {
  sourceId: string
  oldSortOrder: number
  oldParentId: string | null
}

const dragSnapshotRef = useRef<DragSnapshot | null>(null)

// 在 onDrop 中保存快照：
const sourceTask = visibleTasks.find(t => t.id === sourceId)
if (sourceTask) {
  dragSnapshotRef.current = {
    sourceId,
    oldSortOrder: sourceTask.sort_order,
    oldParentId: sourceTask.parent_id || null,
  }
}

// 全局快捷键 Ctrl+Z：
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      const snap = dragSnapshotRef.current
      if (!snap) return
      e.preventDefault()
      updateTask.mutate({
        id: snap.sourceId,
        sort_order: snap.oldSortOrder,
        parent_id: snap.oldParentId,
      })
      dragSnapshotRef.current = null
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [updateTask])
```

### 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 5. 甘特图虚拟列表

### 设计

使用 `@tanstack/react-virtual`，仅渲染可视区域内的行。左右面板共享同一个 virtualizer 实例。

### 实现

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

const virtualizer = useVirtualizer({
  count: visibleTasks.length,
  getScrollElement: () => taskListRef.current,
  estimateSize: () => ROW_HEIGHT,
  overscan: 5,
})

const virtualItems = virtualizer.getVirtualItems()
```

左右面板的 `map` 改为遍历 `virtualItems`，每行使用 `transform: translateY(...)` 定位。

两个面板滚动同步：`onScroll` 事件互相设置 `scrollTop`。

### 安装依赖

```bash
npm install @tanstack/react-virtual
```

### 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 6. 保存并创建下一个

### 设计

CreateTaskDialog 底部增加 checkbox「连续添加」。勾选后提交不关闭弹窗。

### 实现

```tsx
const [keepOpen, setKeepOpen] = useState(false)

// 表单提交：
onSuccess: () => {
  if (keepOpen) {
    resetForm()          // 清空表单
    titleInputRef.current?.focus()  // 聚焦标题
  } else {
    stopCreating()
  }
}
```

### 涉及文件

- `src/components/tasks/CreateTaskDialog.tsx`

---

## 7. 数据导入/导出

### 设计

工具栏增加「导出」和「导入」按钮。

**导出流程**：
1. 点击导出 → 下拉选择 CSV/JSON
2. 生成文件 → 触发浏览器下载

**导入流程**：
1. 点击导入 → 弹出文件选择器（接受 .csv/.json）
2. 解析文件 → 预览弹窗显示前 5 条数据
3. 确认导入 → 批量创建任务

**CSV 格式**：标题、状态、优先级、开始日期、截止日期、进度、父任务ID、标签

**JSON 格式**：完整 Task 数组，保留嵌套结构

### 新增文件

- `src/lib/export.ts` — 导出逻辑（taskToCSV / taskToJSON）
- `src/lib/import.ts` — 导入解析（parseCSV / parseJSON）
- `src/components/ui/ImportDialog.tsx` — 导入预览弹窗

### 涉及文件

- `src/components/gantt/GanttView.tsx` — 工具栏按钮
- `src/App.tsx` — 注册 ImportDialog

---

## 8. 键盘快捷键

### 全局快捷键

| 快捷键 | 功能 | 实现方式 |
|--------|------|---------|
| `N` | 新建任务 | `startCreating(null)` |
| `/` | 聚焦搜索 | 搜索框 `focus()` |
| `Esc` | 关闭面板/弹窗 | `setDetailPanelOpen(false)` |
| `Ctrl+Z` | 撤销拖拽 | 回滚上次拖拽 |
| `?` | 快捷键面板 | 显示 CheatSheet 弹窗 |

### 上下文快捷键

| 快捷键 | 条件 | 功能 |
|--------|------|------|
| `E` | 详情面板打开 | 编辑标题 |
| `Delete` | 详情面板打开 | 删除任务 |
| `J` | 甘特图聚焦 | 下一个任务 |
| `K` | 甘特图聚焦 | 上一个任务 |

### 实现

```tsx
// src/hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // ... dispatch shortcuts
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}
```

### 新增文件

- `src/hooks/useKeyboardShortcuts.ts` — 快捷键 hook
- `src/components/ui/CheatSheet.tsx` — 快捷键面板

### 涉及文件

- `src/App.tsx` — 注册 useKeyboardShortcuts + CheatSheet

---

## 影响范围总结

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `src/components/tasks/DetailPanel.tsx` | 修改 | 草稿分支 onError 兜底 |
| `src/components/gantt/GanttView.tsx` | 修改 | 回到今天 rAF、拖拽视觉、拖拽撤回、虚拟列表、导入导出按钮 |
| `src/components/tasks/CreateTaskDialog.tsx` | 修改 | 连续添加 checkbox |
| `src/hooks/useKeyboardShortcuts.ts` | **新增** | 全局/上下文快捷键 |
| `src/components/ui/CheatSheet.tsx` | **新增** | 快捷键面板 |
| `src/lib/export.ts` | **新增** | CSV/JSON 导出 |
| `src/lib/import.ts` | **新增** | CSV/JSON 解析 |
| `src/components/ui/ImportDialog.tsx` | **新增** | 导入预览弹窗 |
| `src/App.tsx` | 修改 | 注册快捷键 + CheatSheet + ImportDialog |
| `package.json` | 修改 | 新增 @tanstack/react-virtual |

---

## 不变更范围

- 任务数据结构不修改
- 数据库 schema 不修改
- BoardView、CalendarView 不改动
- AI 助手视图不改动
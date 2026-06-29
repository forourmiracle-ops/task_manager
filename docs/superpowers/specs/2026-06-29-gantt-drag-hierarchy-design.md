# 甘特图拖拽 + 层级调整 + Bug 修复设计文档

**日期**: 2026-06-29
**状态**: 设计完成，待实现

---

## 概述

修复上轮迭代遗留的 2 个 bug，并新增 2 个交互功能：

1. **Bug 修复** — 甘特图顺序 + 草稿暂存未生效
2. **回到今天双段行为** — 首次居中、再次置首
3. **甘特图拖拽排序** — HTML5 DnD + 3s 长按约束确认
4. **层级调整树状图** — 可交互层级树 + 箭头操作

---

## 1. Bug 修复

### 1.1 甘特图顺序

**根因**：`visibleTasks` 的 `useMemo` 中，子任务在 `filterExpanded` 递归后未按 `sort_order` 排序。`flattenTasks` 仅按 children 数组顺序展开，但 children 的 push 顺序取决于原始 `tasks` 数组中子任务的出现顺序，而非 `sort_order`。

**修复**：在 `flattenTasks` 返回前按 `sort_order` 排序：

```tsx
const visibleTasks = useMemo(() => {
  // ... existing filter logic ...
  const result = flattenTasks(filterExpanded(roots))
  return result.sort((a, b) => a.sort_order - b.sort_order)
}, [allFlatTasks, viewportRange, expandedIds])
```

### 1.2 草稿暂存

**根因**：`commitEdit` 在草稿分支中，`committingRef.current = false` 在 `updateTask.mutate` 调用前执行，并且 `buildPayload` 返回的 payload 可能为 `null`（如果值未变化）。

**修复**：
1. 将 `committingRef.current = false` 移到 `updateTask.mutate` 的 `onSettled` 中
2. 草稿分支中，若 `buildPayload` 返回 null，仍然调用 `updateTask.mutate` 但使用直接构造的 payload

```tsx
if (conflictMessage) {
  setValidationError(conflictMessage)
  const payload = buildPayload(field, value) || { id: t.id, [field]: value || null }
  const oldValue = field === 'start_date' ? (t.start_date || '') : (t.due_date || '')
  setEditingField(null)
  setEditValue('')

  updateTask.mutate(payload as Partial<Task> & { id: string }, {
    onSuccess: () => {
      showDraftToast({
        message: `日期与父任务冲突：${conflictMessage}`,
        onUndo: () => {
          updateTask.mutate({ id: t.id, [field]: oldValue || null } as Partial<Task> & { id: string })
        },
      })
    },
    onSettled: () => { committingRef.current = false },
  })
  return
}
```

### 涉及文件

- `src/components/gantt/GanttView.tsx` — `visibleTasks` 排序
- `src/components/tasks/DetailPanel.tsx` — `commitEdit` 草稿分支

---

## 2. 回到今天双段行为

### 交互设计

```
第 1 次点击 → 今日居中（scrollLeft = todayOffset * DAY_WIDTH - panelWidth/2 + DAY_WIDTH/2）
第 2 次点击 → 今日置首（scrollLeft = todayOffset * DAY_WIDTH）
再次点击 → 循环回居中
```

### 实现

使用 `clickCountRef` 记录点击次数，300ms 内连续点击视为同一序列：

```tsx
const clickCountRef = useRef(0)
const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleGoToToday = () => {
  if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
  clickCountRef.current = (clickCountRef.current % 2) + 1

  const scrollPos = getScrollTarget(viewStartMode, dimension, todayOffset, startDate, DAY_WIDTH)
  if (clickCountRef.current === 1) {
    dateScrollRef.current.scrollLeft = Math.max(0, scrollPos - datePanelWidth / 2 + DAY_WIDTH / 2)
  } else {
    dateScrollRef.current.scrollLeft = Math.max(0, scrollPos)
  }

  clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0 }, 300)
}
```

按钮文案随状态变化：第 1 次后显示「今日置首」，第 2 次后恢复「回到今天」。

### 涉及文件

- `src/components/gantt/GanttView.tsx` — 替换「回到今天」按钮逻辑

---

## 3. 甘特图拖拽排序

### 交互设计

```
拖拽开始 → 拖拽行高亮 + 插入位置指示线
  ↓
松手时检测约束冲突
  ├─ 无冲突 → 更新 sort_order，完成
  └─ 有冲突 → 检查拖拽持续时间
       ├─ < 3s → 回弹，不生效
       └─ >= 3s → 弹出确认对话框
            ├─ 确认 → 更新 sort_order + 必要时更新 parent_id
            └─ 取消 → 回弹
```

### 约束冲突定义

- **日期冲突**：子任务拖拽到新父任务下，其 start_date/due_date 超出新父任务范围
- **层级冲突**：拖拽导致任务 parent_id 变化（跨父任务移动）

### 实现架构

**新增组件**：`src/components/gantt/GanttDragLayer.tsx`

功能：
- 包裹每个任务行，添加 `draggable` 属性
- `onDragStart`：记录源任务 ID 和原始位置
- `onDragOver`：计算目标位置，显示插入指示线
- `onDrop`：检测约束冲突，执行或回弹
- 拖拽 >= 3s 时显示倒计时浮层

**关键逻辑**：

```tsx
// 拖拽持续时间追踪
const dragStartTimeRef = useRef(0)

const handleDragStart = (e: DragEvent, taskId: string) => {
  dragStartTimeRef.current = Date.now()
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', taskId)
}

const handleDrop = (e: DragEvent, targetIndex: number) => {
  const sourceId = e.dataTransfer.getData('text/plain')
  const duration = Date.now() - dragStartTimeRef.current
  const hasConflict = checkConstraints(sourceId, targetIndex)

  if (hasConflict && duration < 3000) {
    // 回弹
    return
  }

  if (hasConflict) {
    // 弹出确认对话框
    showConfirmDialog({
      message: getConflictMessage(sourceId, targetIndex),
      onConfirm: () => reorderTasks(sourceId, targetIndex),
    })
  } else {
    reorderTasks(sourceId, targetIndex)
  }
}
```

**排序更新**：拖拽后重新计算所有受影响任务的 `sort_order`，通过 `updateTask` 批量更新。

### 涉及文件

- `src/components/gantt/GanttDragLayer.tsx` — **新增**，拖拽逻辑 + 约束检查
- `src/components/gantt/GanttView.tsx` — 集成 GanttDragLayer，包裹任务行
- `src/hooks/useTasks.ts` — 新增 `useReorderTasks` mutation（批量更新 sort_order）

---

## 4. 层级调整树状图

### 交互设计

替换 DetailPanel 中现有的 `TaskBreadcrumb` 为可交互的层级树：

```
┌─────────────────────────────────┐
│ 层级调整                     [+] │
│                                 │
│  ├─ 项目A (父任务)              │
│  │  ├─ 模块B (当前任务) ← 高亮  │
│  │  │  ├─ 子任务C        [↑][↗]│
│  │  │  └─ 子任务D        [↑][↗]│
│  │  └─ 兄弟任务E         [↑][↗]│
│  └─ 其他任务...                 │
└─────────────────────────────────┘
```

### 操作按钮

每个节点右侧显示操作箭头，当前任务节点不显示：

| 按钮 | 行为 | 可见条件 |
|------|------|---------|
| `↑` | 提升一级（移到祖父节点下） | 有父任务且父任务有父任务 |
| `↗` | 提升到顶层（移到根级） | 有父任务 |
| `→` | 移至同级上一个兄弟节点下 | 有同级兄弟任务 |

### 实现

**新增组件**：`src/components/tasks/HierarchyTree.tsx`

功能：
- 构建以当前任务为根的完整祖先树 + 兄弟节点 + 子节点
- 折叠/展开子节点
- 操作箭头调用 `updateTask` 修改 `parent_id`

**层级调整逻辑**：

```tsx
// 提升一级：将当前任务移到祖父节点下
const promoteOneLevel = (taskId: string) => {
  const task = tasks.find(t => t.id === taskId)
  if (!task?.parent_id) return
  const parent = tasks.find(t => t.id === task.parent_id)
  const grandparentId = parent?.parent_id || null
  updateTask.mutate({ id: taskId, parent_id: grandparentId })
}

// 提升到顶层：移除 parent_id
const promoteToRoot = (taskId: string) => {
  updateTask.mutate({ id: taskId, parent_id: null })
}
```

### 涉及文件

- `src/components/tasks/HierarchyTree.tsx` — **新增**，层级树组件
- `src/components/tasks/DetailPanel.tsx` — 替换 TaskBreadcrumb 为 HierarchyTree

---

## 影响范围总结

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `src/components/gantt/GanttView.tsx` | 修改 | 1. visibleTasks 排序修复；2. 回到今天双段行为；3. 集成拖拽 |
| `src/components/gantt/GanttDragLayer.tsx` | **新增** | 拖拽排序 + 约束检测 + 3s 确认 |
| `src/components/tasks/DetailPanel.tsx` | 修改 | 1. commitEdit 草稿修复；2. 替换为 HierarchyTree |
| `src/components/tasks/HierarchyTree.tsx` | **新增** | 可交互层级树 |
| `src/hooks/useTasks.ts` | 修改 | 新增 useReorderTasks mutation |

---

## 不变更范围

- 任务数据结构（Task interface）不修改
- 数据库 schema 不修改
- 其他视图（BoardView、CalendarView）不修改
- 现有依赖不变
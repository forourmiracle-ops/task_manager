# UX 修复设计文档

**日期**: 2026-06-29
**状态**: 设计完成，待实现

---

## 概述

修复 TaskFlow 四个影响用户体验的问题：

1. **中文输入法无法使用** — 标题和描述字段在 IME 组合输入期间被 onChange 打断
2. **甘特图状态变更打乱顺序** — 修改任务状态后 refetch 导致任务列表闪烁/重排
3. **子任务日期冲突无法暂存** — 校验失败强制放弃编辑，无草稿机制
4. **维度显示规则不明确** — 周/月/季度/年等维度的起始偏移无统一规则

---

## 1. 中文输入法修复

### 根因

React 受控组件 `value={val}` + `onChange={setEditValue}` 在 IME 组合期间（compositionstart → compositionend）每次拼音按键都触发 onChange，导致 React 重渲染并中断组合过程。

### 方案

使用 `onCompositionStart` / `onCompositionEnd` 事件追踪组合状态，组合期间跳过 `setEditValue`。

### 涉及文件

- `src/components/tasks/DetailPanel.tsx` — `renderFieldEditor` 中 title（default 分支）和 description（textarea）编辑器

### 实现细节

新增 `isComposingRef`：

```tsx
const isComposingRef = useRef(false)

// 在 title/description 的 input 上：
onCompositionStart={() => { isComposingRef.current = true }}
onCompositionEnd={(e) => {
  isComposingRef.current = false
  setEditValue((e.target as HTMLInputElement).value)
}}
onChange={(e) => {
  if (!isComposingRef.current) setEditValue(e.target.value)
}}
```

---

## 2. 甘特图顺序修复

### 根因

`updateTask.mutate` 成功后调用 `invalidateQueries` 重新请求全部任务数据。在 refetch 期间，`useQuery` 可能短暂返回 `undefined` 或触发 `useMemo` 依赖链重算，导致 `visibleTasks` 重新排序/闪烁。

### 方案

**A. 乐观更新**（主要手段）：在 `useUpdateTask` 的 mutation 配置中增加 `onMutate`，在请求发出前立即更新缓存，refetch 回来后合并，消除中间状态。

**B. 显式排序兜底**（防御手段）：在 `visibleTasks` 的 `useMemo` 中，对 `flattenTasks` 结果按 `sort_order` 二次排序。

### 涉及文件

- `src/hooks/useTasks.ts` — `useUpdateTask` 增加乐观更新
- `src/components/gantt/GanttView.tsx` — `visibleTasks` 增加显式排序

### 实现细节

```tsx
// useTasks.ts — useUpdateTask
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateTask,
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: [TASKS_KEY] })
      const previous = queryClient.getQueryData<Task[]>([TASKS_KEY])
      if (previous) {
        queryClient.setQueryData<Task[]>([TASKS_KEY], (old) =>
          old?.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)) ?? []
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([TASKS_KEY], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [TASKS_KEY] })
    },
  })
}
```

```tsx
// GanttView.tsx — visibleTasks 兜底排序
const visibleTasks = useMemo(() => {
  // ... existing filter logic ...
  const result = flattenTasks(filterExpanded(roots))
  return result.sort((a, b) => a.sort_order - b.sort_order)
}, [allFlatTasks, viewportRange, expandedIds])
```

---

## 3. 子任务草稿暂存

### 根因

`commitEdit` 中日期校验失败时，仅设置 `validationError` 并 return，用户编辑内容完全丢失。

### 方案

校验失败时仍然保存用户输入（调用 `updateTask.mutate`），同时弹出 DraftToast 悬浮提示。用户可在 3.5s 内撤销回滚。

### 交互流程

```
日期校验失败
  → 调用 updateTask.mutate（保存用户输入）
  → 弹出 DraftToast（右下角滑入）
  → 3.5s 后自动消失，草稿保留
  → 或点击「撤销」→ 用旧值回滚
  → 或点击其他区域 → Toast 消失，草稿保留
```

### 新增文件

- `src/components/ui/DraftToast.tsx` — DraftToast 悬浮提示组件

### 涉及文件

- `src/components/tasks/DetailPanel.tsx` — `commitEdit` 修改校验失败分支

### DraftToast 组件规格

- 位置：右下角 fixed，`bottom-4 right-4`
- 动画：`translateX` 从 100% 滑入，300ms ease-out
- 内容：「已保存为草稿 · {冲突原因}」
- 按钮：「撤销」（红色文字）
- 超时：3.5s 后自动 dismiss
- 关闭方式：自动超时 / 点击撤销 / 点击外部区域

### 撤销逻辑

`commitEdit` 在校验失败时传入 `conflictField` 和 `oldValue` 给 DraftToast。撤销时用 `oldValue` 调用 `updateTask.mutate` 回滚。

---

## 4. 视图起始模式

### 根因

甘特图的周/月/季度/年维度使用固定天数（7/30/90/180/365），但起始偏移仅针对周维度做了 `todayOffset - 2` 的硬编码调整，无统一规则，且不可配置。

### 方案

在 `settings-slice` 中新增 `viewStartMode` 全局设置，两种模式：

| 模式 | 值 | 周 | 月 | 季度 | 年 |
|------|-----|-----|-----|------|-----|
| 对齐周期边界 | `periodStart` | 本周一 | 本月1日 | 本季首日 | 本年1月1日 |
| 从今日起算 | `fromToday` | 今日+6天 | 今日+29天 | 今日+89天 | 今日+364天 |

### 涉及文件

- `src/store/settings-slice.ts` — 新增 `viewStartMode` 字段和 setter
- `src/components/gantt/GanttView.tsx` — 滚动定位 + 工具栏切换按钮

### 实现细节

**settings-slice.ts**:

```tsx
export type ViewStartMode = 'periodStart' | 'fromToday'

const STORED_VIEW_START = (localStorage.getItem('taskflow-view-start') || 'periodStart') as ViewStartMode

export interface SettingsSlice {
  // ... existing ...
  viewStartMode: ViewStartMode
  setViewStartMode: (mode: ViewStartMode) => void
}

// in createSettingsSlice:
viewStartMode: STORED_VIEW_START,
setViewStartMode: (mode) => {
  localStorage.setItem('taskflow-view-start', mode)
  set({ viewStartMode: mode })
},
```

**GanttView.tsx** — 滚动定位辅助函数:

```tsx
function getScrollTarget(
  viewStartMode: ViewStartMode,
  dimension: Dimension,
  todayOffset: number,
  startDate: Date,
  DAY_WIDTH: number,
): number {
  const today = new Date()
  if (viewStartMode === 'fromToday') {
    return todayOffset * DAY_WIDTH
  }
  // periodStart: align to period boundary
  switch (dimension) {
    case 'week': {
      const dayOfWeek = today.getDay()
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      return (todayOffset + mondayOffset) * DAY_WIDTH
    }
    case 'month': {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      return daysBetween(startDate, firstOfMonth) * DAY_WIDTH
    }
    case 'quarter': {
      const quarterStart = Math.floor(today.getMonth() / 3) * 3
      const firstOfQuarter = new Date(today.getFullYear(), quarterStart, 1)
      return daysBetween(startDate, firstOfQuarter) * DAY_WIDTH
    }
    case 'halfyear': {
      const halfStart = today.getMonth() < 6 ? 0 : 6
      const firstOfHalf = new Date(today.getFullYear(), halfStart, 1)
      return daysBetween(startDate, firstOfHalf) * DAY_WIDTH
    }
    case 'year': {
      const firstOfYear = new Date(today.getFullYear(), 0, 1)
      return daysBetween(startDate, firstOfYear) * DAY_WIDTH
    }
  }
}
```

**GanttView.tsx** — 工具栏新增切换按钮:

```tsx
<button
  type="button"
  onClick={() => setViewStartMode(
    viewStartMode === 'periodStart' ? 'fromToday' : 'periodStart'
  )}
  className="px-3 py-1 text-[11px] font-medium text-muted-foreground border border-border rounded-full hover:bg-accent transition-colors"
  title={viewStartMode === 'periodStart' ? '当前：对齐周期边界' : '当前：从今日起算'}
>
  {viewStartMode === 'periodStart' ? '周期' : '今日'}
</button>
```

---

## 影响范围总结

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `src/components/tasks/DetailPanel.tsx` | 修改 | 1. title/description 增加 composition 事件处理；2. commitEdit 日期校验失败改为草稿保存 |
| `src/components/ui/DraftToast.tsx` | **新增** | 草稿暂存悬浮提示组件 |
| `src/hooks/useTasks.ts` | 修改 | useUpdateTask 增加乐观更新（onMutate/onError/onSettled） |
| `src/components/gantt/GanttView.tsx` | 修改 | 1. visibleTasks 显式排序；2. 视图起始模式滚动定位；3. 工具栏切换按钮 |
| `src/store/settings-slice.ts` | 修改 | 新增 viewStartMode 字段和 setter |

---

## 不变更范围

- 任务数据结构（Task interface）不修改
- 数据库 schema 不修改
- 其他视图（BoardView、CalendarView）不修改
- 现有依赖不变
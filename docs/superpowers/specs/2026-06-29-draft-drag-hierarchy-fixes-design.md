# 草稿 / 拖拽 / 层级调整 / 依赖选单修复设计文档

**日期**: 2026-06-29
**状态**: 设计完成，待实现

---

## 概述

本轮修复 5 个问题：1 个新功能（基础草稿）+ 4 个 Bug 修复。

| # | 模块 | 类型 | 涉及文件 |
|---|------|------|---------|
| 1 | 基础草稿功能 | 新功能 | DetailPanel.tsx |
| 2 | 拖拽可视化 | Bug 修复 | GanttView.tsx |
| 3 | 拖拽撤回 | Bug 修复 | GanttView.tsx |
| 4 | 层级调整 | Bug 修复 | HierarchyTree.tsx |
| 5 | 依赖选单透明 | Bug 修复 | DependencyPicker.tsx |

---

## 1. 基础草稿功能

### 当前行为

- 点击字段外部（mousedown）→ 直接 `commitEdit()` 保存
- 按 Esc → 直接丢弃编辑内容

### 改为

编辑字段值变化后，失焦或按 Esc 时弹出确认对话框：

```
┌─────────────────────────┐
│  是否保存更改？           │
│                         │
│  [放弃]  [保存为草稿]  [保存] │
└─────────────────────────┘
```

- **保存**：正常提交 mutation
- **保存为草稿**：提交 mutation + `showDraftToast`（带撤销）
- **放弃**：恢复原值，关闭编辑

### 实现

在 `DetailPanel.tsx` 中：

1. 新增 `originalValue` 状态：记录编辑开始时的原始值
2. 修改 `mousedown` 处理：编辑状态下不直接 `commitEdit()`，而是调用 `requestSave()` 判断
3. 修改 `keydown` Esc 处理：同上
4. 新增 `SaveConfirmDialog` 内联弹窗组件（或直接在 `DetailPanel` 内渲染）

```tsx
const [originalValue, setOriginalValue] = useState('')
const [showSaveConfirm, setShowSaveConfirm] = useState(false)

// startEditing 时记录原始值
const startEditing = (field: EditableField) => {
  // ...
  setOriginalValue(value)
  // ...
}

// 失焦 / Esc 时
const requestSave = () => {
  const current = editValueRef.current
  if (current !== originalValue) {
    setShowSaveConfirm(true) // 弹窗
  } else {
    setEditingField(null) // 无变化直接关闭
  }
}
```

### 涉及文件

- `src/components/tasks/DetailPanel.tsx`

---

## 2. 拖拽可视化修复

### 当前状态

上一轮已在 `GanttView.tsx` 中添加 `dragState`、CSS 类、插入指示线，但运行时未生效。

### 修复计划

在实现阶段排查根因（可能原因：HMR 未更新、虚拟列表导致 DOM 结构变化、事件冒泡被拦截），确保以下行为：

- 拖拽源行：`opacity-40` + `border-2 border-dashed border-primary`
- 目标行上方：3px 蓝色插入指示线
- 拖拽中：甘特图容器 `cursor-grabbing`

### 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 3. 拖拽撤回修复

### 当前状态

`Ctrl+Z` 处理器已写入 `GanttView.tsx` 的 `useEffect`，但未生效。

### 修复计划

在实现阶段排查根因，确保：

- 拖拽释放时快照正确保存到 `dragSnapshotRef`
- `Ctrl+Z` 正确还原 `sort_order` 和 `parent_id`
- 还原后显示 DraftToast

### 涉及文件

- `src/components/gantt/GanttView.tsx`

---

## 4. 层级调整修复

### 根因

`HierarchyTree.tsx` 中 `rootSiblings` 和 `currentSiblings` 渲染逻辑重叠：

```tsx
// 当前代码问题
{rootSiblings.map(...)}  // 渲染所有顶层任务
{currentSiblings.filter(...).map(...)}  // 又渲染一次当前任务的同级
```

当当前任务是顶层任务时，`rootSiblings` 已包含它，`currentSiblings` 再次渲染导致重复。

### 修复

简化渲染为一条完整链路，不再渲染所有同级：

```
祖先链（从根到父）→ 当前任务（高亮）→ 子任务
```

- 递归渲染：从根节点开始，逐层展开到当前任务
- 当前任务高亮显示，不可点击
- 子任务可点击切换
- 每个非当前节点 hover 显示层级调整按钮（提升/移同级）

### 涉及文件

- `src/components/tasks/HierarchyTree.tsx`

---

## 5. 依赖选单透明修复

### 根因

`DependencyPicker.tsx` 下拉使用 `bg-background`，在某些父级背景下可能透明。

### 修复

1. 下拉改为 `bg-popover`（Tailwind 内置变量，确保不透明）
2. 确保 `shadow-lg` 生效
3. 全局规范：所有弹窗/下拉统一使用 `bg-popover`

### 涉及文件

- `src/components/tasks/DependencyPicker.tsx`

---

## 影响范围总结

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `DetailPanel.tsx` | 修改 | 新增草稿确认弹窗、originalValue 状态 |
| `GanttView.tsx` | 修改 | 排查修复拖拽可视化、拖拽撤回 |
| `HierarchyTree.tsx` | 修改 | 简化渲染为链路模式 |
| `DependencyPicker.tsx` | 修改 | bg-background → bg-popover |

---

## 不变更范围

- 不新增文件
- 不修改数据库 schema
- 不修改其他视图（BoardView、CalendarView、AI 助手）
- 不修改现有 DraftToast 组件
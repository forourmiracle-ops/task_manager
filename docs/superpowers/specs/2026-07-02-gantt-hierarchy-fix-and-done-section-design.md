# 甘特图层级缩进修复 + Sidebar 已完成分区设计

**日期**: 2026-07-02
**状态**: 设计完成
**目标**: 修复甘特图层级缩进错乱，在 Sidebar 新增已完成任务自动分区

---

## 1. 问题背景

### 1.1 甘特图层级缩进错乱

根级任务（depth=0）在左侧任务列表中显示位置不一致：有子任务的缩进 0px，无子任务的缩进 18px，同一层级的任务视觉上不对齐。

**根因**: `GanttTaskPanel.tsx` 第 83 行缩进公式：

```tsx
const indent = depth * 16 + (hasChildren ? 0 : 18)
```

`hasChildren ? 0 : 18` 导致无子任务的任务额外缩进 18px，与同层级有子任务的任务错位。

### 1.2 已完成任务积压

Sidebar 任务列表中的已完成任务越积越多，虽然已有"过滤"按钮可手动隐藏，但用户希望自动分区。

---

## 2. 设计

### 2.1 层级缩进修复

**文件**: `src/components/gantt/GanttTaskPanel.tsx`

**修改**: 第 83 行从 `hasChildren ? 0 : 18` 改为 `0`

```tsx
// 修改前
const indent = depth * 16 + (hasChildren ? 0 : 18)

// 修改后
const indent = depth * 16
```

同一深度的所有任务缩进一致，视觉对齐。

### 2.2 Sidebar 已完成分区

**文件**: `src/components/layout/Sidebar.tsx`

**数据分组**:

```tsx
const activeTasks = useMemo(() => tasks.filter((t) => t.status !== 'done'), [tasks])
const doneTasks = useMemo(() => tasks.filter((t) => t.status === 'done'), [tasks])
```

**UI 布局**:

```
┌─ Sidebar ───────────────────┐
│ [+] 新建任务                 │
├─────────────────────────────┤
│ 项目A         ● 进行中      │
│ 项目B         ● 待办        │
│ 子任务1       ● 待办        │
│                             │
│ ▼ 已完成 (3)                │  ← 点击展开/收起
│   项目C        ✓ 已完成     │
│   项目D        ✓ 已完成     │
│   项目E        ✓ 已完成     │
└─────────────────────────────┘
```

**具体实现**:

- 主列表区使用 `activeTasks` 构建树结构（`buildTaskTree` + `flattenTasks`）
- 底部新增 `doneTasks` 可折叠分区，默认展开
- 标题栏: `▼ 已完成 (N)`，点击 `toggleDoneExpanded`
- 已完成任务以扁平列表渲染（不显示层级缩进，不显示展开/折叠箭头）
- 移除 `hideCompleted` 状态和"过滤"按钮
- `parentMap` 和 `childCountMap` 使用 `activeTasks` 计算

**甘特图不变**: 已完成任务在甘特图中仍正常显示条，仅 Sidebar 列表组织方式改变。

---

## 3. 改动清单

| 文件 | 改动 | 行数 |
|------|------|------|
| `GanttTaskPanel.tsx` | 缩进公式修正 | 1 行 |
| `Sidebar.tsx` | 新增已完成分区 + 移除过滤按钮 | ~30 行 |

---

## 4. 自审

- [x] 无 TBD/TODO 占位符
- [x] 甘特图修复与 Sidebar 改动互不依赖
- [x] 已完成分区不改变甘特图行为
- [x] 移除过滤按钮逻辑，避免功能冗余
- [x] 已完成任务显示为扁平列表（无层级缩进），语义清晰
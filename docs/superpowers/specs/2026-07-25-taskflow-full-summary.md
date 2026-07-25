# TaskFlow 任务管理系统 — 完整总结

## 项目概览

**TaskFlow** 是一个基于 React 19 的全栈任务管理单页应用，支持甘特图、看板、日历、AI 助手等多种视图，后端使用 Supabase（含本地存储降级方案）。

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript 6.0 |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand 5 |
| 数据请求 | TanStack React Query 5 |
| 虚拟滚动 | @tanstack/react-virtual 3 |
| 后端 | Supabase (PostgreSQL) |
| 降级存储 | 浏览器 localStorage |
| 日期 | date-fns 4 |

### 项目结构

```
src/
├── App.tsx                    # 主应用：导航栏 + 视图路由 + 弹窗容器
├── main.tsx                   # 入口
├── types/index.ts             # 全局类型定义
├── store/
│   ├── index.ts               # Zustand store 入口（组合三个 slice）
│   ├── ui-slice.ts            # UI 状态：视图、侧边栏、详情面板、创建状态
│   ├── filter-slice.ts        # 过滤状态：搜索、状态/优先级过滤
│   └── settings-slice.ts      # 设置：主题、字号、默认维度、视图起始模式
├── hooks/
│   └── useTasks.ts            # React Query hooks：useTasks/useCreateTask/useUpdateTask/useDeleteTask
├── lib/
│   ├── utils.ts               # 工具函数：cn/buildTaskTree/flattenTasks/后代收集/外部依赖分析
│   ├── supabase.ts            # Supabase 客户端
│   └── localStorage.ts        # 本地存储降级方案
└── components/
    ├── layout/
    │   └── Sidebar.tsx        # 侧边栏任务列表（树形结构 + 已完成分区 + 快捷完成）
    ├── gantt/
    │   ├── GanttView.tsx      # 甘特图主视图（编排所有子组件）
    │   ├── GanttTaskPanel.tsx # 甘特图左侧任务面板（虚拟滚动 + 拖拽排序 + 快捷完成）
    │   ├── GanttTaskRows.tsx  # 甘特图条渲染
    │   ├── GanttDayHeaders.tsx
    │   ├── GanttMonthHeaders.tsx
    │   ├── GanttToolbar.tsx
    │   ├── GanttErrorBoundary.tsx
    │   └── hooks/
    │       ├── useGanttData.ts    # 甘特图数据：flatTasks/parentMap/childCountMap/日期范围
    │       ├── useGanttScroll.ts  # 滚动同步
    │       ├── useGanttViewport.ts# 视口计算
    │       └── useGanttLayout.ts  # 布局计算
    ├── tasks/
    │   ├── DetailPanel.tsx    # 任务详情面板（行内编辑 + 评论 + 依赖 + 层级树）
    │   └── CreateTaskDialog.tsx
    ├── ui/
    │   ├── ConfirmDialog.tsx  # 三按钮确认弹窗
    │   ├── DraftToast.tsx     # 保存草稿提示
    │   ├── ImportDialog.tsx
    │   └── CheatSheet.tsx
    ├── board/BoardView.tsx
    ├── calendar/CalendarView.tsx
    ├── ai/AIAssistantView.tsx
    └── settings/SettingsView.tsx
```

---

## 核心类型定义

```typescript
// src/types/index.ts
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
type CycleType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
type ViewType = 'gantt' | 'board' | 'calendar' | 'ai' | 'settings'

interface Task {
  id: string
  parent_id: string | null      // 父任务ID（null=根任务）
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
  depends_on: string[]           // 依赖的任务ID数组
  tags: string[]
  sort_order: number             // 排序权重
  created_at: string
  updated_at: string
  children?: Task[]              // 客户端计算：树形子任务
  depth?: number                 // 客户端计算：层级深度
}

interface CycleConfig {
  weekday?: number
  monthDay?: number
  interval?: number
  customCron?: string
}
```

---

## 状态管理 (Zustand)

三个独立的 slice 组合成一个 store：

| Slice | 状态字段 |
|-------|---------|
| **UISlice** | `currentView`, `selectedTaskId`, `sidebarOpen`, `detailPanelOpen`, `isCreating`, `creatingParentId`, `importDialogOpen` |
| **FilterSlice** | `searchQuery`, `statusFilter`, `priorityFilter` |
| **SettingsSlice** | `theme` (light/dark/eye-care), `fontSize` (1-8), `defaultDimension` (auto/week/month/quarter/halfyear/year), `viewStartMode` (periodStart/fromToday) |

---

## 数据层 (React Query + Supabase)

```typescript
// src/hooks/useTasks.ts

// 查询：useTasks() — 返回 Task[]，staleTime: Infinity（手动失效）
// 创建：useCreateTask() — 成功后 invalidate tasks
// 更新：useUpdateTask() — 乐观更新（onMutate 直接修改缓存，失败回滚）
// 删除：useDeleteTask() — 含 confirm 确认对话框

// 所有操作优先使用 Supabase，失败时降级到 localStorage
```

---

## 核心功能实现

### 1. 任务树结构

```typescript
// src/lib/utils.ts

// buildTaskTree(tasks): 将扁平任务列表转为树形结构
//   - 使用 Map 建立 ID→Task 映射
//   - 根据 parent_id 挂载子节点到 children 数组
//   - 计算 depth 字段（最大深度 MAX_DEPTH=4）
//   - 根节点按 sort_order 排序
//   - 超过深度 4 的子任务不挂载

// flattenTasks(tasks): 将树形结构展开为扁平列表（DFS）
```

### 2. 侧边栏 (Sidebar.tsx)

**任务分组**:
- `activeTasks`: `status !== 'done'` → 构建树形结构
- `doneTasks`: `status === 'done'` → 扁平列表，可折叠「已完成 (N)」分区

**搜索**: 150ms 防抖，同时过滤活跃任务和已完成任务

**交互**:
- 点击选中任务
- Hover 显示「添加子任务」按钮（深度 < 3 时）
- Hover 显示「快捷完成」勾选按钮（已完成任务不显示）
- 展开/折叠子任务

**任务行结构** (`TaskNode`):
```
[paddingLeft: 10 + depth*14]
  ├── 展开/折叠按钮 (16px) 或 占位点
  ├── 状态指示点 (彩色圆点)
  ├── 标题
  ├── 进度百分比
  ├── [快捷完成按钮] (hover显示)
  └── [添加子任务按钮] (hover显示)
```

### 3. 甘特图 (GanttView + 子组件)

**数据流**:
```
useTasks() → useGanttData() → useGanttViewport() → useGanttLayout()
  ↓              ↓                    ↓                    ↓
 tasks      allFlatTasks        visibleTasks        taskBarStyle
            parentMap            visibleDayRange     todayPosition
            childCountMap        viewportTasks       scrollTarget
            taskDateRange
```

**`useGanttData`**: 过滤出有日期的任务，构建 `parentMap`、`childCountMap`、`hasChildrenMap`，计算 10 年时间范围

**`GanttTaskPanel`** (左侧任务面板):
- 使用 `@tanstack/react-virtual` 虚拟滚动
- 支持拖拽排序（HTML5 Drag & Drop）
- 子任务有树形连接线（CSS border-left）
- 显示优先级标记（彩色圆点）、状态指示、进度
- **标记缩进**: `indent = depth * 16`（统一同层级对齐）
- **快捷完成**: hover 显示勾选按钮，与侧边栏逻辑一致

**`GanttTaskRows`** (右侧甘特图条):
- 根据 `start_date`/`due_date` 渲染任务条
- 选中高亮、斑马纹背景
- 拖拽排序支持

### 4. 快捷完成 + 父子联动

**触发**: 点击行尾 hover 显示的勾选按钮

**决策树**:
```
点击快捷完成
  ├── 无未完成子任务 → 直接完成（无弹窗）
  └── 有未完成子任务 → 三按钮弹窗
        ├── [同时完成所有子任务] → 批量完成父 + 所有后代
        ├── [仅完成此任务] → 仅完成父任务
        └── [取消] → 不操作
```

**后代收集**: 递归遍历 `children` 树（侧边栏）或通过 `parent_id` 过滤（甘特图），收集所有 `status !== 'done'` 的后代

**外部依赖检测**:
1. 收集父任务的所有后代 ID 集合
2. 遍历每个阻塞子任务的 `depends_on` 数组
3. 排除已完成的依赖（不构成阻塞）
4. 检查依赖 ID 是否在后代集合内 → 不在则为"外部依赖"

**弹窗文案**:
- 无阻塞: `"该任务有 N 个未完成子任务。是否同时完成所有子任务？"`
- 有阻塞: `"该任务有 N 个未完成子任务，其中 M 个处于阻塞状态（K 个依赖外部任务）。是否同时完成所有子任务？"`

**批量完成**: 父任务先完成，后代逐个 `updateTask.mutate`，每个独立错误处理，不因一个失败而回滚已成功的

### 5. ConfirmDialog 组件

```typescript
// src/components/ui/ConfirmDialog.tsx
interface ConfirmDialogProps {
  open: boolean
  message: string
  confirmLabel?: string     // 默认 "确认"
  partialLabel?: string     // 默认 "仅完成此任务"
  cancelLabel?: string      // 默认 "取消"
  onConfirm: () => void     // 主操作
  onPartial: () => void     // 部分操作
  onCancel: () => void      // 取消
}
```
- 绝对定位覆盖父容器，`bg-background/80 backdrop-blur-sm` 半透明背景
- 三个按钮纵向排列，主按钮 `bg-primary` 高亮

### 6. 任务详情面板 (DetailPanel.tsx)

- 行内编辑：点击字段进入编辑模式，失焦/回车保存
- 支持编辑：标题、描述、状态、优先级、开始/截止日期、进度、预估工时、标签、依赖
- 评论系统、依赖选择器、层级树展示
- 删除任务（含 `confirm()` 确认）
- 保存确认弹窗（防止误关闭丢失编辑）

### 7. 视图切换

5 个视图（懒加载）:
- **甘特图** (gantt): 时间线视图，默认视图
- **看板** (board): 按状态分列
- **日历** (calendar): 日历视图
- **AI 助手** (ai): AI 对话
- **设置** (settings): 主题/字号/默认维度

移动端底部导航栏（`md:hidden`），桌面端顶部导航栏。

---

## 工具函数汇总

```typescript
// src/lib/utils.ts
cn(...inputs)                          // 类名合并
buildTaskTree(tasks)                   // 扁平→树形
flattenTasks(tasks)                    // 树形→扁平
formatDate(date)                       // 日期格式化
STATUS_LABELS / PRIORITY_LABELS        // 状态/优先级标签映射
STATUS_COLORS / PRIORITY_COLORS        // 状态/优先级颜色映射

// 后代收集（树形结构，用于 Sidebar）
collectUnfinishedDescendants(task)     // 收集所有未完成后代
collectAllDescendantIds(task)          // 收集所有后代 ID（含已完成）
analyzeBlockedDescendants(task, ...)   // 分析阻塞后代的内部/外部依赖

// 后代收集（扁平结构，用于 Gantt）
collectDescendantIdsFromFlat(id, tasks)       // 从扁平列表收集后代 ID
collectUnfinishedDescendantsFromFlat(id, tasks) // 从扁平列表收集未完成后代
```

---

## 边界情况处理

1. **已完成依赖**: 判断外部依赖时排除 `status === 'done'` 的依赖
2. **循环依赖**: 不做特殊处理，会被标记为"外部依赖"在弹窗中展示
3. **空子任务**: 所有子任务已完成时，快捷完成直接完成父任务
4. **深度嵌套**: 递归收集后代，不受 MAX_DEPTH=4 限制
5. **并发安全**: 批量完成顺序执行，每个独立错误处理
6. **离线降级**: Supabase 不可用时自动使用 localStorage
7. **乐观更新**: `useUpdateTask` 使用 onMutate 立即更新缓存，失败回滚

---

## 最近改动记录

| 日期 | 提交 | 内容 |
|------|------|------|
| 2026-07-25 | `05b24ae` | 快捷完成按钮 + 父子联动 + 标记偏移修复 |
| 2026-07-02 | `5326fe4` | Sidebar 新增已完成分区，自动归集已完成任务 |
| 更早 | - | 甘特图虚拟滚动、拖拽排序、侧边栏搜索等 |
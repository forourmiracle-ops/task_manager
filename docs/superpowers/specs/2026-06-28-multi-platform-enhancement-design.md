# TaskFlow 多平台化改造 — 综合设计文档

## 概述

基于 Gemini 对该软件的三维度分析（产品功能、技术架构、AI智能），精选4个关键项进行改造，使其成为可面向多平台应用的生产级软件。

## 模块 1：环境配置简化

### 现状
只有一个 `.env` 和 `.env.example`，无环境区分，且用户反馈多环境独立配置 API Key 过于繁琐。

### 方案
保持简单的单文件配置，依赖部署平台（Vercel/Netlify/Railway）的环境变量面板管理多环境。

**改动**：
- 优化 `.env.example`，添加清晰的注释说明每个变量用途和必填/可选
- 不引入多文件环境配置，避免用户困惑

**文件变更**：`.env.example`

---

## 模块 2：Store 拆分（Zustand Slices）

### 现状
所有全局状态堆在 `src/store/index.ts` 一个文件中，任何状态变更都可能触发无关组件重渲染。

### 方案
按职责拆为 3 个 slice，Zustand 原生支持 `create` 的 slice pattern：

```
src/store/
├── index.ts          # 组合导出 useAppStore
├── ui-slice.ts       # 导航、侧边栏、详情面板、创建弹窗
├── filter-slice.ts   # 搜索、状态/优先级筛选
└── settings-slice.ts # 主题、字体、默认维度
```

**拆分逻辑**：
| Slice | 状态 | 主要消费者 |
|-------|------|-----------|
| `ui-slice` | `currentView`, `selectedTaskId`, `sidebarOpen`, `detailPanelOpen`, `isCreating`, `creatingParentId` | 导航栏、详情面板、任务列表 |
| `filter-slice` | `searchQuery`, `statusFilter`, `priorityFilter` | 搜索框、筛选栏、任务列表 |
| `settings-slice` | `theme`, `fontSize`, `defaultDimension` | 全局（theme 通过 CSS 变量生效） |

**文件变更**：
- `src/store/index.ts` — 组合导出
- `src/store/ui-slice.ts` — 新增
- `src/store/filter-slice.ts` — 新增
- `src/store/settings-slice.ts` — 新增

---

## 模块 3：评论系统 UI

### 现状
数据库已有 `comments` 表（含 `id`, `task_id`, `content`, `author_id`, `created_at`），Supabase Realtime 已启用，但前端完全没有 UI。

### 方案
在详情面板底部新增评论区，包含评论列表和输入框。

**组件结构**：
```
DetailPanel
├── 任务字段编辑区（现有）
├── 任务依赖关系（模块 4）
└── CommentSection（新增）
    ├── 评论列表
    │   ├── 每条：头像占位 + 作者名 + 时间 + 内容
    │   └── 空状态："暂无评论"
    └── 输入区
        ├── textarea（自动撑高，Enter 发送，Shift+Enter 换行）
        └── 发送按钮
```

**数据流**：
- `useComments(taskId)` — 使用 `useQuery` 按 `task_id` 拉取评论列表，`staleTime: 30s`
- `useMutation` 提交新评论，乐观更新列表
- Supabase Realtime 订阅（可选，后续迭代）

**文件变更**：
- `src/hooks/useComments.ts` — 新增
- `src/components/tasks/CommentSection.tsx` — 新增
- `src/components/tasks/DetailPanel.tsx` — 引入 CommentSection

---

## 模块 4：任务依赖关系

### 现状
数据库已有 `depends_on UUID[]` 字段，前端无任何 UI。

### 4a. 详情面板中设置依赖

在 DetailPanel 中新增"依赖关系"区域：

```
┌─ 依赖关系 ────────────────────────────┐
│ 前置任务：                              │
│ [██████████████████ 选择任务 ▼]  [移除]  │
│ 被依赖：                                │
│  · 任务A (由当前任务阻塞)                │
│  · 任务B (由当前任务阻塞)                │
└────────────────────────────────────────┘
```

- 下拉搜索选择已有任务作为前置依赖（排除自己、子任务、已有依赖）
- 自动显示哪些任务依赖当前任务（反向查找 `tasks.filter(t => t.depends_on.includes(taskId))`）
- 限制：不能选择自己或子任务作为依赖，不能形成循环依赖

### 4b. 甘特图中可视化依赖

在甘特图中，有依赖关系的任务之间绘制 SVG 连线：

```
前置任务 ████████████
                    \
                     → 后续任务 ████████
```

- 从前置任务的结束日期右边缘 → 后续任务的开始日期左边缘画一条带箭头的 SVG 路径
- 仅当两个任务都在当前甘特图可视范围内时绘制
- 连线颜色：半透明主题色，hover 时高亮显示两端任务

**文件变更**：
- `src/components/tasks/DetailPanel.tsx` — 新增依赖关系编辑区
- `src/components/tasks/DependencyPicker.tsx` — 新增：任务选择搜索组件
- `src/components/gantt/GanttView.tsx` — 新增依赖连线 SVG overlay
- `src/hooks/useTasks.ts` — 新增依赖更新方法（已支持 `depends_on` 字段）

---

## 影响范围汇总

| 模块 | 新增文件 | 修改文件 | 风险 |
|------|---------|---------|------|
| 环境配置 | 0 | 1 | 低 |
| Store 拆分 | 3 | 1 | 中 — 需更新所有 import |
| 评论系统 | 2 | 1 | 低 |
| 任务依赖 | 1 | 3 | 中 — 甘特图渲染逻辑 |

## 实施顺序

1. 环境配置（独立，先行）
2. Store 拆分（基础，影响面广，尽早做）
3. 评论系统（独立模块）
4. 任务依赖（依赖评论系统完成后的 DetailPanel 结构）
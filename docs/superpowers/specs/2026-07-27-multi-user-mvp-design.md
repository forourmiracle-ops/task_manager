# TaskFlow 多用户 MVP 技术设计文档

**日期**: 2026-07-27  
**状态**: 已批准，待实施  
**目标**: 多用户各自编辑任务日志 + 电脑/手机双端 + 跨设备联网同步 + 软件封装

---

## 1. 项目概述

### 1.1 定位

TaskFlow 是一个多视图任务管理系统，支持甘特图、看板、日历、列表、表格、画廊六种视图。当前为单用户本地模式，本项目目标是将它升级为**多用户联网协同**的 PWA 应用。

### 1.2 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 19.2 |
| 构建工具 | Vite | 8.1 |
| 类型系统 | TypeScript | 6.0 |
| 状态管理 | Zustand + persist | 5.0 |
| 服务端查询 | TanStack React Query | 5.101 |
| 样式方案 | Tailwind CSS | 4.3 |
| 富文本编辑器 | TipTap | 3.29 |
| 后端服务 | Supabase (PostgreSQL + Auth + Realtime) | js 2.108 |
| 离线存储 | IndexedDB (idb) + localStorage | 8.0 |
| 日期处理 | date-fns | 4.4 |
| 图标库 | react-icons | 5.6 |

---

## 2. 系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────┐
│ 用户 A (电脑)         用户 A (手机)     用户 B (电脑) │
│    │                      │                │       │
│    ▼                      ▼                ▼       │
│ ┌──────────────────────────────────────────────┐    │
│ │           Supabase (Backend)                  │    │
│ │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │    │
│ │  │  Auth   │  │  Realtime │  │  Database   │  │    │
│ │  │ (邮箱)  │  │  (变更)   │  │ (RLS 隔离)  │  │    │
│ │  └─────────┘  └──────────┘  └────────────┘  │    │
│ └──────────────────────────────────────────────┘    │
│                      │                              │
│                      ▼                              │
│ ┌──────────────────────────────────────────────┐    │
│ │           TaskFlow (PWA)                      │    │
│ │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │    │
│ │  │ 登录/注册 │  │  任务 CRUD │  │ 离线降级    │  │    │
│ │  │ (AuthView)│  │ (user_id) │  │ (IndexedDB) │  │    │
│ │  └──────────┘  └──────────┘  └────────────┘  │    │
│ │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │    │
│ │  │ 实时同步  │  │ 冲突检测  │  │ 移动端适配  │  │    │
│ │  │(Realtime) │  │ (Banner)  │  │(Responsive) │  │    │
│ │  └──────────┘  └──────────┘  └────────────┘  │    │
│ └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **用户数据隔离**：所有数据按 `user_id` 隔离，利用 Supabase RLS 双重保障
2. **实时同步**：Supabase Realtime 推送变更，设备间自动同步
3. **冲突友好**：非阻塞横幅提示，不打断用户操作
4. **渐进式增强**：移动端降级策略，核心功能优先
5. **离线可用**：IndexedDB 降级 → localStorage 兜底，联网后自动同步

### 2.3 组件树

```
App
├── RemoteUpdateBanner          (编辑冲突横幅)
├── Header (顶部导航)
│   ├── SidebarToggle
│   ├── Logo + Brand
│   ├── ViewNav (项目 / AI 助手 / 设置)
│   └── QuickCreateButton
├── Main Content
│   ├── Sidebar                  (左侧任务树)
│   ├── ProjectView              (视图容器)
│   │   ├── ViewTabBar           (甘特图/看板/日历/列表/表格/画廊)
│   │   ├── GanttView            (lazy)
│   │   ├── BoardView            (lazy)
│   │   ├── CalendarView         (lazy)
│   │   ├── ListView             (lazy)
│   │   ├── TableView            (lazy)
│   │   └── GalleryView          (lazy)
│   ├── AIAssistantView          (lazy)
│   └── SettingsView             (lazy)
├── DetailPanel                  (任务详情侧面板)
│   ├── FieldEditor (title, description, status, priority, dates, tags, etc.)
│   ├── RichTextEditor (TipTap, lazy)
│   ├── DependencyPicker
│   ├── HierarchyTree
│   ├── CommentSection
│   └── SaveAsTemplate
├── MobileBottomNav              (移动端底部导航)
├── CreateTaskDialog
├── DraftToastContainer
├── CheatSheet                   (快捷键速查)
└── ImportDialog
```

### 2.4 路由 / 视图切换

应用使用 Zustand 管理 `currentView` 状态，无传统路由库。三个主视图：

| 视图 | 标识 | 功能 |
|------|------|------|
| `project` | 项目 | 六种任务视图 + 详情面板 |
| `ai` | AI 助手 | DeepSeek 对话界面 |
| `settings` | 设置 | 主题/字体/API Key/模版管理 |

所有视图通过 `React.lazy` + `Suspense` 实现代码分割，按需加载。

---

## 3. 数据层

### 3.1 数据库表结构

#### 3.1.1 `tasks` 表（核心表）

```sql
CREATE TABLE tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id       uuid REFERENCES tasks(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text DEFAULT '',
  status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','blocked')),
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  start_date      date,
  due_date        date,
  progress_percent integer DEFAULT 0,
  estimated_hours numeric,
  actual_hours    numeric,
  cycle_type      text DEFAULT 'none' CHECK (cycle_type IN ('none','daily','weekly','monthly','custom')),
  cycle_config    jsonb,
  sprint_id       uuid,
  depends_on      uuid[] DEFAULT '{}',
  tags            text[] DEFAULT '{}',
  sort_order      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

**当前 RLS 状态**: `USING(true)` — 所有用户可读写所有数据（**P0 安全风险**）

#### 3.1.2 `templates` 表（已有 RLS）

```sql
CREATE TABLE templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text DEFAULT '',
  type        text NOT NULL CHECK (type IN ('project','task','recurring')),
  scope       text NOT NULL DEFAULT 'custom' CHECK (scope IN ('builtin','custom')),
  icon        text DEFAULT '📋',
  content     jsonb NOT NULL,
  is_public   boolean DEFAULT false,
  user_id     uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

**已有 RLS 策略**（本项目最佳实践）：
- `Builtin templates visible to all` — `scope = 'builtin'` 对所有认证用户可见
- `Custom templates visible to owner` — `scope = 'custom' AND user_id = auth.uid()`

#### 3.1.3 `recurring_tasks` 表（已有 RLS）

```sql
CREATE TABLE recurring_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid REFERENCES templates(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  frequency      text NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  interval       int NOT NULL DEFAULT 1,
  days_of_week   int[] DEFAULT '{}',
  next_run       timestamptz NOT NULL,
  last_run       timestamptz,
  enabled        boolean DEFAULT true,
  user_id        uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);
```

**已有 RLS 策略**：按 `user_id = auth.uid()` 隔离 CRUD。

#### 3.1.4 `comments` 表

```sql
CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid REFERENCES tasks(id) ON DELETE CASCADE,
  content    text NOT NULL,
  author_id  uuid,
  created_at timestamptz DEFAULT now()
);
```

**当前 RLS 状态**: `USING(true)` — 无用户隔离（**P0 安全风险**）

### 3.2 数据库函数

#### 3.2.1 `fn_claim_recurring_task`（原子锁）

```sql
CREATE OR REPLACE FUNCTION fn_claim_recurring_task(p_task_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _rec           recurring_tasks%ROWTYPE;
  _template      templates%ROWTYPE;
  _new_task_id   uuid;
BEGIN
  -- SELECT ... FOR UPDATE 行锁防止多设备并发重复创建
  SELECT * INTO _rec FROM recurring_tasks
  WHERE id = p_task_id AND enabled = true AND next_run <= now() AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- 从模板创建任务
  SELECT * INTO _template FROM templates WHERE id = _rec.template_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  INSERT INTO tasks (title, description, status, priority, estimated_hours, user_id, parent_id)
  VALUES (
    _template.content->>'title',
    _template.content->>'description',
    COALESCE(_template.content->'defaultValues'->>'status', 'todo'),
    COALESCE(_template.content->'defaultValues'->>'priority', 'medium'),
    COALESCE((_template.content->'defaultValues'->>'estimated_hours')::numeric, NULL),
    _rec.user_id,
    _rec.parent_task_id
  ) RETURNING id INTO _new_task_id;

  -- 防积压：MAX(next_run + interval, now()) 防止批量生成
  UPDATE recurring_tasks
  SET next_run = GREATEST(next_run + (_rec.interval || ' ' || _rec.frequency)::interval, now()),
      last_run = now()
  WHERE id = p_task_id;

  RETURN _new_task_id;
END;
$$;
```

#### 3.2.2 `batch_complete_tasks`

```sql
CREATE OR REPLACE FUNCTION batch_complete_tasks(p_task_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _task_id uuid;
BEGIN
  FOREACH _task_id IN ARRAY p_task_ids LOOP
    UPDATE tasks SET status = 'done', progress_percent = 100, updated_at = NOW()
    WHERE id = _task_id AND user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Task % not found or not owned by current user', _task_id; END IF;
  END LOOP;
END;
$$;
```

#### 3.2.3 `check_dependency_cycle`

```sql
CREATE OR REPLACE FUNCTION check_dependency_cycle(p_task_id uuid, p_candidate_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _cycle_found boolean := false;
BEGIN
  WITH RECURSIVE dep_chain AS (
    SELECT id, depends_on FROM tasks WHERE p_task_id = ANY(depends_on)
    UNION ALL
    SELECT t.id, t.depends_on FROM tasks t
    INNER JOIN dep_chain dc ON dc.id = ANY(t.depends_on)
  )
  SELECT EXISTS (SELECT 1 FROM dep_chain WHERE id = p_candidate_id) INTO _cycle_found;
  RETURN _cycle_found;
END;
$$;
```

### 3.3 TypeScript 类型定义

位于 `src/types/index.ts`：

```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type CycleType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'

export interface Task {
  id: string
  parent_id: string | null
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
  depends_on: string[]
  tags: string[]
  sort_order: number
  created_at: string
  updated_at: string
  children?: Task[]       // 客户端计算
  depth?: number           // 客户端计算
}
// 注意：当前 Task 接口缺少 user_id 字段 — P0 待添加
```

---

## 4. 状态管理

### 4.1 Zustand Store 架构

```
useAppStore (Zustand + persist)
├── UISlice          (src/store/ui-slice.ts)
│   ├── currentView: ViewType
│   ├── projectViewTab: ProjectViewTab
│   ├── selectedTaskId: string | null
│   ├── sidebarOpen: boolean
│   ├── detailPanelOpen: boolean
│   ├── isCreating / creatingParentId
│   └── importDialogOpen
├── FilterSlice      (src/store/filter-slice.ts)
│   ├── searchQuery: string
│   ├── statusFilter: string | null
│   └── priorityFilter: string | null
├── SettingsSlice    (src/store/settings-slice.ts)
│   ├── theme: 'light' | 'dark' | 'eye-care'
│   ├── fontSize: number (1-8)
│   ├── density: 'comfortable' | 'compact'
│   ├── defaultDimension: 'auto' | Dimension
│   ├── viewStartMode: 'periodStart' | 'fromToday'
│   ├── deepseekApiKey: string
│   └── expandTemplateLib: boolean
└── AISlice          (src/store/ai-slice.ts)
    ├── messages: Message[]
    ├── isLoading: boolean
    ├── addMessage / updateLastAssistant / setLoading / clearMessages
```

### 4.2 持久化策略

```typescript
// src/store/index.ts
export const useAppStore = create<AppState>()(
  persist(
    (...args) => ({
      ...createAISlice(...args),
      ...createUISlice(...args),
      ...createFilterSlice(...args),
      ...createSettingsSlice(...args),
    }),
    {
      name: 'taskflow-ai-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        messages: state.messages,  // 仅持久化 AI 聊天记录
      }),
      version: 1,
    }
  )
)
```

**持久化说明**：
- AI 聊天记录：通过 Zustand `persist` 中间件写入 localStorage，切换视图不丢失
- 主题/字体/API Key：各 slice 模块加载时自行从 localStorage 恢复
- 项目视图 Tab：`ui-slice.ts` 从 localStorage 读取 `taskflow-project-view-tab`
- 任务数据：通过 React Query 缓存管理，不持久化到 store

### 4.3 待新增字段

`UISlice` 需要新增 `editingTaskId` 用于精确的编辑冲突检测：

```typescript
editingTaskId: string | null
setEditingTaskId: (id: string | null) => void
```

---

## 5. 数据流

### 5.1 React Query 数据获取

```
useTasks() → React Query → fetchTasks()
                              ├── Supabase: supabase.from('tasks').select('*').order('sort_order')
                              └── 降级: localDB.fetchTasks() → IndexedDB → localStorage
```

关键配置：
```typescript
// src/hooks/useTasks.ts
export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: fetchTasks,
    staleTime: Infinity,       // 当前: 数据永不过期（待改为 30_000）
    gcTime: Infinity,
    refetchOnWindowFocus: false, // 当前: 不自动刷新（待改为 true）
    retry: 1,
  })
}
```

### 5.2 乐观更新流程

```
用户编辑任务 → useUpdateTask().mutate()
  → onMutate: 乐观更新本地缓存 (optimistic update)
  → mutationFn: updateTask() → Supabase UPDATE
  → onError: 回滚到 previous 缓存
  → onSettled: invalidateQueries 重新获取最新数据
```

### 5.3 Supabase Realtime 订阅

```typescript
// src/hooks/useTasks.ts
export function useRealtimeSubscription(
  onRemoteChange?: (taskId: string, taskTitle: string) => void,
) {
  useEffect(() => {
    if (useLocal) return
    const channel = supabase
      .channel('tasks-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          const changed = payload.new as { id: string; title: string } | null
          if (onRemoteChange && changed) {
            onRemoteChange(changed.id, changed.title) // 触发冲突检测
          } else {
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient, useLocal, onRemoteChange])
}
```

### 5.4 编辑冲突检测流程

```
App.tsx
  ├── useRemoteUpdateConflict() → bannerUpdate / setEditingTask / handleRemoteChange
  ├── useRealtimeSubscription(handleRemoteChange)
  └── useEffect: detailPanelOpen ? selectedTaskId : null → setEditingTask()

RemoteUpdateBanner
  ├── 检测到编辑中任务被远程修改 → 缓存 pendingRef
  ├── 用户退出编辑 → 显示横幅
  ├── "查看最新" → invalidateQueries + 隐藏横幅
  └── "忽略" → 隐藏横幅，保持本地编辑内容
```

**当前缺陷**：`App.tsx:87` 用 `detailPanelOpen ? selectedTaskId : null` 判断编辑态，但打开详情面板不等于正在编辑。需要改为从 `DetailPanel` 的 `editingField` 状态通知 `editingTaskId`。

---

## 6. 离线支持

### 6.1 降级链路

```
Supabase (在线) → IndexedDB (离线主存储) → localStorage (兜底)
```

### 6.2 判断逻辑

```typescript
// src/lib/localStorage.ts
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  return !!(url && key && url !== 'your_supabase_url' && key !== 'your_supabase_anon_key')
}

const useLocal = !isSupabaseConfigured()
```

### 6.3 IndexedDB 结构

```typescript
// src/lib/indexedDB.ts
const DB_NAME = 'taskflow'
const DB_VERSION = 1
const STORE_NAME = 'tasks'

// 索引: parent_id, sort_order, status
```

### 6.4 降级模式

每个 CRUD 操作遵循 `try Supabase → catch → localDB` 模式：

```typescript
async function fetchTasks(): Promise<Task[]> {
  if (useLocal) return localDB.fetchTasks()
  try {
    const { data, error } = await supabase.from('tasks').select('*').order('sort_order')
    if (error) throw error
    return (data as Task[]) || []
  } catch (err) {
    console.warn('Supabase fetch failed, using local storage:', err)
    return localDB.fetchTasks()  // IndexedDB → localStorage
  }
}
```

---

## 7. AI 助手集成

### 7.1 架构

```
AIAssistantView
  ├── 消息存储: Zustand AISlice (persist → localStorage)
  ├── API: DeepSeek v4-flash (streaming)
  ├── 上下文: 自动注入当前任务列表
  └── 流式渲染: ReadableStream → updateLastAssistant()
```

### 7.2 消息持久化

```typescript
// src/store/ai-slice.ts
export const createAISlice: StateCreator<AISlice, [], [], AISlice> = (set) => ({
  messages: [],
  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages.slice(-49),  // FIFO: 最多保留 50 条
        { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
      ],
    })),
  // ...
})
```

### 7.3 API 调用

```typescript
// 流式请求 DeepSeek API
const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'deepseek-v4-flash',
    messages: [
      { role: 'system', content: `当前日期: ${date}。当前任务: ${JSON.stringify(tasks)}...` },
      ...currentMessages.map(m => ({ role: m.role, content: m.content })),
    ],
    stream: true,
  }),
  signal: controller.signal,  // 支持中止
})
```

### 7.4 安全

- API Key 存储在 localStorage（`taskflow-deepseek-key`），仅在客户端使用
- 支持中止请求（AbortController）
- 未配置 API Key 时显示提示，不发起请求

---

## 8. 现状审计

### 8.1 已具备的能力

| 能力 | 实现位置 | 状态 |
|------|----------|------|
| 任务 CRUD + 乐观更新 | `useTasks.ts` | 完整 |
| 甘特图/看板/日历/列表/表格/画廊视图 | `ProjectView.tsx` + 子视图 | 完整 |
| 依赖关系管理 + 循环检测 | `DependencyPicker.tsx` + `check_dependency_cycle` | 完整 |
| 父子任务联动完成 | `Sidebar.tsx` + `batch_complete_tasks` | 完整 |
| AI 助手（DeepSeek 流式） | `AIAssistantView.tsx` | 完整 |
| AI 聊天持久化（FIFO 50条） | `ai-slice.ts` + `persist` | 完整 |
| 模板系统（内置 + 自定义） | `templates` 表 + `useTemplates` | 完整 |
| 重复任务 RPC 原子锁 | `fn_claim_recurring_task` | 完整 |
| 模板表 RLS 用户隔离 | `create_templates.sql` | 完整 |
| 实时订阅基础设施 | `useRealtimeSubscription` + `supabase.channel()` | 完整 |
| 编辑冲突检测横幅 | `RemoteUpdateBanner` + `useRemoteUpdateConflict` | 已实现 |
| 编辑态跟踪 | `App.tsx:74-92` | 已接入（但不够精确） |
| 富文本编辑器（TipTap） | `RichTextEditor.tsx` (lazy) | 完整 |
| 移动端底部导航栏 | `App.tsx:188-204` | 基本可用 |
| 侧边栏移动端隐藏 | `Sidebar.tsx` `md:hidden` | 基本可用 |
| IndexedDB 降级存储 | `localStorage.ts` + `indexedDB.ts` | 完整 |
| 键盘快捷键 | `useKeyboardShortcuts.ts` | 完整 |
| 代码分割（lazy + Suspense） | `App.tsx` / `ProjectView.tsx` | 完整 |

### 8.2 缺失的关键能力

| 缺失项 | 影响 | 严重度 |
|--------|------|--------|
| **tasks 表无 `user_id` 列** | 无法区分数据归属 | P0 |
| **tasks 表 RLS 全开** | 任何用户可读写所有数据 | P0 |
| **comments 表无 `user_id` 列** | 评论数据无归属 | P0 |
| **comments 表 RLS 全开** | 任何用户可读写所有评论 | P0 |
| **无登录/注册页面** | 无法创建用户身份 | P0 |
| **所有 CRUD 查询无 user_id 过滤** | 即使加了列也无法隔离 | P0 |
| **DetailPanel 未通知 `editingTaskId`** | 编辑冲突检测横幅不会因编辑触发 | P1 |
| **更新操作无乐观锁（version 列）** | 后写覆盖前写 | P1 |
| **`staleTime: Infinity` + `refetchOnWindowFocus: false`** | 跨设备不会自动同步 | P1 |
| **甘特图无移动端降级** | 手机端甘特图不可用 | P2 |
| **详情面板无移动端全屏** | 340px 面板挤占小屏 | P2 |
| **无 PWA 配置** | 无法"添加到主屏幕" | P3 |
| **无离线提示** | 离线时静默降级，用户无感知 | P3 |

### 8.3 关键发现：templates 表已有正确的 RLS 模式

`create_templates.sql` 中的 RLS 策略是项目中的**最佳实践范例**，tasks 和 comments 表应参照此模式重构：

```sql
-- 内置模板对所有用户可见
CREATE POLICY "Builtin templates visible to all"
  ON templates FOR SELECT
  USING (scope = 'builtin');

-- 自定义模板仅所有者可见
CREATE POLICY "Custom templates visible to owner"
  ON templates FOR SELECT
  USING (scope = 'custom' AND user_id = auth.uid());
```

---

## 9. 实施计划

### 9.1 阶段概览

| 阶段 | 名称 | 优先级 | 依赖 |
|------|------|--------|------|
| 1 | 多用户地基 | P0 | 无 |
| 2 | 跨设备同步 | P1 | 阶段 1 |
| 3 | 移动端适配 | P2 | 阶段 2 |
| 4 | PWA 封装发布 | P3 | 阶段 3 |

```
阶段 1（多用户地基）── 必须先完成，无依赖
  │
  ├─→ 阶段 2（跨设备同步）── 依赖阶段 1 的 user_id
  │     │
  │     └─→ 阶段 3（移动端适配）── 可与阶段 2 并行
  │           │
  │           └─→ 阶段 4（封装发布）── 依赖前三阶段稳定
```

### 9.2 阶段 1：多用户地基（P0）

#### 9.2.1 数据库变更

**新增 migration**: `supabase/migrations/add_user_id_to_tasks.sql`

```sql
-- 1. 添加 user_id 列（允许 NULL 用于迁移过渡）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. 旧数据迁移策略：将遗留数据归属到首个注册用户
--    方案说明：升级前若已有任务数据（user_id IS NULL），RLS 开启后将不可见。
--    采用"首个注册用户认领"策略：将 user_id 为 NULL 的数据批量归属到
--    auth.users 表中最早注册的用户。若数据库为空（无用户），则跳过。
DO $$
DECLARE
  _first_user_id uuid;
BEGIN
  SELECT id INTO _first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF _first_user_id IS NOT NULL THEN
    UPDATE tasks SET user_id = _first_user_id WHERE user_id IS NULL;
    UPDATE comments SET user_id = _first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

-- 3. 删除旧的开放 RLS 策略
DROP POLICY IF EXISTS "Allow all on tasks" ON tasks;

-- 4. 新建按用户隔离的 RLS 策略
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- 5. 同样处理 comments 表
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
DROP POLICY IF EXISTS "Allow all on comments" ON comments;
CREATE POLICY "Users can view own comments" ON comments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);
```

#### 9.2.2 新增 AuthView 组件

`src/components/auth/AuthView.tsx` — 登录/注册页面：

```tsx
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabase'

export function AuthView() {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <h1 className="text-lg font-bold text-center mb-6">TaskFlow</h1>
        <p className="text-xs text-muted-foreground text-center mb-6 -mt-4">
          登录后，你的任务数据将安全地保存在云端，可在电脑和手机之间同步。
        </p>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
          localization={{
            variables: {
              sign_in: { email_label: '邮箱', password_label: '密码', button_label: '登录' },
              sign_up: { email_label: '邮箱', password_label: '密码', button_label: '注册' },
            },
          }}
        />
      </div>
    </div>
  )
}
```

**依赖新增**: `npm install @supabase/auth-ui-react @supabase/auth-ui-shared`

#### 9.2.3 TypeScript 类型更新

`src/types/index.ts` 中 `Task` 接口新增 `user_id` 字段：

```typescript
export interface Task {
  // ... 现有字段
  user_id: string  // 新增
}
```

#### 9.2.4 所有 CRUD 查询加 user_id 过滤

`src/hooks/useTasks.ts` 修改：

```typescript
// useTasks — 将 userId 注入 queryKey 实现缓存隔离
export function useTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', userId],
    queryFn: () => fetchTasks(userId),
    staleTime: 60_000,
    gcTime: Infinity,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: !!userId,
  })
}

// fetchTasks — 添加 user_id 过滤
async function fetchTasks(userId: string | undefined): Promise<Task[]> {
  if (useLocal) return localDB.fetchTasks()
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order')
    if (error) throw error
    return (data as Task[]) || []
  } catch (err) {
    console.warn('Supabase fetch failed, using local storage:', err)
    return localDB.fetchTasks()
  }
}

// createTask — 自动注入 user_id
async function createTask(task: Partial<Task>): Promise<Task> {
  if (useLocal) return localDB.createTask(task)
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: task.title || '新任务',
        description: task.description || '',
        status: task.status || 'todo',
        priority: task.priority || 'medium',
        start_date: task.start_date || null,
        due_date: task.due_date || null,
        progress_percent: task.progress_percent || 0,
        estimated_hours: task.estimated_hours || null,
        parent_id: task.parent_id || null,
        cycle_type: task.cycle_type || 'none',
        cycle_config: task.cycle_config || null,
        depends_on: task.depends_on || [],
        tags: task.tags || [],
        sort_order: task.sort_order || 0,
        user_id: user!.id,  // 自动注入
      })
      .select()
      .single()
    if (error) throw error
    return data as Task
  } catch (err) {
    console.warn('Supabase create failed, using local storage:', err)
    return localDB.createTask(task)
  }
}
```

`src/hooks/useComments.ts` 同样需要添加 `user_id` 过滤。

#### 9.2.5 App.tsx 路由守卫

```tsx
// 在 App 组件中检查登录状态
const [session, setSession] = useState(null)

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
  })
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })
  return () => subscription.unsubscribe()
}, [])

if (!session) {
  return <AuthView />
}
```

### 9.3 阶段 2：跨设备同步（P1）

#### 9.3.1 修复：DetailPanel 编辑态精确跟踪

**问题**：当前 `App.tsx:85-92` 用 `detailPanelOpen && selectedTaskId` 判断编辑态，但打开详情面板不等于正在编辑（用户可能只是查看）。

**方案**：在 `ui-slice.ts` 新增 `editingTaskId` 状态，由 `DetailPanel` 在真正开始编辑字段时设置。

`src/store/ui-slice.ts` 新增：

```typescript
editingTaskId: string | null
setEditingTaskId: (id: string | null) => void
```

`src/components/tasks/DetailPanel.tsx` 中接入：

```tsx
const setEditingTaskId = useAppStore((s) => s.setEditingTaskId)

// 编辑开始时通知
useEffect(() => {
  setEditingTaskId(editingField ? (task?.id ?? null) : null)
}, [editingField, task?.id, setEditingTaskId])
```

`src/App.tsx` 中将现有的 `detailPanelOpen ? selectedTaskId : null` 替换为从 store 读取 `editingTaskId`：

```tsx
const editingTaskId = useAppStore((s) => s.editingTaskId)

useEffect(() => {
  if (editingTaskId !== prevEditingId.current) {
    setEditingTask(editingTaskId)
    prevEditingId.current = editingTaskId
  }
}, [editingTaskId, setEditingTask])
```

#### 9.3.2 调整数据刷新策略

`src/hooks/useTasks.ts` 中：

```typescript
// 改前
staleTime: Infinity,
refetchOnWindowFocus: false,

// 改后
staleTime: 60_000,         // 60 秒后认为数据过期
refetchOnWindowFocus: true, // 窗口聚焦时若已过期则自动刷新
```

> **设计说明**：跨设备同步主要依赖 Supabase Realtime 订阅推送。`refetchOnWindowFocus` 仅作为兜底机制，在 Realtime 连接中断或消息丢失时补拉数据。`staleTime` 设为 60 秒避免频繁切换标签页时的过度拉取。

### 9.4 阶段 3：移动端适配（P2）

#### 9.4.1 甘特图移动端降级

`src/components/views/ViewTabBar.tsx` 中：

```tsx
// 检测屏幕宽度，移动端甘特图置灰并显示 tooltip
const [isMobile, setIsMobile] = useState(false)

useEffect(() => {
  const check = () => setIsMobile(window.innerWidth < 768)
  check()
  window.addEventListener('resize', check)
  return () => window.removeEventListener('resize', check)
}, [])

// 移动端甘特图渲染为禁用态，而非隐藏
// 在 Tab 按钮上加 disabled 属性 + tooltip
{isMobile && tab.id === 'gantt' ? (
  <button
    disabled
    title="甘特图需要较大屏幕，请在电脑上打开，或切换到列表视图查看"
    className="opacity-40 cursor-not-allowed"
  >
    {tab.label}
  </button>
) : (
  <button onClick={() => setProjectViewTab(tab.id)}>{tab.label}</button>
)}
```

> **设计说明**：不直接隐藏甘特图选项，而是置灰 + tooltip 提示。这样用户在手机上能看到甘特图的存在，旋转到横屏时不会因视图突然消失而困惑。

#### 9.4.2 详情面板移动端全屏

`src/components/tasks/DetailPanel.tsx` 中：

```tsx
// 用 CSS 响应式切换
<aside className={cn(
  'border-l border-border bg-background flex flex-col h-full overflow-auto',
  'md:w-[340px] md:min-w-[340px] md:flex-shrink-0',
  'max-md:fixed max-md:inset-0 max-md:z-50', // 移动端全屏 overlay
)}>
```

#### 9.4.3 触控优化

- 甘特图拖拽加 `touchstart`/`touchmove`/`touchend` 事件
- `hover-reveal` 类在移动端改为默认显示（`@media (hover: none)` 规则）

### 9.5 阶段 4：封装发布（P3）

#### 9.5.1 PWA 配置

安装依赖：

```bash
npm install -D vite-plugin-pwa
```

`vite.config.ts` 修改：

```typescript
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'TaskFlow - 任务管理系统',
        short_name: 'TaskFlow',
        description: '多用户任务日志管理',
        theme_color: '#1a56db',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
```

#### 9.5.2 离线状态提示

`src/components/ui/OfflineBanner.tsx`：

```tsx
export function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
      当前离线 — 你的修改已保存在本地，联网后将自动同步
    </div>
  )
}
```

---

## 10. 文件变更总览

| 阶段 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 1 | `supabase/migrations/add_user_id_to_tasks.sql` | **新增** | user_id 列 + RLS 策略 (tasks + comments) |
| 1 | `src/components/auth/AuthView.tsx` | **新增** | 登录/注册页面 |
| 1 | `src/types/index.ts` | 修改 | Task 接口加 `user_id` |
| 1 | `src/hooks/useTasks.ts` | 修改 | `useTasks(userId)` 签名变更，`queryKey: ['tasks', userId]`，`staleTime: 60_000` |
| 1 | `src/hooks/useComments.ts` | 修改 | 同理加 `user_id` 过滤 |
| 1 | `src/App.tsx` | 修改 | 路由守卫 + 登录态检查 + `userId` 传递给 `useTasks` |
| 1 | `package.json` | 修改 | 加 `@supabase/auth-ui-react` `@supabase/auth-ui-shared` |
| 2 | `src/store/ui-slice.ts` | 修改 | 新增 `editingTaskId` + `setEditingTaskId` |
| 2 | `src/components/tasks/DetailPanel.tsx` | 修改 | 编辑时调用 `setEditingTaskId` + 移动端全屏 |
| 2 | `src/App.tsx` | 修改 | 从 store 读取 `editingTaskId` 替代旧的判断逻辑 |
| 3 | `src/components/views/ViewTabBar.tsx` | 修改 | 移动端甘特图置灰 + tooltip 引导 |
| 3 | `src/components/tasks/DetailPanel.tsx` | 修改 | 移动端全屏 overlay |
| 3 | `src/index.css` | 修改 | 触控 hover 降级规则 |
| 4 | `vite.config.ts` | 修改 | PWA 插件配置 |
| 4 | `src/components/ui/OfflineBanner.tsx` | **新增** | 离线状态提示 |
| 4 | `package.json` | 修改 | 加 `vite-plugin-pwa` |

---

## 11. 各阶段验收标准

| 阶段 | 验收标准 |
|------|----------|
| 1 | 用户 A 注册登录 → 创建任务 → 登出 → 用户 B 登录 → 看不到用户 A 的任务 |
| 2 | 设备 A 编辑任务 → 设备 B 在 30 秒内看到更新 |
| 3 | 手机浏览器打开 → 甘特图不可选 → 详情面板全屏 → 列表视图正常操作 |
| 4 | 添加到主屏幕 → 离线时显示横幅 → 联网后数据同步 |

---

## 12. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| Supabase Auth 配置错误导致 RLS 不生效 | 中 | 阶段 1 完成后手动测试两个不同账号 |
| 已有数据无 user_id 导致查询为空 | 高 | 已解决：migration 中通过 DO 块将遗留数据归属到首个注册用户 |
| 移动端甘特图降级后用户功能缺失 | 低 | 列表视图已覆盖核心 CRUD，日历视图同样可用 |
| PWA 缓存策略导致更新不及时 | 低 | 使用 `autoUpdate` 模式，每次打开自动检查更新 |
| 手机浏览器兼容性 | 中 | 目标仅支持 iOS Safari 14+ 和 Chrome Android 90+ |
| 离线编辑后冲突合并 | 低 | 采用"后者覆盖"策略，后续迭代优化 |

---

## 13. 不纳入本次范围

- 角色权限（RBAC）— 当前所有用户平等，无管理员概念
- 团队/组织/工作空间 — 当前仅个人任务日志
- 操作日志/审计 — 后续迭代
- Electron 桌面应用 — PWA 已满足"封装"需求
- 离线编辑后冲突合并 — 采用"后者覆盖"策略，后续迭代
- 第三方登录（Google/GitHub/微信）— 仅邮箱注册

---

## 14. 附录：完整文件清单

### 14.1 源代码

```
src/
├── App.tsx                              # 主入口，路由守卫 + 视图切换 + 冲突检测
├── main.tsx                             # React 挂载
├── index.css                            # 全局样式 + Tailwind
├── components/
│   ├── ai/
│   │   └── AIAssistantView.tsx          # DeepSeek AI 对话界面
│   ├── auth/
│   │   └── AuthView.tsx                 # [待新增] 登录/注册
│   ├── board/
│   │   └── BoardView.tsx                # 看板视图
│   ├── calendar/
│   │   └── CalendarView.tsx             # 日历视图
│   ├── editor/
│   │   └── RichTextEditor.tsx           # TipTap 富文本编辑器
│   ├── gantt/
│   │   └── GanttView.tsx                # 甘特图视图
│   ├── layout/
│   │   └── Sidebar.tsx                  # 左侧任务树
│   ├── settings/
│   │   └── SettingsView.tsx             # 设置页面
│   ├── tasks/
│   │   ├── CommentSection.tsx           # 评论板块
│   │   ├── CreateTaskDialog.tsx         # 创建任务对话框
│   │   ├── DependencyPicker.tsx         # 依赖选择器
│   │   ├── DetailPanel.tsx              # 任务详情面板
│   │   └── HierarchyTree.tsx            # 层级树
│   ├── templates/
│   │   └── SaveAsTemplate.tsx           # 另存为模板
│   ├── ui/
│   │   ├── CheatSheet.tsx               # 快捷键速查
│   │   ├── DraftToast.tsx               # 草稿提示
│   │   ├── ImportDialog.tsx             # 导入对话框
│   │   ├── OfflineBanner.tsx            # [待新增] 离线提示
│   │   └── RemoteUpdateBanner.tsx       # 编辑冲突横幅
│   └── views/
│       ├── GalleryView.tsx              # 画廊视图
│       ├── ListView.tsx                 # 列表视图
│       ├── ProjectView.tsx              # 项目视图容器
│       ├── TableView.tsx                # 表格视图
│       └── ViewTabBar.tsx               # 视图切换 Tab
├── hooks/
│   ├── useComments.ts                   # 评论 CRUD
│   ├── useKeyboardShortcuts.ts          # 键盘快捷键
│   ├── useRecurringTaskExecutor.ts      # 重复任务执行器
│   ├── useTasks.ts                      # 任务 CRUD + Realtime 订阅
│   └── useTemplates.ts                  # 模板 CRUD + 重复任务
├── lib/
│   ├── indexedDB.ts                     # IndexedDB 封装
│   ├── localStorage.ts                  # 离线降级逻辑
│   ├── supabase.ts                      # Supabase 客户端
│   └── utils.ts                         # 工具函数
├── store/
│   ├── ai-slice.ts                      # AI 聊天状态
│   ├── filter-slice.ts                  # 搜索/筛选状态
│   ├── index.ts                         # Store 入口 + persist
│   ├── settings-slice.ts                # 主题/字体/API Key
│   └── ui-slice.ts                      # UI 状态
└── types/
    └── index.ts                         # 所有 TypeScript 类型
```

### 14.2 数据库迁移

```
supabase/migrations/
├── batch_complete_tasks.sql             # 批量完成任务 RPC
├── check_dependency_cycle.sql           # 循环依赖检测 RPC
├── create_templates.sql                 # 模板表 + 重复任务表 + claim RPC
├── seed_builtin_templates.sql           # 内置模板种子数据
└── add_user_id_to_tasks.sql             # [待新增] user_id + RLS
```

### 14.3 配置文件

```
├── package.json                         # 依赖 + 脚本
├── vite.config.ts                       # Vite 配置 + 路径别名
├── tsconfig.json                        # TypeScript 配置
└── .env                                 # 环境变量 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_DEEPSEEK_API_KEY)
```
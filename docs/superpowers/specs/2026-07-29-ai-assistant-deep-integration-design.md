# TaskFlow AI 助手深度集成 — 技术设计文档

**日期**: 2026-07-29  
**状态**: 已批准，待实施  
**目标**: 将 AI 助手从基础对话升级为完整的任务管理副驾驶，支持自然语言操作任务、智能分析与洞察、上下文感知对话

---

## 1. 项目概述

### 1.1 当前状态

AI 助手已具备基础对话能力（DeepSeek v4-flash 流式对话 + 消息持久化 FIFO 50 条），但存在以下缺口：

- 无法实际创建/更新/删除任务（欢迎消息中承诺的"回复'添加'即可"未实现）
- 联网搜索复选框是摆设（API 请求中未传递）
- 无项目分析、风险评估等智能洞察
- 无上下文感知的多轮推理能力

### 1.2 目标

将 AI 助手升级为**完整的任务管理副驾驶**，用户通过自然语言即可完成：

- 任务 CRUD 操作（创建/更新/删除/搜索）
- 项目分析与风险评估
- 日/周报生成
- 多步复合操作（如"把阻塞的高优任务全部标记为进行中"）

### 1.3 技术选型

采用 **DeepSeek Function Calling** 方案，原因：

- DeepSeek v3/v4 对 function calling 支持成熟
- 扩展性强，新增能力只需新增工具定义
- 多步推理天然支持（AI 先查再改再确认）
- 业界标准做法，与 OpenAI/Claude 工具调用模式一致

---

## 2. 系统架构

### 2.1 整体架构图

```
用户输入 "把高优先级的阻塞任务全部标记为进行中"
        │
        ▼
┌──────────────────────────────────────┐
│         AIAssistantView              │
│  handleSend(userMessage)             │
│    │                                 │
│    ▼                                 │
│  ┌──────────────────────────────┐    │
│  │  runWithTools(messages)      │    │  ← 核心循环
│  │                              │    │
│  │  loop (max 10):              │    │
│  │   1. DeepSeek API (stream)   │    │
│  │   2. text delta → 流式渲染    │    │
│  │   3. tool_calls → 执行工具    │    │
│  │   4. tool_result → 追加消息  │    │
│  │   5. finish_reason=stop → 结束│   │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │  src/lib/ai-tools/           │    │  ← 工具层
│  │  ├── types.ts                │    │
│  │  ├── tool-registry.ts        │    │
│  │  ├── run-with-tools.ts       │    │
│  │  ├── search-tasks.ts         │    │
│  │  ├── create-task.ts          │    │
│  │  ├── update-task.ts          │    │
│  │  ├── delete-task.ts          │    │
│  │  ├── analyze-tasks.ts        │    │
│  │  └── generate-report.ts      │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

### 2.2 依赖注入（关键设计决策）

普通 TS 函数不能调用 React Hooks。工具函数通过 `ToolContext` 接收依赖：

```typescript
interface ToolContext {
  queryClient: QueryClient  // 工具执行后 invalidateQueries 触发 UI 刷新
  userId: string            // 当前用户 ID，自动注入到所有数据操作
  supabase: SupabaseClient  // 直接操作数据库
}
```

`AIAssistantView` 中构建 context 并传入 `runWithTools`：

```typescript
const queryClient = useQueryClient()
const { session } = useAuth()

const context: ToolContext = {
  queryClient,
  userId: session?.user?.id ?? '',
  supabase,
}
```

### 2.3 核心循环

```typescript
// src/lib/ai-tools/run-with-tools.ts
async function runWithTools(
  messages: Message[],
  tools: ToolDefinition[],
  context: ToolContext,
  signal: AbortSignal,
  callbacks: {
    onTextDelta: (delta: string) => void
    onToolCall: (tool: ToolCall) => string
    onToolResult: (id: string, result: ToolResult) => void
    onDone: () => void
    onError: (error: string) => void
  }
): Promise<void> {
  const MAX_LOOPS = 10

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const response = await fetchDeepSeek(messages, tools, signal)
    const { textContent, toolCalls } = await parseStreamResponse(response, callbacks.onTextDelta)

    if (toolCalls.length === 0) {
      callbacks.onDone()
      return
    }

    for (const tc of toolCalls) {
      const msgId = callbacks.onToolCall(tc)
      const tool = tools.find(t => t.name === tc.function.name)
      if (!tool) {
        callbacks.onToolResult(msgId, { success: false, message: `未知工具: ${tc.function.name}` })
        continue
      }
      try {
        const args = JSON.parse(tc.function.arguments)
        const result = await tool.execute(args, context)
        callbacks.onToolResult(msgId, result)
        context.queryClient.invalidateQueries({ queryKey: ['tasks'] })
      } catch (err) {
        callbacks.onToolResult(msgId, {
          success: false,
          message: err instanceof Error ? err.message : '工具执行失败',
        })
      }
    }
  }
  callbacks.onError('操作过于复杂，请分步描述')
}
```

---

## 3. 工具系统

### 3.1 类型定义

```typescript
// src/lib/ai-tools/types.ts

interface ToolContext {
  queryClient: QueryClient
  userId: string
  supabase: SupabaseClient
}

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

interface ToolResult {
  success: boolean
  message: string
  data?: unknown
  requiresConfirmation?: boolean  // 危险操作标记
}
```

### 3.2 首批工具（6 个）

| 工具 | 功能 | AI 触发示例 |
|------|------|------------|
| `search_tasks` | 按条件搜索任务（状态/优先级/关键词/日期范围） | "有哪些阻塞的任务？" |
| `create_task` | 创建任务（含子任务批量创建，上限 20 个） | "帮我创建一个本周五截止的高优任务" |
| `update_task` | 更新任务字段（状态/优先级/日期/标题等，批量上限 50 个） | "把「登录模块」的状态改为进行中" |
| `delete_task` | 删除任务（需确认） | "删除「废弃的测试任务」" |
| `analyze_tasks` | 分析项目进度、风险、瓶颈 | "当前项目有什么风险？" |
| `generate_report` | 生成指定周期的日/周报摘要 | "帮我生成这周的周报" |

### 3.3 工具设计原则

- **原子化**：每个工具做一件事，AI 组合调用
- **幂等性**：重复调用同一工具不会产生副作用
- **用户数据隔离**：所有工具自动注入 `userId`，通过 Supabase RLS 双重保障
- **安全限制**：批量操作有上限；删除操作需用户确认

---

## 4. 状态管理

### 4.1 Message 类型扩展

```typescript
// src/store/ai-slice.ts

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  timestamp: number
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolSuccess?: boolean
}

export interface AISlice {
  messages: Message[]
  isLoading: boolean
  activeToolCalls: string[]        // 正在执行中的工具名
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateLastAssistant: (content: string) => void
  addToolCall: (msg: Omit<Message, 'id' | 'timestamp'>) => void
  updateToolResult: (messageId: string, result: { success: boolean; content: string }) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
}
```

### 4.2 持久化策略

- FIFO 上限从 50 提升到 **100 条**（避免工具调用密集消耗配额）
- `tool_result` 消息仅持久化 `{ success, message }`，丢弃 `data` 详情以减少存储体积
- `isLoading` 和 `activeToolCalls` 不持久化（刷新后不应显示加载态）

---

## 5. UI 设计

### 5.1 消息类型渲染

| 消息角色 | 渲染方式 |
|---------|---------|
| `user` | 右对齐蓝色气泡，现有样式不变 |
| `assistant` | 左对齐灰色气泡，Markdown 渲染，现有样式不变 |
| `tool_call` | 左对齐工具卡片，loading 动画 + toolName + args 摘要 |
| `tool_result` | 左对齐工具卡片，成功/失败状态 + 结果摘要 |

### 5.2 工具调用卡片

```
执行中：
┌─────────────────────────────────────┐
│ 🔧 正在搜索任务...                   │
│    条件：状态=阻塞, 优先级=高         │
└─────────────────────────────────────┘

完成：
┌─────────────────────────────────────┐
│ ✅ 搜索完成 — 找到 3 个阻塞的高优任务  │
│    · 支付模块接口联调 (blocked)       │
│    · 用户权限改造 (blocked)           │
│    · 数据库迁移脚本 (blocked)         │
└─────────────────────────────────────┘
```

### 5.3 确认卡片

当工具返回 `requiresConfirmation: true` 时，在聊天流中插入确认卡片：

```
┌─────────────────────────────────────┐
│ ⚠️ 确认删除以下任务？                │
│    · [废弃的测试任务] (todo)         │
│                                     │
│   [确认删除]  [取消]                 │
└─────────────────────────────────────┘
```

- 复用现有 `ConfirmDialog` 组件逻辑，以内联卡片形式嵌入聊天流
- 用户确认 → 继续执行工具并返回结果
- 用户取消 → 返回 `{ success: false, message: "用户取消了操作" }` 给 AI

### 5.4 多轮工具调用示例

```
用户: "把高优先级的阻塞任务全部标记为进行中"

AI:                       "好的，让我先查一下..."
  → tool_call: search_tasks(status=blocked, priority=high)
  ← tool_result: 找到 3 个任务

AI:                       "找到了 3 个阻塞的高优任务，正在逐一标记..."
  → tool_call: update_task(id=xxx, status=in_progress)
  ← tool_result: ✅ 支付模块接口联调 → 进行中
  → tool_call: update_task(id=yyy, status=in_progress)
  ← tool_result: ✅ 用户权限改造 → 进行中
  → tool_call: update_task(id=zzz, status=in_progress)
  ← tool_result: ✅ 数据库迁移脚本 → 进行中

AI:                       "全部完成！3 个任务已标记为进行中。"
```

---

## 6. 错误处理

| 层级 | 错误类型 | 处理方式 |
|------|---------|---------|
| 网络层 | API 超时/断网 | 重试 1 次，失败后显示"AI 服务暂时不可用，请稍后重试" |
| API 层 | 401 未授权 | 显示"API Key 无效，请在设置中检查" |
| API 层 | 429 限流 | 显示"请求过于频繁，请稍后重试" |
| 工具层 | 任务不存在 | 返回 `{ success: false, message }` 给 AI，AI 自行调整策略 |
| 确认层 | 用户拒绝确认 | 返回 `{ success: false, message: "用户取消了操作" }` 给 AI |
| 循环层 | 超过 10 轮 | 强制终止，提示"操作过于复杂，请分步描述" |

### 中断处理

- 用户点击"停止" → `AbortController.abort()` → 流式中断 + 当前工具执行完成后不再继续循环
- 已执行的工具结果不回滚（与现有乐观更新策略一致）

---

## 7. 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/ai-tools/types.ts` | **新增** | `ToolDefinition` / `ToolContext` / `ToolResult` 类型 |
| `src/lib/ai-tools/tool-registry.ts` | **新增** | 工具注册表，收集所有工具定义 |
| `src/lib/ai-tools/run-with-tools.ts` | **新增** | 核心循环：多轮 function calling + 工具执行 |
| `src/lib/ai-tools/search-tasks.ts` | **新增** | 按关键词/状态/优先级/日期搜索任务 |
| `src/lib/ai-tools/create-task.ts` | **新增** | 创建任务（含子任务批量创建，上限 20） |
| `src/lib/ai-tools/update-task.ts` | **新增** | 更新任务字段，支持批量（上限 50） |
| `src/lib/ai-tools/delete-task.ts` | **新增** | 删除任务（需确认） |
| `src/lib/ai-tools/analyze-tasks.ts` | **新增** | 分析项目进度、风险、瓶颈 |
| `src/lib/ai-tools/generate-report.ts` | **新增** | 生成日/周报摘要 |
| `src/store/ai-slice.ts` | 修改 | `role` 扩展 `tool_call` / `tool_result`；新增 `activeToolCalls`；FIFO → 100；持久化优化 |
| `src/components/ai/AIAssistantView.tsx` | 修改 | `handleSend` 改为 `runWithTools`；新增工具卡片渲染 |
| `src/components/ai/ToolCallCard.tsx` | **新增** | 工具调用中卡片（loading） |
| `src/components/ai/ToolResultCard.tsx` | **新增** | 工具结果卡片（成功/失败） |
| `src/components/ai/ConfirmCard.tsx` | **新增** | 确认操作卡片（内联，复用 ConfirmDialog 逻辑） |

**不改动的文件：**
- `useTasks.ts` / `useComments.ts` / `useAuth.ts` — 现有 hooks 不变
- `App.tsx` — AI 视图挂载方式不变
- `lib/supabase.ts` — 客户端不变

---

## 8. 验收标准

| # | 场景 | 预期结果 |
|---|------|---------|
| 1 | 输入"创建一个本周五截止的高优先级任务" | AI 调用 `create_task`，任务出现在侧边栏和甘特图中 |
| 2 | 输入"把阻塞的任务列出来" | AI 调用 `search_tasks`，返回阻塞任务列表 |
| 3 | 输入"把这些阻塞任务全部标记为进行中" | AI 先搜索再逐个更新，最终所有任务状态变更 |
| 4 | 输入"当前项目有什么风险？" | AI 调用 `analyze_tasks`，返回风险评估（逾期/阻塞/进度落后） |
| 5 | 输入"生成本周工作摘要" | AI 调用 `generate_report`，输出结构化周报 |
| 6 | 输入"删除 XXX 任务" | 弹出确认卡片，点确认后删除，点取消后 AI 回复"操作已取消" |
| 7 | 切换视图再返回 AI | 消息历史保留（含工具调用卡片），FIFO 100 条 |
| 8 | 断网时发消息 | AI 返回"服务暂时不可用"提示，不崩溃 |
| 9 | 工具执行失败（如更新不存在的任务） | AI 告知用户失败原因，并建议替代方案 |
| 10 | 一次操作超过 10 轮工具调用 | 终止循环，提示"操作过于复杂，请分步描述" |

---

## 9. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|----------|
| DeepSeek function calling 参数格式不稳定 | 低 | 外层 try-catch 包裹 JSON.parse，失败时返回错误给 AI 让其重试 |
| 工具调用消耗过多 token | 中 | 工具 description 精简；`analyze_tasks` 限制返回数据量 |
| 用户对 AI 误操作不满 | 中 | 删除操作需确认；批量操作有上限；所有操作可手动撤销 |
| FIFO 100 条仍不够 | 低 | 截断时优先移除旧的 `tool_result` 消息 |

---

## 10. 不纳入本次范围

- 联网搜索功能（当前 DeepSeek API 不支持）— 移除 UI 中的复选框
- AI 自动排期建议（需日历视图深度集成）— 后续迭代
- AI 生成任务模板并沉淀到模板库 — 后续迭代
- 多模型切换（GPT-4 / Claude）— 后续迭代
- AI 对话历史导出 — 后续迭代
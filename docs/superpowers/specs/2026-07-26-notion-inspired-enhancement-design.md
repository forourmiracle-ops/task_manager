# TaskFlow Notion 式功能与 UI 增强设计

> 创建日期：2026-07-26  
> 状态：设计完成，待实现  
> 优先级：模板(P0) → 多视图(P1) → UI 精致度(P2) → 富文本(P3)

---

## 一、概述

参照 Notion 的功能与交互体验，对 TaskFlow 进行四个阶段的系统性增强：

| 阶段 | 内容 | 定位 |
|------|------|------|
| Phase 1 | 模板与自动化 | 提升创建效率，降低重复劳动 |
| Phase 2 | 数据库多视图 | 同一数据源多视角切换 |
| Phase 3 | UI 精致度 | 视觉向 Notion 靠拢 |
| Phase 4 | 富文本编辑器 | 块级编辑体验 |

---

## 二、Phase 1：模板与自动化

### 2.1 数据模型

#### `templates` 表

```sql
CREATE TABLE templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  type        text NOT NULL CHECK (type IN ('project', 'task', 'recurring')),
  scope       text NOT NULL DEFAULT 'custom' CHECK (scope IN ('builtin', 'custom')),
  icon        text DEFAULT '📋',
  content     jsonb NOT NULL,
  is_public   boolean DEFAULT false,  -- 预埋字段，本期仅存储不使用
  user_id     uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

`content` jsonb 结构：

```json
{
  "version": 1,
  "title": "模板名称",
  "description": "模板描述",
  "defaultValues": {
    "priority": "medium",
    "status": "todo",
    "estimated_hours": 4,
    "tags": [],
    "labels": []
  },
  "children": [
    {
      "title": "子任务",
      "defaultValues": { "priority": "high" },
      "children": [...]
    }
  ]
}
```

- 每层节点可携带 `defaultValues`，应用到生成任务时递归合并
- 嵌套 `children` 递归结构，树深度不限制
- `version` 字段用于 Schema 版本控制，前端解析时校验降级
- `scope: 'builtin'` 不可删除，可复制为自定义模板后编辑
- `scope: 'custom'` 用户可自由 CRUD

#### `recurring_tasks` 表

```sql
CREATE TABLE recurring_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid REFERENCES templates(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  frequency      text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval       int NOT NULL DEFAULT 1,
  days_of_week   int[] DEFAULT '{}',       -- [1,3,5] = 周一三五
  next_run       timestamptz NOT NULL,
  last_run       timestamptz,
  enabled        boolean DEFAULT true,
  user_id        uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);
```

- 模板负责"生成什么"，重复规则负责"何时生成"，完全解耦
- `days_of_week` 支持 `[1,3,5]`（周一三五）这类灵活场景
- 重复任务由客户端在应用启动时触发执行

#### 重复任务执行器

```
用户打开应用 → 检查所有 enabled 的 recurring_tasks
  → next_run <= now() 的记录
    → 生成任务（基于 template.content）
    → 更新 next_run = max(next_run + interval, now())
    → 更新 last_run = now()
```

- 积压处理：`max(next_run + interval, now())` 避免 3 天未打开一次性生成 3 个重复任务
- 不依赖 Supabase Edge Functions（付费功能）
- 多端并发防护：封装 Supabase RPC 函数 `fn_claim_recurring_task`，利用 Postgres 事务锁原子化"检查 + 生成 + 更新 next_run"三步操作，避免多设备同时打开时重复创建任务

### 2.2 内置模板（迁移脚本预置）

| 模板名称 | 类型 | 内容 |
|----------|------|------|
| 软件开发迭代 | project | Epic → Feature → Task → Subtask 四层结构 |
| 产品需求文档 | project | PRD → 技术方案 → 开发 → 测试 → 上线 |
| Bug 修复 | task | 默认标题 + 高优先级 + bug 标签 |
| 每周站会 | recurring | 每周一生成，带默认 checklist |
| 月度复盘 | recurring | 每月 1 日生成，带默认字段 |

### 2.3 组件架构

```
TemplatePicker（入口组件）
├── TemplateDropdown              ← 轻量下拉，常态展示
│   ├── 最近使用模板列表（最近 5 条）
│   ├── 内置模板列表（按 type 分组）
│   └── "浏览全部模板库..." → 触发 Modal
├── TemplateLibraryModal          ← 重型模态框，深度浏览
│   ├── TemplateCategoryList      ← 左侧分类导航
│   │   ├── 按 type 分组
│   │   ├── 按 scope 分组
│   │   └── 搜索过滤
│   ├── TemplatePreview           ← 右侧预览区
│   │   ├── 项目模板：缩进树形预览
│   │   ├── 任务模板：字段卡片预览
│   │   └── 重复任务：字段 + 重复规则预览
│   └── 操作：使用 / 复制为自定义 / 删除（自定义）
├── SaveAsTemplate                ← 逆向沉淀
│   ├── 触发点：任务卡片菜单 / 详情面板 / 项目设置
│   ├── 确认弹窗：自动提取字段 → 预览 → 命名 → 保存
│   └── 保存后跳转至模板管理页，新模板高亮
└── TemplateSettings              ← 设置页模板管理
    ├── 自定义模板 CRUD
    ├── 偏好 Toggle：[新建时默认展开模板库]
    └── 模板导入/导出 JSON
```

### 2.4 交互流程

**创建流程（渐进式）：**

1. 用户点击"新建项目"或"新建任务"
2. 默认展示轻量 `TemplateDropdown`：[📋 模板：无 ▾]
3. 下拉列表展示最近使用和最常用模板，一键套用
4. 底部固定"浏览全部模板库..."入口
5. 点击后唤起 `TemplateLibraryModal`（左侧分类 + 右侧预览）
6. 全局设置可切换为"默认展开模板库"模式

**沉淀流程（反向闭环）：**

1. 用户在成熟的任务/项目上点击"另存为模板"
2. 弹窗自动提取标题、描述、子任务层级、标签、预设字段
3. 用户可编辑名称、选择图标
4. 保存为 `scope: 'custom'` 模板
5. 自动跳转至模板管理页

### 2.5 集成点

| 入口 | 位置 | 触发方式 |
|------|------|----------|
| 新建项目 | 顶栏"+ 新建项目"按钮 | 点击后弹出模板选择 |
| 新建任务 | 侧边栏 / 创建弹窗 | 表单内嵌 TemplateDropdown |
| 模板管理 | 设置页新增"模板管理"标签 | 直接进入 TemplateSettings |
| 重复任务执行 | 应用启动时自动检查 | 后台静默，生成后通知 |
| 另存为模板 | 任务卡片菜单 / 详情面板 / 项目设置 | 提取数据 → 确认 → 保存 |

---

## 三、Phase 2：数据库多视图

### 3.1 视图体系

**现有视图：** 甘特图、看板、日历

**新增视图：**

1. **列表视图（List View）** — 侧重树形层级
   - 原生支持子任务折叠展开（Accordion Tree）
   - 单行显示：标题、状态、负责人、截止时间
   - 高密度阅读体验
   - 技术实现：复用现有 `flattenTasks` 平铺算法，将树结构拍平为带 `depth` 和 `isExpanded` 的数组，再交付 `@tanstack/react-virtual` 渲染，避免变高节点导致的滚动跳动

2. **表格视图（Table View）** — 侧重二维网格
   - 扁平化展示所有任务（不强求缩进）
   - Excel 式单元格内联编辑
   - 列宽可拖拽调整
   - 自定义列显示/隐藏
   - 冻结首列
   - 底部始终保留空行用于快速新建

3. **画廊视图（Gallery View）** — 侧重浏览
   - 每个任务一张卡片
   - 封面支持 emoji 或颜色占位
   - 适合项目概览、冲刺回顾

### 3.2 导航结构

**方案 C（采纳）：合并简化**

```
顶栏：[📊 项目视图] [🤖 AI 助手] [⚙️ 设置] [+ 新建]

项目视图内标签栏：
[📋 列表] [🗂 看板] [📊 表格] [🎨 画廊] [📅 日历] [📈 甘特图]
```

- 顶栏的甘特图/看板/日历合并为"项目视图"入口
- 进入后内容区顶部展示 6 个视图标签
- 语义清晰：顶栏是功能入口，标签栏是数据视角
- 无重复控件，无层级混乱
- 键盘快捷键：基于现有 `useKeyboardShortcuts`，支持 `V`+`L`（列表）、`V`+`B`（看板）、`V`+`T`（表格）、`V`+`G`（画廊）、`V`+`C`（日历）、`V`+`N`（甘特图）快速切换视图

### 3.3 状态管理

**全局共享状态：** 搜索关键词、全局时间筛选器

**视图独立状态（每个视图独立持久化到 Zustand + localStorage）：**

| 字段 | 说明 |
|------|------|
| `visible_columns` | 显示哪些列 |
| `group_by` | 分组方式（按状态/按负责人/按标签） |
| `sort_by` | 排序规则 |
| `card_cover` | 画廊视图封面来源 |

### 3.4 组件结构

```
ProjectView（新容器组件）
├── ViewTabBar                   ← 6 个视图标签 + 搜索/筛选/排序
├── ListView                     ← 列表视图
│   └── 虚拟滚动 + 树形折叠
├── BoardView                    ← 现有看板（迁移至容器内）
├── TableView                    ← 表格视图
│   └── 虚拟滚动 + 列调整 + 内联编辑
├── GalleryView                  ← 画廊视图
│   └── 卡片网格 + 虚拟滚动
├── CalendarView                 ← 现有日历（迁移至容器内）
└── GanttView                    ← 现有甘特图（迁移至容器内）
```

---

## 四、Phase 3：UI 精致度

### 4.1 颜色与边框

- 页面背景 `#FBFBFB`，卡片/面板 `#FFFFFF`
- 边框统一为 `1px solid rgba(55, 53, 47, 0.09)`
- 悬停边框加深至 `rgba(55, 53, 47, 0.16)`
- 移除重度阴影，仅保留最微妙的层级阴影

### 4.2 微交互

- 拖拽手柄（`⋮⋮`）、三点菜单（`...`）、"+ 新建"按钮默认透明度 20%，hover 该行时显现
- 标题和字段取消传统输入框外框，平时显示纯文本，点击直接切换为光标聚焦状态
- 键盘可访问性：支持 `Tab` 切换下一个字段、`Enter` 确认、`Esc` 取消编辑

### 4.3 视觉标识

- 所有项目、模板和高优先级任务支持自定义 1 个 Emoji 图标
- Emoji 使用浏览器原生输入或轻量选择器
- 状态标签采用淡色底 + 深色字（如"进行中"：`#E8F3FF` 底 + `#1890FF` 字）

### 4.4 留白与字阶

- 新增 `density` 设置（compact / comfortable），默认 `comfortable`
- 行高 `1.5`
- 标题 `16px/600`，正文 `14px/400`，元数据 `12px/400`

---

## 五、Phase 4：富文本编辑器

### 5.1 技术选型

**选择：Tiptap 轻量版（懒加载）**

- 动态导入 `React.lazy`，零初始开销
- 仅在用户打开详情面板或进入编辑状态时加载

### 5.2 一期扩展清单（4 个 Extension）

1. **StarterKit** — 加粗、斜体、标题（H1-H3）、引用、代码块
2. **TaskList + TaskItem** — 交互式待办清单
3. **Slash Command（自定义 Extension）** — 输入 `/` 弹出快捷菜单
   - 菜单项绑定模板：输入 `/bug` 直接套用 Bug 修复模板，`/sop` 套用标准化流程模板
4. **Link & Image** — 粘贴/拖拽插入图片和超链接

### 5.3 集成点

| 位置 | 说明 |
|------|------|
| 任务描述字段 | `DetailPanel` 描述区替换为 Tiptap |
| 评论输入区 | `CommentSection` 输入框替换为 Tiptap |
| 模板编辑 | 模板管理页编辑模板描述时使用 |

### 5.4 懒加载方案

```tsx
const RichTextEditor = lazy(() => import('@/components/editor/RichTextEditor'))
```

- 主视图（列表/看板/甘特图/画廊）完全不加载 Tiptap
- 仅在 DetailPanel 内条件渲染时动态加载并显示 loading 占位

---

## 六、实施顺序

| 顺序 | 阶段 | 依赖 | 预计改动范围 |
|------|------|------|-------------|
| 1 | Phase 1 模板 | Supabase 迁移 | 新增 2 表 + 迁移 + 5 组件 |
| 2 | Phase 2 多视图 | 模板完成后 | 新增 4 视图 + 重构导航 |
| 3 | Phase 3 UI 精致度 | 可独立进行 | CSS 变量调整 + 组件微调 |
| 4 | Phase 4 富文本 | 可独立进行 | 新增 Tiptap 封装 + 改造 3 处 |

---

## 七、不变更项

- 不引入 `cron_expression` 字段（对普通用户复杂度高，`days_of_week` 已覆盖 90% 场景）
- 本期不实现团队模板共享（`is_public` 字段已预埋，留待后续）
- 不引入完整块编辑器（Tiptap 按需加载，一期仅 4 个扩展）
- 不修改现有 Supabase 认证和权限体系
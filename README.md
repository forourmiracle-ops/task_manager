# TaskFlow — 轻量级工作任务管理系统

TaskFlow 是一款多端通用的工作任务管理工具，支持项目层级管理、甘特图可视化、看板拖拽、日历视图、AI 智能分析等功能。前端基于 React + TypeScript + Vite 构建，数据通过 Supabase（BaaS）云端同步，无需自建服务器。

> 在线体验：[www.task-manager-framiracle.online](https://www.task-manager-framiracle.online)

## 功能特性

### 核心功能
- **多层级任务管理**：支持最多 4 层级（项目 → 阶段 → 任务组 → 子任务），每层级可维护标题、描述、开始/截止日期、优先级、状态、进度、预估工时、标签等
- **甘特图视图**：可视化展示任务时间线与进度，支持鼠标拖拽画布、Shift+滚轮横向滚动、键盘方向键导航，直观了解项目整体状态
- **看板视图**：按状态（待办/进行中/已完成/已阻塞）分列展示，支持拖拽流转
- **日历视图**：按日期排列任务，方便查看日程安排
- **AI 智能助手**：集成 DeepSeek 大模型 + 联网搜索，支持任务拆解建议与项目分析洞察，配有专属 DeepSeek 鲸鱼助手形象

### 用户体验
- **点击即改**：任务详情页点击任意字段直接编辑，回车或点击外部区域确认，弹出确认提示防止误操作
- **创建即完整**：创建任务时可展开更多字段，同步设置日期、优先级、状态
- **8 档字体调节**：设置中提供 8 级字体大小（极小到超大），满足不同视力需求
- **三种主题模式**：浅色模式 / 夜间模式（深色）/ 护眼模式（暖色），人性化关怀
- **响应式设计**：桌面端三栏布局，移动端底部导航 + 精简顶栏，甘特图自适应缩放
- **键盘快捷键**：`Ctrl+N` 快速新建项目，`Ctrl+B` 切换侧边栏，`← →` 甘特图横向导航，`?` 查看快捷键列表
- **用户认证**：支持邮箱注册/登录，Supabase 认证体系

### 移动端适配
- **精简顶栏**：仅保留汉堡菜单 + AI 快捷入口，视图切换交给底部导航
- **底部导航栏**：项目 / AI 助手 / 设置 / 新建，拇指可达区域
- **甘特图适配**：自适应缩放比例，任务栏文字外显，半透明「回到今天」胶囊浮钮
- **侧边栏**：85vw 宽滑出抽屉，背景不透明确保可读性

### 数据与同步
- 基于 Supabase PostgreSQL 云端存储，多设备数据自动同步
- 实时协作：通过 Supabase Realtime 订阅实现多端数据实时同步
- 离线降级：当 Supabase 不可用时自动回退到浏览器 IndexedDB / localStorage
- 免服务器部署：纯前端应用 + BaaS 后端，零运维成本

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript | 前端框架 |
| Vite | 构建工具 |
| Tailwind CSS 4 | 样式框架 |
| Zustand | 全局状态管理 |
| TanStack React Query | 服务端数据管理 |
| TanStack Virtual | 虚拟列表渲染 |
| Supabase | 数据库 + 认证 + 实时同步 + 存储 |
| DeepSeek API | AI 智能分析 |
| PWA | 渐进式 Web 应用，支持离线缓存 |

## 快速开始

### 前置要求

- **Node.js** >= 18.x（推荐 20.x）
- **npm** >= 9.x
- 一个 [Supabase](https://supabase.com) 账号（免费套餐即可）
- 一个 [DeepSeek](https://platform.deepseek.com) API Key（可选，用于 AI 功能，通过 Edge Function 代理配置）

### 安装步骤

1. **克隆项目**

```bash
git clone https://github.com/forourmiracle-ops/task_manager.git
cd task_manager
```

2. **安装依赖**

```bash
npm install
```

3. **配置环境变量**

复制环境变量模板并填写：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 Supabase 配置：

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

4. **初始化数据库**

在 Supabase 控制台的 **SQL Editor** 中按以下顺序执行 SQL 文件：

```bash
# 1. 先建模板表与周期任务表（仅执行一次，不可重复执行）
supabase/migrations/create_templates.sql

# 2. 再建主库表结构、函数、RLS 策略（可重复执行，幂等）
supabase/sync_database.sql

# 3. 最后导入内置模板数据（仅执行一次）
supabase/migrations/seed_builtin_templates.sql
```

> **注意：** `sync_database.sql` 第 12 节新增的 `fn_claim_recurring_task` 函数引用了 `recurring_tasks` 和 `templates` 表的 `%ROWTYPE`，因此必须先执行 `create_templates.sql` 建好这两张表。`sync_database.sql` 使用 `IF NOT EXISTS` / `CREATE OR REPLACE` 保证幂等，可重复执行；`create_templates.sql` 和 `seed_builtin_templates.sql` 只能执行一次。

5. **启动开发服务器**

```bash
npm run dev
```

浏览器访问 `http://localhost:5173` 即可使用。

### 构建生产版本

```bash
npm run build
npm run preview   # 预览生产构建
```

构建产物位于 `dist/` 目录，可部署到任何静态托管服务（Vercel、Netlify、GitHub Pages 等）。

### 自动部署到 Vercel

项目已提供 GitHub Actions 工作流：`.github/workflows/deploy.yml`。
每次将代码推送到 `master` 分支时，工作流会依次执行类型检查、Lint、生产构建，并在全部通过后将 `dist/` 静态文件部署到 Vercel 生产环境。也可以在 GitHub Actions 页面手动运行。

首次使用需要在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加以下三个 Repository secrets：

| Secret | 获取位置 | 用途 |
|------|------|------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens | 允许 GitHub Actions 部署 |
| `VERCEL_ORG_ID` | Vercel 项目 `.vercel/repo.json` 的 `orgId` | 指定 Vercel 账户或团队 |
| `VERCEL_PROJECT_ID` | 同一文件的 `id` | 指定 TaskFlow 项目 |

在本机进入已经关联的 Vercel 项目目录执行 `npx vercel link` 后，可在 `.vercel/repo.json` 查看后两个 ID。不同版本的 Vercel CLI 文件名可能不同；当前 CLI 使用 `repo.json`，其中项目 ID 字段名是 `id`。`.vercel` 目录不要提交到 GitHub，令牌也不要写入代码。

## 配置指南

### Supabase 配置

1. 在 [supabase.com](https://supabase.com) 注册并创建项目
2. 在项目设置 → API 中获取 `Project URL` 和 `anon public key`
3. 填入 `.env` 文件的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
4. 在 SQL Editor 中执行 `supabase/migration.sql` 创建数据表

### DeepSeek AI 配置（可选）

1. 在 [platform.deepseek.com](https://platform.deepseek.com) 注册并获取 API Key
2. 使用 Supabase CLI 部署 Edge Function 代理：
   ```bash
   supabase secrets set DEEPSEEK_API_KEY=sk-your-deepseek-api-key
   supabase functions deploy ai-proxy
   ```
3. AI 功能通过 Edge Function 代理调用 DeepSeek API，前端不再直接持有或传输 API Key
4. 若不配置，AI 助手功能将不可用，但不影响其他功能

## 使用指南

### 基本操作

| 操作 | 方式 |
|------|------|
| 创建项目 | 点击侧边栏「+ 新建项目」或顶部「+ 新建」，或 `Ctrl+N` |
| 创建子任务 | 悬停任务 → 点击「+」按钮，最多 4 层 |
| 查看任务详情 | 点击任务列表中的任务 |
| 编辑任务 | 在详情面板中点击任意字段直接修改，回车或点击外部确认 |
| 删除任务 | 详情面板底部「删除」按钮（子任务将一并删除） |
| 切换视图 | 顶部导航栏：甘特图 / 看板 / 日历 / AI 助手 / 设置 |
| 搜索任务 | 侧边栏顶部搜索框 |
| 切换侧边栏 | 点击左上角 ☰ 或 `Ctrl+B` |

### 创建任务时设置字段

创建任务时，点击「展开更多字段 ▼」可同步设置：
- 开始日期 / 截止日期
- 优先级（低/中/高/紧急）
- 状态（待办/进行中/已完成/已阻塞）

### 编辑模式

任务详情面板采用**点击即改**模式：
1. 点击任意字段标签或值，进入编辑状态
2. 修改内容后，按 **Enter** 或点击面板外部区域
3. 弹出「是否确认修改」提示，确认后保存

### 个性化设置

进入「设置」页面可调整：
- **主题模式**：浅色 / 夜间（深色）/ 护眼（暖色）
- **字体大小**：8 档调节，从极小到超大

## 项目结构

```
task-manager/
├── src/
│   ├── components/
│   │   ├── ai/            # AI 助手视图（DeepSeek 集成）
│   │   ├── auth/          # 用户认证（登录/注册）
│   │   ├── board/         # 看板视图
│   │   ├── calendar/      # 日历视图
│   │   ├── gantt/         # 甘特图视图（自研，含拖拽/键盘导航）
│   │   ├── layout/        # 布局组件（侧边栏等）
│   │   ├── settings/      # 设置页面
│   │   ├── tasks/         # 任务详情面板
│   │   ├── ui/            # 通用 UI 组件
│   │   └── views/         # 视图容器
│   ├── hooks/             # 自定义 Hooks（数据操作、认证、同步）
│   ├── lib/               # 工具函数与常量
│   ├── store/             # Zustand 全局状态
│   ├── types/             # TypeScript 类型定义
│   ├── App.tsx            # 主应用组件
│   ├── main.tsx           # 入口文件
│   └── index.css          # 全局样式与主题变量
├── supabase/
│   └── migration.sql      # 数据库迁移脚本
├── .env.example           # 环境变量模板
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 数据模型

采用单表自引用邻接表模型，实现灵活的四层级任务树：

```
Task (任务)
├── id, title, description
├── parent_id (自引用 → 父任务)
├── status (todo / in_progress / done / blocked)
├── priority (low / medium / high / urgent)
├── start_date, due_date
├── progress_percent, estimated_hours, actual_hours
├── cycle_type, cycle_config (重复周期)
├── depends_on (依赖关系)
├── tags (标签数组)
└── sort_order, created_at, updated_at
```

## 常见问题

### Q: 手机端如何使用？
A: 在手机浏览器中访问 [www.task-manager-framiracle.online](https://www.task-manager-framiracle.online) 即可。移动端针对窄屏做了全面优化：精简顶栏、底部导航、甘特图自适应缩放、半透明浮钮。

### Q: 数据安全吗？
A: 数据存储在 Supabase 云端 PostgreSQL 数据库中，传输使用 HTTPS 加密。用户认证通过 Supabase Auth 管理，Row Level Security (RLS) 可在 Supabase 控制台配置。

### Q: 可以离线使用吗？
A: 当 Supabase 连接不可用时，系统自动回退到浏览器 IndexedDB 本地存储，数据不会丢失。网络恢复后自动同步。

### Q: 如何部署到公网？
A: 推荐使用 Vercel 一键部署：
```bash
npm i -g vercel
vercel
```
构建产物也可部署到 Netlify、GitHub Pages 等平台。部署后建议绑定自定义域名以优化国内访问体验。部署后需在 Supabase 后台更新 Site URL 和 Redirect URLs 为你部署的域名。

## License

MIT

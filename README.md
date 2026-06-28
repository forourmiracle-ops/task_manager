# TaskFlow — 轻量级工作任务管理系统

TaskFlow 是一款多端通用的工作任务管理工具，支持项目层级管理、甘特图可视化、看板拖拽、日历视图、AI 智能分析等功能。前端基于 React + TypeScript + Vite 构建，数据通过 Supabase（BaaS）云端同步，无需自建服务器。

## 功能特性

### 核心功能
- **多层级任务管理**：支持最多 4 层级（项目 → 阶段 → 任务组 → 子任务），每层级可维护标题、描述、开始/截止日期、优先级、状态、进度、预估工时、标签等
- **甘特图视图**：可视化展示任务时间线与进度，直观了解项目整体状态
- **看板视图**：按状态（待办/进行中/已完成/已阻塞）分列展示，支持拖拽流转
- **日历视图**：按日期排列任务，方便查看日程安排
- **AI 智能助手**：集成 DeepSeek 大模型 + 联网搜索，支持任务拆解建议与项目分析洞察

### 用户体验
- **点击即改**：任务详情页点击任意字段直接编辑，回车或点击外部区域确认，弹出确认提示防止误操作
- **创建即完整**：创建任务时可展开更多字段，同步设置日期、优先级、状态
- **8 档字体调节**：设置中提供 8 级字体大小（极小到超大），满足不同视力需求
- **三种主题模式**：浅色模式 / 夜间模式（深色）/ 护眼模式（暖色），人性化关怀
- **响应式设计**：适配桌面端三栏布局与移动端底部导航
- **键盘快捷键**：`Ctrl+N` 快速新建项目，`Ctrl+B` 切换侧边栏

### 数据与同步
- 基于 Supabase PostgreSQL 云端存储，多设备数据自动同步
- 离线降级：当 Supabase 不可用时自动回退到浏览器 localStorage
- 免服务器部署：纯前端应用 + BaaS 后端，零运维成本

## 技术栈

| 技术 | 用途 |
|------|------|
| React 19 + TypeScript 6 | 前端框架 |
| Vite 8 | 构建工具 |
| Tailwind CSS 4 | 样式框架 |
| Zustand | 全局状态管理 |
| TanStack React Query | 服务端数据管理 |
| Supabase | 数据库 + 实时同步 + 存储 |
| dhtmlx-gantt | 甘特图组件 |
| DeepSeek API | AI 智能分析 |

## 快速开始

### 前置要求

- **Node.js** >= 18.x（推荐 20.x）
- **npm** >= 9.x
- 一个 [Supabase](https://supabase.com) 账号（免费套餐即可）
- 一个 [DeepSeek](https://platform.deepseek.com) API Key（可选，用于 AI 功能）

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

编辑 `.env` 文件，填入你的 Supabase 和 DeepSeek 配置：

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

4. **初始化数据库**

在 Supabase 控制台的 **SQL Editor** 中执行 `supabase/migration.sql` 文件中的全部 SQL 语句，以创建所需的数据库表。

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

## 配置指南

### Supabase 配置

1. 在 [supabase.com](https://supabase.com) 注册并创建项目
2. 在项目设置 → API 中获取 `Project URL` 和 `anon public key`
3. 填入 `.env` 文件的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
4. 在 SQL Editor 中执行 `supabase/migration.sql` 创建数据表

### DeepSeek AI 配置（可选）

1. 在 [platform.deepseek.com](https://platform.deepseek.com) 注册并获取 API Key
2. 填入 `.env` 文件的 `VITE_DEEPSEEK_API_KEY`
3. 若不配置，AI 助手功能将不可用，但不影响其他功能

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
│   │   ├── ai/            # AI 助手视图
│   │   ├── board/         # 看板视图
│   │   ├── calendar/      # 日历视图
│   │   ├── gantt/         # 甘特图视图
│   │   ├── layout/        # 布局组件（侧边栏等）
│   │   ├── settings/      # 设置页面
│   │   └── tasks/         # 任务详情面板
│   ├── hooks/             # 自定义 Hooks（数据操作）
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
A: 在手机浏览器中访问部署后的 URL 即可。也可通过 Vercel 等平台部署后使用 PWA 方式添加到桌面。

### Q: 数据安全吗？
A: 数据存储在 Supabase 云端 PostgreSQL 数据库中，传输使用 HTTPS 加密。Row Level Security (RLS) 可在 Supabase 控制台配置。

### Q: 可以离线使用吗？
A: 当 Supabase 连接不可用时，系统自动回退到浏览器 localStorage 本地存储，数据不会丢失。网络恢复后需手动同步。

### Q: 如何部署到公网？
A: 推荐使用 Vercel 一键部署：
```bash
npm i -g vercel
vercel
```
或直接拖拽 `dist/` 目录到 Netlify、GitHub Pages 等平台。

## License

MIT
# TaskFlow 多用户 MVP — 实施变更汇总

**日期**: 2026-07-27  
**基于**: [多用户 MVP 技术设计文档](./2026-07-27-multi-user-mvp-design.md)

---

## 变更清单（21 个文件）

### Phase 1：多用户地基（P0）

| # | 文件 | 操作 | 变更说明 |
|---|------|------|----------|
| 1 | `supabase/migrations/add_user_id_to_tasks.sql` | **新增** | `user_id` 列 + 旧数据 DO 块自动归属 + RLS 策略（tasks & comments 四权限） |
| 2 | `supabase/migrations/batch_complete_tasks.sql` | 修改 | `WHERE id = _task_id` → `WHERE id = _task_id AND user_id = auth.uid()` |
| 3 | `supabase/migrations/create_templates.sql` | 修改 | `fn_claim_recurring_task` WHERE 加 `AND user_id = auth.uid()` |
| 4 | `supabase/migrations/check_dependency_cycle.sql` | 修改 | 递归 CTE 的 base case 和 recursive step 均加 `AND user_id = auth.uid()`，防止跨用户依赖检测 |
| 5 | `src/components/auth/AuthView.tsx` | **新增** | 登录/注册页面，含过渡引导文案 |
| 6 | `src/hooks/useAuth.ts` | **新增** | `useAuth` hook，提供 `session`/`userId`/`isAuthenticated`/`loading` |
| 7 | `src/App.tsx` | 修改 | 路由守卫（authLoading 加载态 + !isAuthenticated → AuthView）；移除未使用的 `useRef`/`selectedTaskId`/`detailPanelOpen` |
| 8 | `src/types/index.ts` | 修改 | `Task` 接口新增 `user_id: string` |
| 9 | `src/hooks/useTasks.ts` | 修改 | `useAuth` 内部获取 `userId`；`queryKey: ['tasks', userId]`；`staleTime: 60_000`；`refetchOnWindowFocus: true`；`enabled: !!userId`；`fetchTasks` `.eq('user_id')`；`createTask` 自动注入 `user_id` |
| 10 | `src/hooks/useComments.ts` | 修改 | `fetchComments` 加 `.eq('user_id', user.id)`；`createComment` 注入 `user_id` |
| 11 | `package.json` | 修改 | 新增 `@supabase/auth-ui-react` `@supabase/auth-ui-shared` |

### Phase 2：跨设备同步（P1）

| # | 文件 | 操作 | 变更说明 |
|---|------|------|----------|
| 12 | `src/store/ui-slice.ts` | 修改 | 接口新增 `editingTaskId: string \| null` + `setEditingTaskId`；实现新增对应字段 |
| 13 | `src/components/tasks/DetailPanel.tsx` | 修改 | 新增 `useEffect` 监听 `editingField` → `setEditingTaskId`；从 store 读取 `setEditingTaskId` |
| 14 | `src/App.tsx` | 修改 | 旧逻辑 `detailPanelOpen ? selectedTaskId : null` → 从 store 读取 `editingTaskId` 直传 `setEditingTask` |

### Phase 3：移动端适配（P2）

| # | 文件 | 操作 | 变更说明 |
|---|------|------|----------|
| 15 | `src/components/views/ViewTabBar.tsx` | 修改 | 新增 `isMobile` 检测；甘特图从隐藏改为置灰 + tooltip 引导 |
| 16 | `src/components/tasks/DetailPanel.tsx` | 修改 | aside 添加 `max-md:fixed max-md:inset-0 max-md:z-50` 全屏 overlay |
| 17 | `src/index.css` | 修改 | 新增 `@media (hover: none)` 规则：`.hover-reveal` `opacity: 1`，`.drag-handle` `opacity: 0.5` |

### Phase 4：PWA 封装（P3）

| # | 文件 | 操作 | 变更说明 |
|---|------|------|----------|
| 18 | `vite.config.ts` | 修改 | 新增 `VitePWA` 插件 + manifest + workbox 配置 |
| 19 | `src/components/ui/OfflineBanner.tsx` | **新增** | 离线状态横幅组件 |
| 20 | `src/App.tsx` | 修改 | 导入并渲染 `<OfflineBanner />` |
| 21 | `package.json` | 修改 | 新增 `vite-plugin-pwa` |

---

## 关键设计决策

| 决策 | 说明 |
|------|------|
| `useTasks` 内部集成 `useAuth` | 11 个现有调用方无需修改，零 prop drilling |
| 甘特图禁用而非隐藏 | 用户旋转屏幕时不会因视图消失而困惑，tooltip 提供替代引导 |
| `staleTime: 60_000` + `refetchOnWindowFocus: true` | Realtime 订阅为主同步手段，窗口聚焦兜底 |
| 4 个 SECURITY DEFINER 函数均加 `user_id` 防御检查 | `batch_complete_tasks`、`fn_claim_recurring_task`、`check_dependency_cycle` 均已加固 |
| 旧数据 DO 块自动归属 | 避免用户升级后面对空列表的"数据丢失"感知 |

---

## 构建验证

```
tsc --noEmit   → 零错误
vite build     → 成功，PWA SW 生成（18 条目预缓存）
```

---

## 验收标准对照

| 阶段 | 标准 | 状态 |
|------|------|------|
| 1 | 用户 A 注册登录 → 创建任务 → 登出 → 用户 B 登录 → 看不到用户 A 的任务 | 代码就绪，需 Supabase 环境验证 |
| 2 | 设备 A 编辑任务 → 设备 B 在 60 秒内看到更新 | 代码就绪，需双设备验证 |
| 3 | 手机浏览器打开 → 甘特图禁用态 → 详情面板全屏 → 列表视图正常 | 代码就绪，需移动端验证 |
| 4 | 添加到主屏幕 → 离线时显示横幅 → 联网后数据同步 | 代码就绪，需 PWA 安装验证 |

---

## 后续步骤

### 1. Supabase 数据库部署

在 Supabase Dashboard → SQL Editor 中**按顺序**执行以下迁移脚本：

| 顺序 | 脚本 | 作用 |
|------|------|------|
| ① | `add_user_id_to_tasks.sql` | 添加 `user_id` 列 + 旧数据自动归属 + RLS 策略 |
| ② | `batch_complete_tasks.sql` | 修复批量完成函数的 `user_id` 检查 |
| ③ | `create_templates.sql` | 模板/重复任务表 + RLS + `fn_claim_recurring_task` |
| ④ | `check_dependency_cycle.sql` | 依赖循环检测函数（含 `user_id` 过滤） |

> **注意**：必须先执行 ① 再加列，否则后续 RPC 函数引用的 `user_id` 列不存在。

### 2. Supabase Auth 配置

登录 [Supabase Dashboard](https://supabase.com/dashboard)，进入项目后：

**2.1 启用邮箱登录**
- 导航到 `Authentication` → `Providers` → `Email`
- 确保 **"Enable Email provider"** 已开启

**2.2 关闭邮箱确认（MVP 测试阶段）**
- 在 Email Provider 设置中，将 **"Confirm email"** 关闭
- 这样注册后可直接登录，无需验证邮件
- 正式上线前务必重新开启

**2.3 配置 Redirect URL**
- 导航到 `Authentication` → `URL Configuration`
- **Site URL**：填入 `http://localhost:5173`
- **Redirect URLs**：添加 `http://localhost:5173`（支持通配符 `http://localhost:5173/*`）
- 生产环境部署时替换为实际域名

### 3. 环境变量

确保 `.env` 文件（参考 `.env.example`）中以下变量正确：

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 4. 联调验证

1. `npm run dev` 启动前端
2. 浏览器打开 `http://localhost:5173`，应被路由守卫拦截 → 显示 `AuthView` 登录/注册页
3. 注册"用户 A" → 创建几条任务 → 检查 Supabase Table Editor 中 `tasks` 表的 `user_id` 字段已自动填充
4. 登出 → 注册"用户 B" → 确认看不到用户 A 的任务（数据隔离验证）

### 5. PWA 图标

准备 `icon-192.png` 和 `icon-512.png` 放入 `public/` 目录。
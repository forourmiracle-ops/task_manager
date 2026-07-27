-- Seed builtin templates
-- These are visible to all authenticated users but cannot be deleted (scope = 'builtin')

INSERT INTO templates (name, description, type, scope, icon, content) VALUES
(
  '软件开发迭代',
  'Epic → Feature → Task → Subtask 四层结构，适合敏捷开发团队',
  'project',
  'builtin',
  '💻',
  '{"version":1,"title":"软件开发迭代","defaultValues":{"priority":"medium","status":"todo"},"children":[{"title":"需求分析","defaultValues":{"priority":"high"},"children":[{"title":"用户调研","defaultValues":{"estimated_hours":4}},{"title":"PRD 撰写","defaultValues":{"estimated_hours":8}}]},{"title":"技术方案","defaultValues":{"priority":"high"},"children":[{"title":"架构设计","defaultValues":{"estimated_hours":8}},{"title":"数据库设计","defaultValues":{"estimated_hours":4}}]},{"title":"开发实现","children":[{"title":"前端开发","defaultValues":{"estimated_hours":16}},{"title":"后端开发","defaultValues":{"estimated_hours":16}}]},{"title":"测试","children":[{"title":"单元测试","defaultValues":{"estimated_hours":8}},{"title":"集成测试","defaultValues":{"estimated_hours":8}}]},{"title":"上线部署","defaultValues":{"priority":"high"},"children":[{"title":"预发布验证","defaultValues":{"estimated_hours":4}},{"title":"生产发布","defaultValues":{"estimated_hours":2}}]}]}'
),
(
  '产品需求文档',
  'PRD → 技术方案 → 开发 → 测试 → 上线，完整产品生命周期',
  'project',
  'builtin',
  '📝',
  '{"version":1,"title":"产品需求文档","defaultValues":{"priority":"high","status":"todo"},"children":[{"title":"需求调研","defaultValues":{"estimated_hours":4},"children":[{"title":"用户访谈"},{"title":"竞品分析"},{"title":"数据回顾"}]},{"title":"PRD 撰写","defaultValues":{"estimated_hours":8},"children":[{"title":"背景与目标"},{"title":"用户故事"},{"title":"功能规格"},{"title":"验收标准"}]},{"title":"技术方案评审","defaultValues":{"estimated_hours":4},"children":[{"title":"架构设计"},{"title":"接口定义"},{"title":"风险评估"}]},{"title":"开发排期","defaultValues":{"estimated_hours":2},"children":[{"title":"任务拆分"},{"title":"工时评估"}]}]}'
),
(
  'Bug 修复',
  '预设高优先级和 bug 标签，快速记录和追踪缺陷',
  'task',
  'builtin',
  '🐛',
  '{"version":1,"title":"Bug 修复","defaultValues":{"priority":"high","status":"todo","tags":["bug"],"labels":["缺陷"]}}'
),
(
  '功能开发',
  '预设功能标签和中等优先级，适用于新功能开发任务',
  'task',
  'builtin',
  '✨',
  '{"version":1,"title":"功能开发","defaultValues":{"priority":"medium","status":"todo","tags":["feature"],"labels":["功能"]}}'
),
(
  '每周站会',
  '每周一自动生成，包含站会 checklist',
  'recurring',
  'builtin',
  '📊',
  '{"version":1,"title":"每周站会","defaultValues":{"priority":"medium","status":"todo","labels":["站会"]},"children":[{"title":"回顾上周进展"},{"title":"本周计划"},{"title":"风险和阻塞点"},{"title":"需要协助的事项"}]}'
),
(
  '月度复盘',
  '每月 1 日自动生成，回顾和总结月度工作',
  'recurring',
  'builtin',
  '📈',
  '{"version":1,"title":"月度复盘","defaultValues":{"priority":"medium","status":"todo","labels":["复盘"]},"children":[{"title":"本月目标完成情况"},{"title":"关键成果与亮点"},{"title":"问题与改进"},{"title":"下月规划"}]}'
);
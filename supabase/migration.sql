-- 工作任务管理系统 数据库迁移脚本
-- 在 Supabase SQL Editor 中执行

-- 1. 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '新任务',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date DATE,
  due_date DATE,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  estimated_hours NUMERIC,
  actual_hours NUMERIC,
  cycle_type TEXT NOT NULL DEFAULT 'none' CHECK (cycle_type IN ('none', 'daily', 'weekly', 'monthly', 'custom')),
  cycle_config JSONB,
  sprint_id UUID,
  depends_on UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_sort_order ON tasks(sort_order);

-- 2. 冲刺表
CREATE TABLE IF NOT EXISTS sprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新冲刺',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tasks ADD CONSTRAINT fk_tasks_sprint
  FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE SET NULL;

-- 3. 评论表
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_task_id ON comments(task_id);

-- 4. 附件表
CREATE TABLE IF NOT EXISTS attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_task_id ON attachments(task_id);

-- 5. 提醒表
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL DEFAULT 'browser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_task_id ON reminders(task_id);
CREATE INDEX idx_reminders_remind_at ON reminders(remind_at);

-- 6. AI 对话历史表
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_type TEXT NOT NULL DEFAULT 'task_breakdown',
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 8. 递归查询任务树函数
CREATE OR REPLACE FUNCTION get_task_tree()
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  title TEXT,
  status TEXT,
  priority TEXT,
  start_date DATE,
  due_date DATE,
  progress_percent INTEGER,
  depth INTEGER,
  path UUID[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE task_tree AS (
    SELECT
      t.id,
      t.parent_id,
      t.title,
      t.status,
      t.priority,
      t.start_date,
      t.due_date,
      t.progress_percent,
      0 AS depth,
      ARRAY[t.id] AS path
    FROM tasks t
    WHERE t.parent_id IS NULL
    UNION ALL
    SELECT
      t.id,
      t.parent_id,
      t.title,
      t.status,
      t.priority,
      t.start_date,
      t.due_date,
      t.progress_percent,
      tt.depth + 1,
      tt.path || t.id
    FROM tasks t
    JOIN task_tree tt ON t.parent_id = tt.id
    WHERE tt.depth < 3
  )
  SELECT * FROM task_tree ORDER BY path;
END;
$$ LANGUAGE plpgsql;

-- 9. 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;

-- 10. RLS 策略（当前允许所有操作，后续可收紧）
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sprints" ON sprints FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on comments" ON comments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on attachments" ON attachments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on reminders" ON reminders FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ai_sessions" ON ai_sessions FOR ALL USING (true) WITH CHECK (true);
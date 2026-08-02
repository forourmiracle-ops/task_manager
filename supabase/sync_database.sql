-- ============================================================
-- TaskFlow 完整数据库部署脚本
-- 在 Supabase SQL Editor 中一次性执行即可完成所有设置
-- (https://supabase.com/dashboard/project/tynhqwexdfdtobkmmzdo)
-- ============================================================

-- ============================================================
-- 1. 任务表 (如果不存在则创建)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
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

-- ============================================================
-- 2. 添加 user_id 列（如果表已存在但缺少此列）
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================================
-- 3. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

-- ============================================================
-- 4. 冲刺表
-- ============================================================
CREATE TABLE IF NOT EXISTS sprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新冲刺',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. 评论表
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);

-- ============================================================
-- 6. 附件表
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);

-- ============================================================
-- 7. 提醒表
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL DEFAULT 'browser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);

-- ============================================================
-- 8. AI 对话历史表
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_type TEXT NOT NULL DEFAULT 'task_breakdown',
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. 更新时间触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. 递归查询任务树函数
-- ============================================================
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
      t.id, t.parent_id, t.title, t.status, t.priority,
      t.start_date, t.due_date, t.progress_percent, 0 AS depth, ARRAY[t.id] AS path
    FROM tasks t
    WHERE t.parent_id IS NULL
    UNION ALL
    SELECT
      t.id, t.parent_id, t.title, t.status, t.priority,
      t.start_date, t.due_date, t.progress_percent, tt.depth + 1, tt.path || t.id
    FROM tasks t
    JOIN task_tree tt ON t.parent_id = tt.id
    WHERE tt.depth < 3
  )
  SELECT * FROM task_tree ORDER BY path;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 11. 批量完成任务 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION batch_complete_tasks(p_task_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _task_id uuid;
BEGIN
  FOREACH _task_id IN ARRAY p_task_ids
  LOOP
    UPDATE tasks
    SET status = 'done', progress_percent = 100, updated_at = NOW()
    WHERE id = _task_id AND user_id = auth.uid();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Task % not found or not owned by current user', _task_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 12. 认领孤儿任务 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION fn_claim_orphaned_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _count integer;
BEGIN
  WITH updated AS (
    UPDATE tasks SET user_id = auth.uid()
    WHERE user_id IS NULL
    RETURNING id
  )
  SELECT count(*) INTO _count FROM updated;
  RETURN _count;
END;
$$;

-- ============================================================
-- 13. 循环依赖检测 RPC
-- ============================================================
CREATE OR REPLACE FUNCTION check_dependency_cycle(p_task_id uuid, p_candidate_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _cycle_found boolean := false;
BEGIN
  WITH RECURSIVE dep_chain AS (
    SELECT id, depends_on FROM tasks
    WHERE p_task_id = ANY(depends_on) AND user_id = auth.uid()
    UNION ALL
    SELECT t.id, t.depends_on FROM tasks t
    INNER JOIN dep_chain dc ON dc.id = ANY(t.depends_on)
    WHERE t.user_id = auth.uid()
  )
  SELECT EXISTS (SELECT 1 FROM dep_chain WHERE id = p_candidate_id) INTO _cycle_found;
  RETURN _cycle_found;
END;
$$;

-- ============================================================
-- 14. RLS 策略 — 用户隔离
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 移除旧的开放策略
DROP POLICY IF EXISTS "Allow all on tasks" ON tasks;

-- 创建用户隔离策略（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Users can view own tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own tasks' AND tablename = 'tasks') THEN
    CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 15. 启用 Realtime
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
END $$;

-- ============================================================
-- 16. 迁移现有数据：将孤儿任务分配给第一个注册用户
-- ============================================================
DO $$
DECLARE
  _first_user_id uuid;
BEGIN
  SELECT id INTO _first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF _first_user_id IS NOT NULL THEN
    UPDATE tasks SET user_id = _first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

-- ============================================================
-- 验证部署结果
-- ============================================================
SELECT
  'tasks 表列' AS check_item,
  string_agg(column_name, ', ' ORDER BY ordinal_position) AS result
FROM information_schema.columns
WHERE table_name = 'tasks' AND table_schema = 'public'
UNION ALL
SELECT 'RLS 策略', string_agg(policyname, ', ') FROM pg_policies WHERE tablename = 'tasks'
UNION ALL
SELECT '任务总数', count(*)::text FROM tasks
UNION ALL
SELECT '孤儿任务(NULL user_id)', count(*)::text FROM tasks WHERE user_id IS NULL
UNION ALL
SELECT 'Realtime 发布', '已配置' WHERE EXISTS (
  SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
);

-- ============================================================
-- 17. 用户设置表（跨设备同步 API Key、主题等偏好）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  deepseek_api_key TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- RLS 启用
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS 策略
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own settings' AND tablename = 'user_settings') THEN
    CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own settings' AND tablename = 'user_settings') THEN
    CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own settings' AND tablename = 'user_settings') THEN
    CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Realtime 发布
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_settings;
  END IF;
END $$;
-- ============================================================
-- TaskFlow 完整数据库部署脚本
-- 在 Supabase SQL Editor 中一次性执行即可完成所有设置
-- ============================================================

-- ============================================================
-- 1. 任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
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

-- 为已有表添加 user_id 列（如果缺失）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'user_id') THEN
    ALTER TABLE tasks ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- 索引
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);

-- ============================================================
-- 2. 冲刺表
-- ============================================================
CREATE TABLE IF NOT EXISTS sprints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL DEFAULT '新冲刺',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sprints')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sprints' AND column_name = 'user_id') THEN
    ALTER TABLE sprints ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sprints_user_id ON sprints(user_id);

-- ============================================================
-- 3. 评论表
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comments')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'comments' AND column_name = 'user_id') THEN
    ALTER TABLE comments ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_task_id ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);

-- ============================================================
-- 4. 附件表
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attachments')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attachments' AND column_name = 'user_id') THEN
    ALTER TABLE attachments ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);

-- ============================================================
-- 5. 提醒表
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  remind_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL DEFAULT 'browser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reminders')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'user_id') THEN
    ALTER TABLE reminders ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminders_task_id ON reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);

-- ============================================================
-- 6. AI 对话历史表
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  session_type TEXT NOT NULL DEFAULT 'task_breakdown',
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_sessions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_sessions' AND column_name = 'user_id') THEN
    ALTER TABLE ai_sessions ADD COLUMN user_id UUID REFERENCES auth.users(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);

-- ============================================================
-- 7. 用户设置表（主题、字体等偏好，不存储 API Key）
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  theme TEXT NOT NULL DEFAULT 'light',
  font_size INTEGER NOT NULL DEFAULT 4,
  density TEXT NOT NULL DEFAULT 'comfortable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- ============================================================
-- 8. 更新时间触发器
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
-- 9. 批量完成任务 RPC
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
-- 10. 认领孤儿任务 RPC（仅用于手动迁移，不在生产代码中调用）
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
-- 11. 循环依赖检测 RPC
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
-- 12. RLS 策略 — 所有表按用户隔离
-- ============================================================

-- tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on tasks" ON tasks;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tasks_user_isolation' AND tablename = 'tasks') THEN
    CREATE POLICY "tasks_user_isolation" ON tasks
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- sprints
ALTER TABLE sprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on sprints" ON sprints;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sprints_user_isolation' AND tablename = 'sprints') THEN
    CREATE POLICY "sprints_user_isolation" ON sprints
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on comments" ON comments;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'comments_user_isolation' AND tablename = 'comments') THEN
    CREATE POLICY "comments_user_isolation" ON comments
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- attachments
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on attachments" ON attachments;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'attachments_user_isolation' AND tablename = 'attachments') THEN
    CREATE POLICY "attachments_user_isolation" ON attachments
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- reminders
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on reminders" ON reminders;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reminders_user_isolation' AND tablename = 'reminders') THEN
    CREATE POLICY "reminders_user_isolation" ON reminders
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ai_sessions
ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on ai_sessions" ON ai_sessions;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ai_sessions_user_isolation' AND tablename = 'ai_sessions') THEN
    CREATE POLICY "ai_sessions_user_isolation" ON ai_sessions
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_settings_user_isolation' AND tablename = 'user_settings') THEN
    CREATE POLICY "user_settings_user_isolation" ON user_settings
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 13. 收紧 SECURITY DEFINER 函数执行权限
-- ============================================================
REVOKE EXECUTE ON FUNCTION batch_complete_tasks(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION batch_complete_tasks(uuid[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION fn_claim_orphaned_tasks() FROM PUBLIC, anon, authenticated;
-- 此函数仅用于手动迁移，不授予任何角色

REVOKE EXECUTE ON FUNCTION check_dependency_cycle(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_dependency_cycle(uuid, uuid) TO authenticated;

-- ============================================================
-- 14. 启用 Realtime（仅 tasks 表，不含 user_settings）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
  END IF;
END $$;

-- 从 Realtime 移除 user_settings（不再包含 API Key）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE user_settings;
  END IF;
END $$;

-- ============================================================
-- 15. 迁移现有数据：将孤儿任务分配给第一个注册用户
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
SELECT '=== 表结构验证 ===' AS info;
SELECT
  table_name,
  string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('tasks', 'sprints', 'comments', 'attachments', 'reminders', 'ai_sessions', 'user_settings')
GROUP BY table_name
ORDER BY table_name;

SELECT '=== RLS 策略验证 ===' AS info;
SELECT tablename, string_agg(policyname, ', ') AS policies
FROM pg_policies
WHERE tablename IN ('tasks', 'sprints', 'comments', 'attachments', 'reminders', 'ai_sessions', 'user_settings')
GROUP BY tablename
ORDER BY tablename;

SELECT '=== 孤儿任务检查 ===' AS info;
SELECT count(*) AS orphaned_tasks FROM tasks WHERE user_id IS NULL;

SELECT '=== Realtime 发布 ===' AS info;
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
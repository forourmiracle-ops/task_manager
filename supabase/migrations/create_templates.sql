-- Templates table: stores project templates, task templates, and recurring task templates
CREATE TABLE IF NOT EXISTS templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text DEFAULT '',
  type        text NOT NULL CHECK (type IN ('project', 'task', 'recurring')),
  scope       text NOT NULL DEFAULT 'custom' CHECK (scope IN ('builtin', 'custom')),
  icon        text DEFAULT '📋',
  content     jsonb NOT NULL,
  is_public   boolean DEFAULT false,
  user_id     uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Builtin templates are visible to all authenticated users
DROP POLICY IF EXISTS "Builtin templates visible to all" ON templates;
CREATE POLICY "Builtin templates visible to all"
  ON templates FOR SELECT
  USING (scope = 'builtin' AND auth.uid() IS NOT NULL);

-- Custom templates are visible to their owner
DROP POLICY IF EXISTS "Custom templates visible to owner" ON templates;
CREATE POLICY "Custom templates visible to owner"
  ON templates FOR SELECT
  USING (scope = 'custom' AND user_id = auth.uid());

-- Only owner can insert custom templates
DROP POLICY IF EXISTS "Users can insert custom templates" ON templates;
CREATE POLICY "Users can insert custom templates"
  ON templates FOR INSERT
  WITH CHECK (scope = 'custom' AND user_id = auth.uid());

-- Only owner can update their custom templates
DROP POLICY IF EXISTS "Users can update own templates" ON templates;
CREATE POLICY "Users can update own templates"
  ON templates FOR UPDATE
  USING (scope = 'custom' AND user_id = auth.uid());

-- Only owner can delete their custom templates
DROP POLICY IF EXISTS "Users can delete own templates" ON templates;
CREATE POLICY "Users can delete own templates"
  ON templates FOR DELETE
  USING (scope = 'custom' AND user_id = auth.uid());

-- Recurring tasks table: scheduling rules for repeating task generation
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    uuid REFERENCES templates(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  frequency      text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval       int NOT NULL DEFAULT 1,
  days_of_week   int[] DEFAULT '{}',
  next_run       timestamptz NOT NULL,
  last_run       timestamptz,
  enabled        boolean DEFAULT true,
  user_id        uuid REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recurring tasks" ON recurring_tasks;
CREATE POLICY "Users can view own recurring tasks"
  ON recurring_tasks FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own recurring tasks" ON recurring_tasks;
CREATE POLICY "Users can insert own recurring tasks"
  ON recurring_tasks FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own recurring tasks" ON recurring_tasks;
CREATE POLICY "Users can update own recurring tasks"
  ON recurring_tasks FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own recurring tasks" ON recurring_tasks;
CREATE POLICY "Users can delete own recurring tasks"
  ON recurring_tasks FOR DELETE
  USING (user_id = auth.uid());

-- Atomic RPC: claim and execute a recurring task to prevent multi-device race conditions
CREATE OR REPLACE FUNCTION fn_claim_recurring_task(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _rec           recurring_tasks%ROWTYPE;
  _template      templates%ROWTYPE;
  _new_task_id   uuid;
BEGIN
  -- Lock the recurring task row to prevent concurrent claims
  SELECT * INTO _rec
  FROM recurring_tasks
  WHERE id = p_task_id
    AND enabled = true
    AND next_run <= now()
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Fetch the template with ownership check
  SELECT * INTO _template
  FROM templates
  WHERE id = _rec.template_id
    AND (user_id = auth.uid() OR scope = 'builtin');

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF _rec.parent_task_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM tasks
       WHERE id = _rec.parent_task_id
         AND user_id = auth.uid()
     ) THEN
    RETURN NULL;
  END IF;

  -- Create the task from template content
  INSERT INTO tasks (title, description, status, priority, estimated_hours, user_id, parent_id)
  VALUES (
    _template.content->>'title',
    _template.content->>'description',
    COALESCE(_template.content->'defaultValues'->>'status', 'todo'),
    COALESCE(_template.content->'defaultValues'->>'priority', 'medium'),
    COALESCE((_template.content->'defaultValues'->>'estimated_hours')::numeric, NULL),
    _rec.user_id,
    _rec.parent_task_id
  )
  RETURNING id INTO _new_task_id;

  -- Update the recurring task schedule (anti-backlog: max prevents batch generation)
  UPDATE recurring_tasks
  SET
    next_run = GREATEST(next_run + (_rec.interval || ' ' || _rec.frequency)::interval, now()),
    last_run = now()
  WHERE id = p_task_id;

  RETURN _new_task_id;
END;
$$;

-- 收紧函数执行权限：仅允许已认证用户调用
REVOKE EXECUTE ON FUNCTION fn_claim_recurring_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_claim_recurring_task(uuid) TO authenticated;

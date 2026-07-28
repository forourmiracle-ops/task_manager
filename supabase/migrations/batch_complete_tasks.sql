-- Batch complete tasks with transactional consistency
-- Uses explicit transaction block: all tasks complete atomically or all roll back
CREATE OR REPLACE FUNCTION batch_complete_tasks(p_task_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _task_id uuid;
BEGIN
  -- Loop through each task ID within a single transaction
  -- Any failure will roll back the entire batch
  FOREACH _task_id IN ARRAY p_task_ids
  LOOP
    UPDATE tasks
    SET
      status = 'done',
      progress_percent = 100,
      updated_at = NOW()
    WHERE id = _task_id
      AND user_id = auth.uid();

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Task % not found or not owned by current user', _task_id;
    END IF;
  END LOOP;
END;
$$;
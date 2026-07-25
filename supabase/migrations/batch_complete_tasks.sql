-- Batch complete tasks with transactional consistency
-- All tasks in the array are completed atomically: either all succeed or all roll back
CREATE OR REPLACE FUNCTION batch_complete_tasks(task_ids uuid[])
RETURNS SETOF tasks
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use a single atomic UPDATE for all tasks
  RETURN QUERY
    UPDATE tasks
    SET
      status = 'done',
      progress_percent = 100,
      updated_at = NOW()
    WHERE id = ANY(task_ids)
    RETURNING *;
END;
$$;
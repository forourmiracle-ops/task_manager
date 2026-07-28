-- Cycle detection: check if adding p_candidate_id as a dependency of p_task_id
-- would create a cycle in the dependency graph.
-- Returns TRUE if a cycle would be created, FALSE otherwise.
-- Security: only traverses tasks owned by the current authenticated user (SECURITY DEFINER
-- bypasses RLS, so user_id filtering is explicit).
CREATE OR REPLACE FUNCTION check_dependency_cycle(
  p_task_id uuid,
  p_candidate_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _cycle_found boolean := false;
BEGIN
  -- Recursive CTE: traverse the dependency chain starting from p_task_id
  -- If p_candidate_id appears in the chain, adding it as a dependency creates a cycle
  WITH RECURSIVE dep_chain AS (
    -- Base case: start from all tasks that depend on p_task_id (same user only)
    SELECT id, depends_on
    FROM tasks
    WHERE p_task_id = ANY(depends_on)
      AND user_id = auth.uid()

    UNION ALL

    -- Recursive step: follow the dependency chain (same user only)
    SELECT t.id, t.depends_on
    FROM tasks t
    INNER JOIN dep_chain dc ON dc.id = ANY(t.depends_on)
    WHERE t.user_id = auth.uid()
  )
  SELECT EXISTS (
    SELECT 1 FROM dep_chain WHERE id = p_candidate_id
  ) INTO _cycle_found;

  RETURN _cycle_found;
END;
$$;
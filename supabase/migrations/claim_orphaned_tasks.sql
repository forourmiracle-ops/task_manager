-- Migration: RPC function to let the current authenticated user claim orphaned tasks
-- Run this on Supabase SQL Editor AFTER add_user_id_to_tasks.sql
-- Usage: SELECT fn_claim_orphaned_tasks(); — returns number of tasks claimed

CREATE OR REPLACE FUNCTION fn_claim_orphaned_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _count integer;
BEGIN
  -- Only claim tasks that have NULL user_id (missed by the migration DO block)
  -- or were assigned to the first user if the current user needs to re-claim
  WITH updated AS (
    UPDATE tasks
    SET user_id = auth.uid()
    WHERE user_id IS NULL
    RETURNING id
  )
  SELECT count(*) INTO _count FROM updated;

  RETURN _count;
END;
$$;
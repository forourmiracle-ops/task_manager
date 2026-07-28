-- Migration: Add user_id column and RLS policies for multi-user isolation
-- Phase 1 of multi-user MVP
-- Date: 2026-07-27

-- ============================================================
-- 1. Add user_id column to tasks table
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- ============================================================
-- 2. Migrate legacy data: assign orphaned tasks to the first registered user
--    Prevents "data loss" perception when upgrading from single-user mode
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
-- 3. Drop old open RLS policies on tasks
-- ============================================================
DROP POLICY IF EXISTS "Allow all on tasks" ON tasks;

-- ============================================================
-- 4. Create user-isolated RLS policies on tasks
-- ============================================================
CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. Add user_id column to comments table
-- ============================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- Migrate legacy comments
DO $$
DECLARE
  _first_user_id uuid;
BEGIN
  SELECT id INTO _first_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF _first_user_id IS NOT NULL THEN
    UPDATE comments SET user_id = _first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

-- Drop old open RLS policy on comments
DROP POLICY IF EXISTS "Allow all on comments" ON comments;

-- Create user-isolated RLS policies on comments
CREATE POLICY "Users can view own comments"
  ON comments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON comments FOR DELETE
  USING (auth.uid() = user_id);
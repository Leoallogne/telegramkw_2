-- ==============================================================================
-- Migration: Fix Infinite Recursion in group_members and messages RLS Policies
-- ==============================================================================
-- Run this script in Supabase SQL Editor to eliminate Postgres error code 42P17.

-- 1. Helper functions with SECURITY DEFINER to bypass RLS recursion safely
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated, anon;

-- 2. Drop and recreate policies on group_members
DROP POLICY IF EXISTS "Allow read group memberships" ON public.group_members;
DROP POLICY IF EXISTS "Allow insert own group memberships" ON public.group_members;
DROP POLICY IF EXISTS "Allow insert group memberships" ON public.group_members;
DROP POLICY IF EXISTS "Allow update own group membership" ON public.group_members;
DROP POLICY IF EXISTS "Allow delete own group membership" ON public.group_members;

CREATE POLICY "Allow read group memberships"
    ON public.group_members
    FOR SELECT
    USING (
      auth.uid() = user_id 
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = public.group_members.group_id
          AND g.created_by = auth.uid()
      )
      OR public.is_group_member(public.group_members.group_id, auth.uid())
    );

CREATE POLICY "Allow insert group memberships"
    ON public.group_members
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = public.group_members.group_id
          AND g.created_by = auth.uid()
      )
      OR public.is_group_admin(public.group_members.group_id, auth.uid())
    );

CREATE POLICY "Allow update own group membership"
    ON public.group_members
    FOR UPDATE
    USING (
      auth.uid() = user_id 
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = public.group_members.group_id
          AND g.created_by = auth.uid()
      )
      OR public.is_group_admin(public.group_members.group_id, auth.uid())
    );

CREATE POLICY "Allow delete own group membership"
    ON public.group_members
    FOR DELETE
    USING (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = public.group_members.group_id
          AND g.created_by = auth.uid()
      )
      OR public.is_group_admin(public.group_members.group_id, auth.uid())
    );

-- 3. Drop and recreate policies on messages that reference group_members
DROP POLICY IF EXISTS "Allow read own messages" ON public.messages;
DROP POLICY IF EXISTS "Allow insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Allow update group messages" ON public.messages;
DROP POLICY IF EXISTS "Allow delete own messages" ON public.messages;

CREATE POLICY "Allow read own messages"
    ON public.messages
    FOR SELECT
    USING (
      auth.uid() = sender_id 
      OR auth.uid() = receiver_id
      OR (
        group_id IS NOT NULL 
        AND public.is_group_member(public.messages.group_id, auth.uid())
      )
    );

CREATE POLICY "Allow insert own messages"
    ON public.messages
    FOR INSERT
    WITH CHECK (
      auth.uid() = sender_id
      AND (
        group_id IS NULL
        OR public.is_group_member(public.messages.group_id, auth.uid())
      )
    );

CREATE POLICY "Allow update group messages"
    ON public.messages
    FOR UPDATE
    USING (
      group_id IS NOT NULL 
      AND public.is_group_member(public.messages.group_id, auth.uid())
    );

CREATE POLICY "Allow delete own messages"
    ON public.messages
    FOR DELETE
    USING (
      auth.uid() = sender_id 
      OR auth.uid() = receiver_id
      OR (
        group_id IS NOT NULL 
        AND public.is_group_member(public.messages.group_id, auth.uid())
      )
    );

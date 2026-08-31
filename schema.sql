-- Guest-to-Admin Anonymous Chat System SQL Schema
-- =========================================================
-- SAFE MIGRATION VERSION
-- This script does NOT drop tables, delete users, or reset chat history.
-- It only creates missing tables/indexes, repairs permissions, and keeps data intact.
-- =========================================================

-- 1. Drop legacy triggers on auth.users if they exist to avoid conflicts.
DO $$
DECLARE
    trig RECORD;
BEGIN
    FOR trig IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_schema = 'auth' 
          AND event_object_table = 'users'
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(trig.trigger_name) || ' ON auth.users;';
    END LOOP;
END $$;

-- 2. Replace functions safely.
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_delete_user() CASCADE;
DROP FUNCTION IF EXISTS public.reset_user_password(UUID, TEXT) CASCADE;

-- 3. Create tables only if missing.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    role TEXT CHECK (role IN ('guest', 'admin')) DEFAULT 'guest',
    is_pinned BOOLEAN DEFAULT false,
    status_bio TEXT DEFAULT 'Hey there! I am using Chat.',
    notify_sound BOOLEAN DEFAULT true,
    notify_push BOOLEAN DEFAULT true,
    show_read_receipts BOOLEAN DEFAULT true,
    show_online_status BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted')) DEFAULT 'accepted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    is_pinned_chat BOOLEAN DEFAULT false,
    expire_seconds INTEGER DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(message_id, user_id, emoji)
);

-- 4. Index only when needed.
CREATE INDEX IF NOT EXISTS idx_messages_sender_receiver ON public.messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- 5. Grant minimum privileges needed by anon/authenticated role.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.groups TO anon;
GRANT SELECT ON public.friendships TO anon;
GRANT SELECT ON public.message_reactions TO anon;

-- 6. Enable RLS on all tables used by the app.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- 7. Recreate trigger functions safely.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 1;
BEGIN
  base_username := COALESCE(new.raw_user_meta_data->>'username', 'User_' || substr(new.id::text, 1, 8));
  final_username := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || '_' || counter;
    counter := counter + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id,
    final_username,
    CASE WHEN new.email = 'admin@example.com' THEN 'admin' ELSE 'guest' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = old.id) THEN
    DELETE FROM auth.users WHERE id = old.id;
  END IF;
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_deleted ON public.profiles;
CREATE TRIGGER on_profile_deleted
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();

CREATE OR REPLACE FUNCTION public.reset_user_password(target_user_id UUID, new_password TEXT)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf'))
    WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only admins can reset user passwords.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Policies: safe idempotent creation.
DROP POLICY IF EXISTS "Allow read profiles for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Allow insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow delete profiles for admins" ON public.profiles;

DROP POLICY IF EXISTS "Allow read groups for authenticated users" ON public.groups;
DROP POLICY IF EXISTS "Allow insert own groups" ON public.groups;
DROP POLICY IF EXISTS "Allow update own groups" ON public.groups;
DROP POLICY IF EXISTS "Allow delete own groups" ON public.groups;

DROP POLICY IF EXISTS "Allow read group memberships" ON public.group_members;
DROP POLICY IF EXISTS "Allow insert own group memberships" ON public.group_members;
DROP POLICY IF EXISTS "Allow update own group membership" ON public.group_members;

DROP POLICY IF EXISTS "Allow read own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Allow insert own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Allow update own friendships" ON public.friendships;

DROP POLICY IF EXISTS "Allow read own messages" ON public.messages;
DROP POLICY IF EXISTS "Allow insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Allow update own received messages" ON public.messages;

DROP POLICY IF EXISTS "Allow read message reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Allow insert own reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Allow update own reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Allow delete own reactions" ON public.message_reactions;

CREATE POLICY "Allow read profiles for authenticated users"
    ON public.profiles
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow delete profiles for admins"
    ON public.profiles
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    );

CREATE POLICY "Allow read groups for authenticated users"
    ON public.groups
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert own groups"
    ON public.groups
    FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow update own groups"
    ON public.groups
    FOR UPDATE
    USING (auth.uid() = created_by);

CREATE POLICY "Allow delete own groups"
    ON public.groups
    FOR DELETE
    USING (auth.uid() = created_by);

CREATE POLICY "Allow read group memberships"
    ON public.group_members
    FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (
      SELECT 1
      FROM public.group_members gm_admin
      WHERE gm_admin.group_id = public.group_members.group_id
        AND gm_admin.user_id = auth.uid()
        AND gm_admin.role = 'admin'
    ));

CREATE POLICY "Allow insert own group memberships"
    ON public.group_members
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update own group membership"
    ON public.group_members
    FOR UPDATE
    USING (auth.uid() = user_id OR EXISTS (
      SELECT 1
      FROM public.group_members gm_admin
      WHERE gm_admin.group_id = public.group_members.group_id
        AND gm_admin.user_id = auth.uid()
        AND gm_admin.role = 'admin'
    ));

CREATE POLICY "Allow read own friendships"
    ON public.friendships
    FOR SELECT
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Allow insert own friendships"
    ON public.friendships
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update own friendships"
    ON public.friendships
    FOR UPDATE
    USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Allow read own messages"
    ON public.messages
    FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Allow insert own messages"
    ON public.messages
    FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Allow update own received messages"
    ON public.messages
    FOR UPDATE
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "Allow read message reactions"
    ON public.message_reactions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.messages m
        WHERE m.id = public.message_reactions.message_id
          AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
      ) OR auth.uid() = user_id
    );

CREATE POLICY "Allow insert own reactions"
    ON public.message_reactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow update own reactions"
    ON public.message_reactions
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Allow delete own reactions"
    ON public.message_reactions
    FOR DELETE
    USING (auth.uid() = user_id);

-- 9. Realtime publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 10. Seed admin user without deleting existing records.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new,
  recovery_token, email_change_token_current, phone_change, phone_change_token
)
VALUES (
  'da000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'admin@example.com',
  crypt('Leo_140606', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"username":"Admin"}',
  now(), now(),
  '', '', '', '', '', '', ''
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  updated_at = now(),
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

INSERT INTO public.profiles (id, username, role)
VALUES (
  'da000000-0000-0000-0000-000000000000',
  'Admin',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  role = EXCLUDED.role,
  last_seen = timezone('utc'::text, now());

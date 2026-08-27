-- Guest-to-Admin Anonymous Chat System SQL Schema (Clean slate recreation script)
-- ============================================================================
-- INSTRUCTIONS: Copy this entire file and paste it into Supabase SQL Editor, then click Run.
-- This script will reset and recreate all tables, triggers, and policies from scratch.
-- ============================================================================

-- 1. Drop all existing triggers on auth.users to prevent conflicts
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

-- 2. Drop existing functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_delete_user() CASCADE;
DROP FUNCTION IF EXISTS public.reset_user_password(UUID, TEXT) CASCADE;

-- 3. Drop tables cleanly to reset structures (CAUTION: Resets all chat history data)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 4. Create profiles table (Secure: No plain-text passwords stored)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    role TEXT CHECK (role IN ('guest', 'admin')) DEFAULT 'guest',
    is_pinned BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create messages table (with is_read check column, reply_to_id, editing, soft delete, and pinned)
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    is_pinned_chat BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5b. Create message_reactions table
CREATE TABLE public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(message_id, user_id, emoji)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- 6. Automatic Profile Creation Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 1;
BEGIN
  -- Get base username or fallback to generated ID
  base_username := COALESCE(new.raw_user_meta_data->>'username', 'User_' || substr(new.id::text, 1, 8));
  final_username := base_username;
  
  -- Resolve username collisions by appending a counter suffix
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || '_' || counter;
    counter := counter + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, role)
  VALUES (
    new.id,
    final_username,
    CASE 
      WHEN new.email = 'admin@example.com' THEN 'admin'
      ELSE 'guest'
    END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Profile Deletion Trigger (cascades to auth.users when admin deletes a profile)
CREATE OR REPLACE FUNCTION public.handle_delete_user()
RETURNS trigger AS $$
BEGIN
  -- Prevent infinite loops during cascade deletions
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = old.id) THEN
    DELETE FROM auth.users WHERE id = old.id;
  END IF;
  RETURN old;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_deleted
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();

-- 8. Secure Password Reset Function (allows admin to reset guest passwords)
CREATE OR REPLACE FUNCTION public.reset_user_password(target_user_id UUID, new_password TEXT)
RETURNS void AS $$
BEGIN
  -- Verify that the executing user is an Admin
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

-- 9. Row Level Security (RLS) Policies

-- Profiles: Allow all authenticated users to read profiles
-- (Simple, non-recursive policy to avoid infinite loop on self-referential EXISTS checks)
CREATE POLICY "Allow read profiles for authenticated users" 
    ON public.profiles 
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Profiles: Allow users to update their own profile details
CREATE POLICY "Allow update own profile" 
    ON public.profiles 
    FOR UPDATE 
    USING (auth.uid() = id);

-- Profiles: Allow admin to delete guest profiles
CREATE POLICY "Allow delete profiles for admins"
    ON public.profiles 
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    );

-- Messages: Allow users to read messages where they are the sender or receiver
CREATE POLICY "Allow read own messages" 
    ON public.messages 
    FOR SELECT 
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Messages: Allow users to send messages (insert) as themselves
CREATE POLICY "Allow insert own messages" 
    ON public.messages 
    FOR INSERT 
    WITH CHECK (auth.uid() = sender_id);

-- Messages: Allow updates on the messages table (for updating is_read status)
CREATE POLICY "Allow update own received messages"
    ON public.messages
    FOR UPDATE
    USING (auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = receiver_id);

-- 10. Enable Supabase Realtime for the messages table
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 11. Pre-provision the Admin User in Supabase Auth
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Delete old admin user if stuck in error states
DELETE FROM auth.users WHERE email = 'admin@example.com';

-- Insert admin user record (with default tokens pre-seeded as empty strings to avoid GoTrue crashes)
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
);

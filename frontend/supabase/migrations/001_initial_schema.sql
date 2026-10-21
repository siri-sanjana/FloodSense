-- ==============================================================================
-- FloodSense: Production Database Schema & Row-Level Security (RLS)
-- ==============================================================================

-- 1. Create enum for user roles
CREATE TYPE user_role AS ENUM ('responder', 'researcher', 'citizen', 'journalist');
CREATE TYPE severity_tier AS ENUM ('LOW', 'MODERATE', 'CRITICAL', 'CATASTROPHIC');

-- 2. User Profiles Table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'responder',
    region TEXT DEFAULT 'South Asia Riverine Basin',
    prefs JSONB NOT NULL DEFAULT '{"unit": "metric", "tone": "concise_tactical", "daylight_mode": false}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Chat Threads Table
CREATE TABLE public.chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Flood Reconnaissance',
    location_tag TEXT,
    severity severity_tier DEFAULT 'LOW',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Chat Messages Table
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    raw_image_url TEXT,
    mask_image_url TEXT,
    damage_stats JSONB,
    citations JSONB,
    region_context JSONB,
    proactive_notes JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Published / Community Reports Table
CREATE TABLE public.published_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'archived')),
    upvotes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for rapid querying
CREATE INDEX idx_threads_user_id ON public.chat_threads(user_id);
CREATE INDEX idx_messages_thread_id ON public.chat_messages(thread_id);
CREATE INDEX idx_published_visibility ON public.published_reports(visibility);

-- 6. Enable Row-Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_reports ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies: Profiles
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 8. RLS Policies: Chat Threads
CREATE POLICY "Users can view their own chat threads"
    ON public.chat_threads FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat threads"
    ON public.chat_threads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat threads"
    ON public.chat_threads FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat threads"
    ON public.chat_threads FOR DELETE
    USING (auth.uid() = user_id);

-- 9. RLS Policies: Chat Messages
CREATE POLICY "Users can view messages in their own threads"
    ON public.chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_threads
            WHERE public.chat_threads.id = public.chat_messages.thread_id
            AND public.chat_threads.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages into their own threads"
    ON public.chat_messages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_threads
            WHERE public.chat_threads.id = public.chat_messages.thread_id
            AND public.chat_threads.user_id = auth.uid()
        )
    );

-- 10. RLS Policies: Published Reports (Public feed)
CREATE POLICY "Anyone can view public published reports"
    ON public.published_reports FOR SELECT
    USING (visibility = 'public');

CREATE POLICY "Authors can insert published reports"
    ON public.published_reports FOR INSERT
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update or delete their published reports"
    ON public.published_reports FOR ALL
    USING (auth.uid() = author_id);

-- 11. Storage Bucket for Flood Reconnaissance Imagery
INSERT INTO storage.buckets (id, name, public)
VALUES ('flood-imagery', 'flood-imagery', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload flood images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'flood-imagery');

CREATE POLICY "Public read access for flood images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'flood-imagery');

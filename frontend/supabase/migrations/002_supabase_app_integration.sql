-- FloodSense app integration: create profiles on signup, persist report metadata,
-- and keep uploaded imagery private except for images attached to public reports.

ALTER TABLE public.published_reports
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Flood situation report',
    ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT 'Location not specified',
    ADD COLUMN IF NOT EXISTS author_role user_role NOT NULL DEFAULT 'responder',
    ADD COLUMN IF NOT EXISTS severity_score NUMERIC(4, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS severity_level severity_tier NOT NULL DEFAULT 'LOW',
    ADD COLUMN IF NOT EXISTS raw_image_url TEXT,
    ADD COLUMN IF NOT EXISTS mask_image_url TEXT,
    ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.handle_new_floodsense_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, name)
    VALUES (
        NEW.id,
        COALESCE(
            NULLIF(BTRIM(NEW.raw_user_meta_data ->> 'name'), ''),
            NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
            'FloodSense Operator'
        )
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_floodsense_auth_user_created ON auth.users;
CREATE TRIGGER on_floodsense_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_floodsense_user();

INSERT INTO public.profiles (id, name)
SELECT
    users.id,
    COALESCE(
        NULLIF(BTRIM(users.raw_user_meta_data ->> 'name'), ''),
        NULLIF(SPLIT_PART(COALESCE(users.email, ''), '@', 1), ''),
        'FloodSense Operator'
    )
FROM auth.users AS users
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_floodsense_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    UPDATE public.chat_threads
    SET updated_at = NOW()
    WHERE id = NEW.thread_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_floodsense_message_created ON public.chat_messages;
CREATE TRIGGER on_floodsense_message_created
    AFTER INSERT ON public.chat_messages
    FOR EACH ROW EXECUTE FUNCTION public.touch_floodsense_thread_on_message();

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Authors can insert published reports" ON public.published_reports;
DROP POLICY IF EXISTS "Authors can insert reports from their own assistant messages" ON public.published_reports;
CREATE POLICY "Authors can insert reports from their own assistant messages"
    ON public.published_reports FOR INSERT
    WITH CHECK (
        auth.uid() = author_id
        AND EXISTS (
            SELECT 1
            FROM public.chat_messages AS messages
            JOIN public.chat_threads AS threads ON threads.id = messages.thread_id
            WHERE messages.id = public.published_reports.message_id
              AND messages.role = 'assistant'
              AND threads.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Authors can update or delete their published reports" ON public.published_reports;
DROP POLICY IF EXISTS "Authors can delete their own published reports" ON public.published_reports;
CREATE POLICY "Authors can delete their own published reports"
    ON public.published_reports FOR DELETE
    USING (auth.uid() = author_id);

UPDATE storage.buckets
SET public = FALSE
WHERE id = 'flood-imagery';

DROP POLICY IF EXISTS "Authenticated users can upload flood images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own flood images" ON storage.objects;
CREATE POLICY "Users can upload their own flood images"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'flood-imagery'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Public read access for flood images" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own or public report images" ON storage.objects;
CREATE POLICY "Users can read their own or public report images"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'flood-imagery'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1
                FROM public.published_reports AS reports
                WHERE reports.visibility = 'public'
                  AND (
                      reports.raw_image_url = name
                      OR reports.mask_image_url = name
                  )
            )
        )
    );

DROP POLICY IF EXISTS "Users can delete their own flood images" ON storage.objects;
CREATE POLICY "Users can delete their own flood images"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'flood-imagery'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE OR REPLACE FUNCTION public.increment_published_report_upvotes(report_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_upvotes INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required to upvote reports.';
    END IF;

    UPDATE public.published_reports
    SET upvotes = upvotes + 1
    WHERE id = report_id
      AND visibility = 'public'
    RETURNING upvotes INTO updated_upvotes;

    IF updated_upvotes IS NULL THEN
        RAISE EXCEPTION 'Public report not found.';
    END IF;

    RETURN updated_upvotes;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_published_report_upvotes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_published_report_upvotes(UUID) TO authenticated;

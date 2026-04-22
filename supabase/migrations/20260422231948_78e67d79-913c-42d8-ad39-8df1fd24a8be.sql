ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS cover_url text;

-- Public storage bucket for AI-generated movie covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('script-covers', 'script-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access to covers
CREATE POLICY "Anyone can view covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'script-covers');

-- Owners can upload their own covers (folder = user id)
CREATE POLICY "Users upload own covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'script-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owners can replace their own covers
CREATE POLICY "Users update own covers"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'script-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Owners (or admins) can delete their covers
CREATE POLICY "Users delete own covers"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'script-covers'
  AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role))
);
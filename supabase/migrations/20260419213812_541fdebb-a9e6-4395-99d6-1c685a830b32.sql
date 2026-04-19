-- 1. File attachment columns on support_messages
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS file_size integer;

-- Allow body to be empty when there's a file
ALTER TABLE public.support_messages ALTER COLUMN body DROP NOT NULL;

-- 2. Storage bucket for chat attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Folder structure: {thread_id}/{filename}
-- Anyone who can see the thread can see the file
CREATE POLICY "View chat attachments in own threads"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Upload chat attachments to own threads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid() IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Delete own chat attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'chat-attachments'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.support_threads t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

-- 3. Plan grants audit table
CREATE TABLE public.plan_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier public.subscription_tier NOT NULL,
  duration_months integer NOT NULL,
  reason text NOT NULL,
  granted_by uuid NOT NULL,
  previous_tier public.subscription_tier,
  previous_period_end timestamptz,
  new_period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all grants"
ON public.plan_grants FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert grants"
ON public.plan_grants FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = granted_by);

CREATE POLICY "Users see own grant history"
ON public.plan_grants FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX idx_plan_grants_user ON public.plan_grants(user_id, created_at DESC);

-- 4. Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins insert any notification"
ON public.notifications FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- 5. Trigger: auto-notify on downgrade
CREATE OR REPLACE FUNCTION public.notify_on_downgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.tier <> 'free' AND NEW.tier = 'free' THEN
    INSERT INTO public.notifications (user_id, kind, title, body)
    VALUES (
      NEW.user_id,
      'subscription_downgraded',
      'Your ' || OLD.tier::text || ' plan has expired',
      'You''ve been moved to the Free plan. Renew anytime from the Pricing page to restore your benefits.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_downgrade ON public.subscriptions;
CREATE TRIGGER trg_notify_on_downgrade
AFTER UPDATE OF tier ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_downgrade();

-- 6. Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- 1. Support chat: messages between users and admins
CREATE TABLE public.support_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'Support request',
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_for_admin boolean NOT NULL DEFAULT true,
  unread_for_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('user','admin')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_thread ON public.support_messages(thread_id, created_at);
CREATE INDEX idx_support_threads_user ON public.support_threads(user_id, last_message_at DESC);

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Threads policies
CREATE POLICY "Users view own threads" ON public.support_threads
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create own threads" ON public.support_threads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own threads" ON public.support_threads
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Messages policies
CREATE POLICY "View messages in own threads" ON public.support_messages
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
CREATE POLICY "Send messages in own threads" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
    )
  );

-- Trigger: bump thread on new message
CREATE OR REPLACE FUNCTION public.bump_support_thread()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.support_threads SET
    last_message_at = NEW.created_at,
    updated_at = NEW.created_at,
    unread_for_admin = CASE WHEN NEW.sender_role = 'user' THEN true ELSE unread_for_admin END,
    unread_for_user  = CASE WHEN NEW.sender_role = 'admin' THEN true ELSE unread_for_user END
  WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_bump_thread AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_support_thread();

CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON public.support_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Realtime
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_threads REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;

-- 3. Auto-downgrade expired subscriptions
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS TABLE(expired_user_id uuid, previous_tier subscription_tier)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    UPDATE public.subscriptions
    SET tier = 'free', current_period_end = NULL, updated_at = now()
    WHERE tier <> 'free'
      AND current_period_end IS NOT NULL
      AND current_period_end < now()
    RETURNING user_id, 'pro'::subscription_tier AS prev
  )
  SELECT user_id, prev FROM expired;
END; $$;

-- 4. Grant admin role to two specific emails (idempotent)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users
WHERE email IN ('ahominedaiki75@gmail.com', 'bruhh.chrissyyyyy@gmail.com')
ON CONFLICT DO NOTHING;

-- 5. Enable pg_cron + pg_net for scheduled expiry
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Run expiry every hour
SELECT cron.schedule(
  'expire-subscriptions-hourly',
  '0 * * * *',
  $$ SELECT public.expire_subscriptions(); $$
);
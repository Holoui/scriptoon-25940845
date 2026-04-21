-- =====================================================================
-- 1) FOLLOWS
-- =====================================================================
CREATE TABLE public.user_follows (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid NOT NULL,
  followee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_follows_unique UNIQUE (follower_id, followee_id),
  CONSTRAINT user_follows_no_self CHECK (follower_id <> followee_id)
);
CREATE INDEX idx_user_follows_follower ON public.user_follows (follower_id);
CREATE INDEX idx_user_follows_followee ON public.user_follows (followee_id);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views follows"
  ON public.user_follows FOR SELECT USING (true);
CREATE POLICY "Users follow as themselves"
  ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users unfollow own follows"
  ON public.user_follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- =====================================================================
-- 2) BANS (admin-issued soft bans)
-- =====================================================================
CREATE TABLE public.user_bans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  reason text NOT NULL,
  banned_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own ban"
  ON public.user_bans FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage bans"
  ON public.user_bans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Helper: is this user currently banned?
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans
    WHERE user_id = _user_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- =====================================================================
-- 3) REPORTS
-- =====================================================================
CREATE TYPE public.report_status AS ENUM ('open', 'dismissed', 'actioned');

CREATE TABLE public.user_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid NOT NULL,
  reported_user_id uuid NOT NULL,
  post_id uuid,
  reason text NOT NULL,
  details text,
  status report_status NOT NULL DEFAULT 'open',
  admin_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_no_self CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX idx_user_reports_status ON public.user_reports (status, created_at DESC);
CREATE INDEX idx_user_reports_reported ON public.user_reports (reported_user_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users file own reports"
  ON public.user_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY "Users see own filed reports"
  ON public.user_reports FOR SELECT
  USING (auth.uid() = reporter_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage reports"
  ON public.user_reports FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete reports"
  ON public.user_reports FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- 4) PROFILE EXTRAS (bio etc) — profiles table is auth-owner-restricted,
--    so we add a sibling table that's publicly viewable for the profile page.
-- =====================================================================
CREATE TABLE public.profile_extras (
  user_id uuid NOT NULL PRIMARY KEY,
  display_name text,
  bio text,
  avatar_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone views profile extras"
  ON public.profile_extras FOR SELECT USING (true);
CREATE POLICY "Users insert own extras"
  ON public.profile_extras FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own extras"
  ON public.profile_extras FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create on signup (alongside profiles). Backfill existing users.
INSERT INTO public.profile_extras (user_id, display_name)
SELECT id, display_name FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.profile_extras (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  INSERT INTO public.subscriptions (user_id, tier) VALUES (NEW.id, 'free');

  RETURN NEW;
END; $function$;

-- =====================================================================
-- 5) SCRIPT MARKETPLACE LISTINGS
-- =====================================================================
CREATE TYPE public.listing_status AS ENUM ('active', 'sold', 'withdrawn');

CREATE TABLE public.script_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  script_id uuid NOT NULL,
  title text NOT NULL,
  pitch text NOT NULL,
  preview text,            -- short excerpt shown publicly
  genre text,
  price_ghs numeric NOT NULL CHECK (price_ghs >= 0),
  contact_phone text,
  contact_email text,
  status listing_status NOT NULL DEFAULT 'active',
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_script_listings_status ON public.script_listings (status, created_at DESC);
CREATE INDEX idx_script_listings_user ON public.script_listings (user_id);

ALTER TABLE public.script_listings ENABLE ROW LEVEL SECURITY;

-- Tier check: only Pro/Premium can list
CREATE OR REPLACE FUNCTION public.user_tier(_user_id uuid)
RETURNS subscription_tier
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT tier FROM public.subscriptions WHERE user_id = _user_id), 'free'::subscription_tier);
$$;

CREATE POLICY "Anyone views active listings"
  ON public.script_listings FOR SELECT
  USING (status = 'active' OR auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Pro and Premium create listings"
  ON public.script_listings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.user_tier(auth.uid()) IN ('pro'::subscription_tier, 'premium'::subscription_tier)
    AND NOT public.is_banned(auth.uid())
  );

CREATE POLICY "Owners update own listings"
  ON public.script_listings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners or admins delete listings"
  ON public.script_listings FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_script_listings_updated_at
BEFORE UPDATE ON public.script_listings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 6) NOTIFICATION TRIGGERS — like, comment, follow
-- =====================================================================

-- Like → notify post author
CREATE OR REPLACE FUNCTION public.notify_post_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_id uuid;
  post_title text;
  liker_name text;
BEGIN
  SELECT user_id, title INTO author_id, post_title
  FROM public.community_posts WHERE id = NEW.post_id;

  IF author_id IS NULL OR author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, email, 'Someone') INTO liker_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    author_id,
    'post_liked',
    COALESCE(liker_name, 'Someone') || ' liked your post',
    '"' || COALESCE(post_title, 'your post') || '" just got a new heart ❤️'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.notify_post_like();

-- Comment → notify post author
CREATE OR REPLACE FUNCTION public.notify_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  author_id uuid;
  post_title text;
  commenter_name text;
BEGIN
  SELECT user_id, title INTO author_id, post_title
  FROM public.community_posts WHERE id = NEW.post_id;

  IF author_id IS NULL OR author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  commenter_name := COALESCE(NEW.author_name, 'Someone');

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    author_id,
    'post_commented',
    commenter_name || ' commented on your post',
    '"' || COALESCE(post_title, 'your post') || '": ' || left(NEW.body, 140)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_post_comment();

-- Follow → notify followee
CREATE OR REPLACE FUNCTION public.notify_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower_name text;
BEGIN
  SELECT COALESCE(display_name, email, 'Someone') INTO follower_name
  FROM public.profiles WHERE id = NEW.follower_id;

  INSERT INTO public.notifications (user_id, kind, title, body)
  VALUES (
    NEW.followee_id,
    'new_follower',
    COALESCE(follower_name, 'Someone') || ' started following you',
    'Tap to view their profile.'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_follower
AFTER INSERT ON public.user_follows
FOR EACH ROW EXECUTE FUNCTION public.notify_new_follower();

-- =====================================================================
-- 7) Block banned users from posting/commenting via RLS tightening
-- =====================================================================
DROP POLICY IF EXISTS "Users publish own posts" ON public.community_posts;
CREATE POLICY "Users publish own posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));

DROP POLICY IF EXISTS "Users add own comments" ON public.post_comments;
CREATE POLICY "Users add own comments"
  ON public.post_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
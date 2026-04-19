CREATE TABLE public.script_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_script_generations_user_day ON public.script_generations (user_id, created_at);

ALTER TABLE public.script_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own generations"
ON public.script_generations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all generations"
ON public.script_generations FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

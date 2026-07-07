
-- ============ affiliates ============
CREATE TABLE public.affiliates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.affiliates TO authenticated;
GRANT SELECT ON public.affiliates TO anon; -- allow code lookup at signup
GRANT ALL ON public.affiliates TO service_role;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can look up a referral code" ON public.affiliates FOR SELECT USING (true);
CREATE POLICY "Users can join as affiliate" ON public.affiliates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their affiliate row" ON public.affiliates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_affiliates_updated BEFORE UPDATE ON public.affiliates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ referrals ============
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_referrals_affiliate ON public.referrals(affiliate_user_id);
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view their referrals" ON public.referrals FOR SELECT TO authenticated
USING (auth.uid() = affiliate_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can record themselves as referred" ON public.referrals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = referred_user_id AND affiliate_user_id <> auth.uid());

-- ============ affiliate_earnings ============
CREATE TABLE public.affiliate_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'GHS',
  status text NOT NULL DEFAULT 'available', -- available | paid
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_earnings_affiliate ON public.affiliate_earnings(affiliate_user_id);
GRANT SELECT ON public.affiliate_earnings TO authenticated;
GRANT ALL ON public.affiliate_earnings TO service_role;
ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view their earnings" ON public.affiliate_earnings FOR SELECT TO authenticated
USING (auth.uid() = affiliate_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update earnings" ON public.affiliate_earnings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ withdrawal_requests ============
CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 50),
  currency text NOT NULL DEFAULT 'GHS',
  provider text NOT NULL CHECK (provider IN ('mtn','telecel','airtel')),
  phone_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | paid | rejected
  admin_note text,
  processed_by uuid REFERENCES auth.users(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_withdrawals_affiliate ON public.withdrawal_requests(affiliate_user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawal_requests(status);
GRANT SELECT, INSERT ON public.withdrawal_requests TO authenticated;
GRANT UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Affiliates view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated
USING (auth.uid() = affiliate_user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Affiliates request withdrawal" ON public.withdrawal_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = affiliate_user_id);
CREATE POLICY "Admins update withdrawals" ON public.withdrawal_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_withdrawals_updated BEFORE UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ commission trigger on payments ============
CREATE OR REPLACE FUNCTION public.credit_affiliate_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_row public.referrals%ROWTYPE;
  commission numeric(12,2);
BEGIN
  IF NEW.status = 'successful' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'successful') THEN
    SELECT * INTO ref_row FROM public.referrals WHERE referred_user_id = NEW.user_id;
    IF FOUND THEN
      commission := ROUND(NEW.amount * 0.03, 2);
      INSERT INTO public.affiliate_earnings (affiliate_user_id, referred_user_id, payment_id, amount, currency)
      VALUES (ref_row.affiliate_user_id, NEW.user_id, NEW.id, commission, COALESCE(NEW.currency,'GHS'))
      ON CONFLICT (payment_id) DO NOTHING;

      INSERT INTO public.notifications (user_id, kind, title, body)
      VALUES (ref_row.affiliate_user_id, 'affiliate_earning',
              'You earned ' || COALESCE(NEW.currency,'GHS') || ' ' || commission::text,
              'A referral just upgraded. Your commission is now available to withdraw.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payments_affiliate_credit
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.credit_affiliate_on_payment();

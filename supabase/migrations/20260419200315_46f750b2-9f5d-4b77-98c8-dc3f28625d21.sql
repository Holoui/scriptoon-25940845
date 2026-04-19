-- Allow users to insert their own pending payment records
CREATE POLICY "Users insert own payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Allow admins to update payment status (approve / reject)
CREATE POLICY "Admins update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow admins to insert subscriptions (in case trigger missed an older user)
CREATE POLICY "Admins insert subscriptions"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
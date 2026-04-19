CREATE POLICY "Admins delete generations"
ON public.script_generations FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
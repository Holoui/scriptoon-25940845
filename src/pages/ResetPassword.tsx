import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Film } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Supabase puts a recovery token in the URL hash and signs in a temporary
    // session. We just wait until that session is available.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't update password", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Password updated", description: "You can now sign in with your new password." });
    navigate("/dashboard");
  };

  return (
    <Layout>
      <div className="container py-12 md:py-20">
        <div className="max-w-md mx-auto">
          <Link to="/" className="flex items-center justify-center gap-2 mb-8 font-display text-2xl font-black">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-hero text-white shadow-playful">
              <Film className="h-5 w-5" />
            </span>
            <span className="bg-gradient-hero bg-clip-text text-transparent">ScriptToon</span>
          </Link>
          <Card className="p-6 md:p-8 shadow-playful bg-gradient-card border-border/60 animate-fade-in">
            <div className="space-y-1 mb-6">
              <h1 className="font-display text-2xl font-bold">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">
                {ready ? "Enter and confirm your new password below." : "Validating your reset link…"}
              </p>
            </div>
            {ready ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw-new">New password</Label>
                  <Input id="pw-new" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-confirm">Confirm password</Label>
                  <Input id="pw-confirm" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-11" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default ResetPassword;

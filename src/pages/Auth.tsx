import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Film } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"tabs" | "forgot">("tabs");

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't send reset email", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Check your email", description: "We sent you a password reset link." });
    setMode("tabs");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Welcome back!" });
    navigate("/dashboard");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl, data: { display_name: name } },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Check your email", description: "Confirm your address to log in." });
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
            {mode === "forgot" ? (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-bold">Reset your password</h2>
                  <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-forgot">Email</Label>
                  <Input id="email-forgot" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
                </div>
                <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-11" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
                <button type="button" onClick={() => setMode("tabs")} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                  Back to sign in
                </button>
              </form>
            ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 mb-6 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-in">Email</Label>
                    <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-in">Password</Label>
                    <Input id="pw-in" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div className="flex justify-end -mt-2">
                    <button type="button" onClick={() => setMode("forgot")} className="text-sm text-primary hover:underline">
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-11" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign in
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name-up">Display name</Label>
                    <Input id="name-up" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">Email</Label>
                    <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pw-up">Password</Label>
                    <Input id="pw-up" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full bg-gradient-hero text-white border-0 hover:opacity-90 h-11" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create account
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Auth;

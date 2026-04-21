import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

interface Props {
  targetUserId: string;
  size?: "sm" | "default";
  onChange?: (isFollowing: boolean) => void;
}

export function FollowButton({ targetUserId, size = "sm", onChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user || user.id === targetUserId) { setLoading(false); return; }
      const { data } = await supabase
        .from("user_follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("followee_id", targetUserId)
        .maybeSingle();
      if (!cancelled) {
        setFollowing(!!data);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user, targetUserId]);

  if (!user) {
    return (
      <Button size={size} variant="outline" onClick={() => navigate("/auth")}>
        <UserPlus className="mr-2 h-4 w-4" /> Follow
      </Button>
    );
  }
  if (user.id === targetUserId) return null;

  const toggle = async () => {
    setBusy(true);
    if (following) {
      await supabase.from("user_follows").delete().eq("follower_id", user.id).eq("followee_id", targetUserId);
      setFollowing(false);
      onChange?.(false);
    } else {
      const { error } = await supabase.from("user_follows").insert({ follower_id: user.id, followee_id: targetUserId });
      if (error && !error.message.includes("duplicate")) {
        toast({ title: "Couldn't follow", description: error.message, variant: "destructive" });
      } else {
        setFollowing(true);
        onChange?.(true);
      }
    }
    setBusy(false);
  };

  return (
    <Button
      size={size}
      variant={following ? "outline" : "default"}
      className={following ? "" : "bg-gradient-hero text-white border-0 hover:opacity-90"}
      onClick={toggle}
      disabled={busy || loading}
    >
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
        following ? <><UserCheck className="mr-2 h-4 w-4" /> Following</> :
                    <><UserPlus className="mr-2 h-4 w-4" /> Follow</>}
    </Button>
  );
}
import { supabase } from "@/integrations/supabase/client";

/** Returns how many events of `kind` the user has logged in the last 24h. */
export async function countUsage24h(userId: string, kind: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("usage_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since);
  return count ?? 0;
}

/** Returns the timestamp the cooldown resets (24h after the OLDEST event), or null. */
export async function nextResetAt(userId: string, kind: string): Promise<Date | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(1);
  const oldest = data?.[0]?.created_at;
  return oldest ? new Date(new Date(oldest).getTime() + 24 * 60 * 60 * 1000) : null;
}

export async function logUsage(userId: string, kind: string): Promise<void> {
  await supabase.from("usage_events").insert({ user_id: userId, kind });
}

export const USAGE_KINDS = {
  watermarkRemoved: "watermark_removed_export",
  freeExtend: "free_extend",
  coverGeneration: "cover_generation",
  nsfwGeneration: "nsfw_generation",
} as const;
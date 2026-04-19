import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Thread {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_user: boolean;
}
interface Msg {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
}

export const SupportChat = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("support_threads")
      .select("id, subject, status, last_message_at, unread_for_user")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });
    const list = (data as Thread[]) ?? [];
    setThreads(list);
    setUnread(list.filter((t) => t.unread_for_user).length);
    if (!activeId && list[0]) setActiveId(list[0].id);
  };

  const loadMessages = async (tid: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
    // mark read
    await supabase.from("support_threads").update({ unread_for_user: false }).eq("id", tid);
  };

  useEffect(() => { loadThreads(); }, [user]);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`support-user-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload: any) => {
        if (payload.new?.thread_id === activeId) {
          setMessages((prev) => [...prev.filter((m) => m.id !== payload.new.id), payload.new]);
        }
        loadThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startThread = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, subject: "New conversation" })
      .select()
      .single();
    if (error) { toast({ title: "Couldn't start chat", description: error.message, variant: "destructive" }); return; }
    setActiveId(data.id);
    loadThreads();
  };

  const send = async () => {
    if (!user || !draft.trim()) return;
    let tid = activeId;
    if (!tid) {
      const { data, error } = await supabase
        .from("support_threads")
        .insert({ user_id: user.id, subject: draft.slice(0, 60) })
        .select()
        .single();
      if (error) { toast({ title: "Couldn't start chat", variant: "destructive" }); return; }
      tid = data.id;
      setActiveId(tid);
    }
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      thread_id: tid, sender_id: user.id, sender_role: "user", body: draft.trim(),
    });
    setSending(false);
    if (error) { toast({ title: "Send failed", description: error.message, variant: "destructive" }); return; }
    setDraft("");
    loadMessages(tid);
    loadThreads();
  };

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-hero text-white border-0 shadow-playful hover:opacity-90"
          aria-label="Support chat"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] grid place-items-center font-bold">
              {unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-5 border-b">
          <SheetTitle>Chat with support</SheetTitle>
          <p className="text-xs text-muted-foreground">We usually reply within a few hours.</p>
        </SheetHeader>

        {threads.length > 1 && (
          <div className="px-5 py-2 border-b flex gap-2 overflow-x-auto">
            {threads.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={activeId === t.id ? "default" : "outline"}
                onClick={() => setActiveId(t.id)}
                className="shrink-0"
              >
                {t.subject.slice(0, 20)} {t.unread_for_user && <Badge className="ml-1 h-4 px-1">!</Badge>}
              </Button>
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-muted/30">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Send a message to start chatting with the team.
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                <Card className={`px-3 py-2 max-w-[80%] ${m.sender_role === "user" ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${m.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </Card>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button onClick={send} disabled={sending || !draft.trim()} className="bg-gradient-hero text-white border-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

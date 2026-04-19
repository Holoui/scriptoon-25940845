import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, MessageCircle, Paperclip, X, FileIcon, Image as ImageIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Thread {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  unread_for_admin: boolean;
}
interface Msg {
  id: string; thread_id: string; sender_id: string;
  sender_role: "user" | "admin"; body: string | null; created_at: string;
  file_url?: string | null; file_name?: string | null; file_type?: string | null; file_size?: number | null;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const AdminChatPanel = ({ profiles }: { profiles: any[] }) => {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = async () => {
    const { data } = await supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false });
    setThreads((data as Thread[]) ?? []);
  };

  const loadMessages = async (tid: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("thread_id", tid)
      .order("created_at", { ascending: true });
    setMessages((data as Msg[]) ?? []);
    await supabase.from("support_threads").update({ unread_for_admin: false }).eq("id", tid);
    loadThreads();
  };

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);

  useEffect(() => {
    const ch = supabase
      .channel("support-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload: any) => {
        if (payload.new?.thread_id === activeId) {
          setMessages((prev) => [...prev.filter((m) => m.id !== payload.new.id), payload.new]);
        }
        loadThreads();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Max 10 MB", variant: "destructive" });
      return;
    }
    setPendingFile(f);
  };

  const send = async () => {
    if (!user || !activeId || (!draft.trim() && !pendingFile)) return;
    setSending(true);
    try {
      let file_url: string | null = null;
      let file_name: string | null = null;
      let file_type: string | null = null;
      let file_size: number | null = null;

      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() || "bin";
        const path = `${activeId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("chat-attachments")
          .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
        if (upErr) {
          toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
          return;
        }
        file_url = path;
        file_name = pendingFile.name;
        file_type = pendingFile.type;
        file_size = pendingFile.size;
      }

      const { error } = await supabase.from("support_messages").insert({
        thread_id: activeId,
        sender_id: user.id,
        sender_role: "admin",
        body: draft.trim() || null,
        file_url, file_name, file_type, file_size,
      });
      if (error) { toast({ title: "Send failed", description: error.message, variant: "destructive" }); return; }
      setDraft("");
      setPendingFile(null);
      loadMessages(activeId);
    } finally {
      setSending(false);
    }
  };

  const profileFor = (uid: string) => profiles.find((p) => p.id === uid);
  const unreadCount = threads.filter((t) => t.unread_for_admin).length;

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4 h-[600px]">
      <Card className="p-0 overflow-hidden flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <p className="font-semibold text-sm">Conversations</p>
          {unreadCount > 0 && <Badge className="bg-destructive text-destructive-foreground">{unreadCount} new</Badge>}
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No conversations yet</p>
          )}
          {threads.map((t) => {
            const prof = profileFor(t.user_id);
            return (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${activeId === t.id ? "bg-muted" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm truncate">{prof?.display_name ?? prof?.email ?? "Unknown"}</p>
                  {t.unread_for_admin && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(t.last_message_at).toLocaleString()}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden flex flex-col">
        {activeId ? (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {messages.map((m) => <AdminBubble key={m.id} msg={m} />)}
            </div>
            {pendingFile && (
              <div className="px-3 pt-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm">
                  {pendingFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
                  <span className="truncate flex-1">{pendingFile.name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPendingFile(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            <div className="p-3 border-t flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
              <Button type="button" size="icon" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply…"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <Button onClick={send} disabled={sending || (!draft.trim() && !pendingFile)} className="bg-gradient-hero text-white border-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-muted-foreground text-sm">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              Select a conversation to start replying
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

const AdminBubble = ({ msg }: { msg: Msg }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isMine = msg.sender_role === "admin";

  useEffect(() => {
    let cancelled = false;
    if (msg.file_url) {
      supabase.storage.from("chat-attachments").createSignedUrl(msg.file_url, 3600)
        .then(({ data }) => { if (!cancelled && data) setSignedUrl(data.signedUrl); });
    }
    return () => { cancelled = true; };
  }, [msg.file_url]);

  const isImage = msg.file_type?.startsWith("image/");

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <Card className={`px-3 py-2 max-w-[80%] ${isMine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
        {msg.file_url && signedUrl && (
          isImage ? (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="block mb-2">
              <img src={signedUrl} alt={msg.file_name ?? "attachment"} className="rounded max-w-full max-h-60 object-cover" />
            </a>
          ) : (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" download={msg.file_name ?? undefined}
              className={`flex items-center gap-2 text-sm underline mb-2 ${isMine ? "" : "text-primary"}`}>
              <FileIcon className="h-4 w-4" />
              <span className="truncate">{msg.file_name}</span>
            </a>
          )
        )}
        {msg.body && <p className="text-sm whitespace-pre-wrap">{msg.body}</p>}
        <p className={`text-[10px] mt-1 ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </Card>
    </div>
  );
};

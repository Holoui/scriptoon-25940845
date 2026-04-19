import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MessageCircle, Send, Loader2, Paperclip, X, FileIcon, Image as ImageIcon } from "lucide-react";
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
  body: string | null;
  created_at: string;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const SupportChat = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    await supabase.from("support_threads").update({ unread_for_user: false }).eq("id", tid);
  };

  useEffect(() => { loadThreads(); }, [user]);
  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId]);

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

  const ensureThread = async (subject: string): Promise<{ id: string; isNew: boolean } | null> => {
    if (activeId) return { id: activeId, isNew: false };
    if (!user) return null;
    const { data, error } = await supabase
      .from("support_threads")
      .insert({ user_id: user.id, subject })
      .select()
      .single();
    if (error) {
      toast({ title: "Couldn't start chat", description: error.message, variant: "destructive" });
      return null;
    }
    setActiveId(data.id);
    return { id: data.id as string, isNew: true };
  };

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
    if (!user || (!draft.trim() && !pendingFile)) return;
    setSending(true);
    try {
      const result = await ensureThread(draft.slice(0, 60) || pendingFile?.name?.slice(0, 60) || "New conversation");
      if (!result) return;
      const tid = result.id;

      let file_url: string | null = null;
      let file_name: string | null = null;
      let file_type: string | null = null;
      let file_size: number | null = null;

      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() || "bin";
        const path = `${tid}/${crypto.randomUUID()}.${ext}`;
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
        thread_id: tid,
        sender_id: user.id,
        sender_role: "user",
        body: draft.trim() || null,
        file_url,
        file_name,
        file_type,
        file_size,
      });
      if (error) {
        toast({ title: "Send failed", description: error.message, variant: "destructive" });
        return;
      }

      // Notify admins on new threads only
      if (result.isNew) {
        supabase.functions.invoke("notify-admins", {
          body: {
            kind: "new_chat_thread",
            userEmail: user.email,
            details: { subject: draft.slice(0, 60) || pendingFile?.name || "New conversation", preview: draft.trim().slice(0, 200) },
          },
        }).catch(() => {});
      }

      setDraft("");
      setPendingFile(null);
      loadMessages(tid);
      loadThreads();
    } finally {
      setSending(false);
    }
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
          <p className="text-xs text-muted-foreground">We usually reply within a few hours. Attach screenshots up to 10 MB.</p>
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
              <ChatBubble key={m.id} msg={m} />
            ))
          )}
        </div>

        {pendingFile && (
          <div className="px-4 pt-2 pb-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-sm">
              {pendingFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileIcon className="h-4 w-4 shrink-0" />}
              <span className="truncate flex-1">{pendingFile.name}</span>
              <span className="text-xs text-muted-foreground">{(pendingFile.size / 1024).toFixed(0)} KB</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPendingFile(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="p-4 border-t flex gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending}
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <Button onClick={send} disabled={sending || (!draft.trim() && !pendingFile)} className="bg-gradient-hero text-white border-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const ChatBubble = ({ msg }: { msg: Msg }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const isMine = msg.sender_role === "user";

  useEffect(() => {
    let cancelled = false;
    if (msg.file_url) {
      supabase.storage
        .from("chat-attachments")
        .createSignedUrl(msg.file_url, 3600)
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
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={msg.file_name ?? undefined}
              className={`flex items-center gap-2 text-sm underline mb-2 ${isMine ? "" : "text-primary"}`}
            >
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

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: string;
  reportedUserName?: string;
  postId?: string;
}

const REASONS = [
  { value: "spam", label: "Spam or misleading content" },
  { value: "harassment", label: "Harassment or hate speech" },
  { value: "plagiarism", label: "Plagiarism or copyright" },
  { value: "explicit", label: "Explicit / inappropriate content" },
  { value: "other", label: "Other" },
];

export function ReportUserDialog({ open, onOpenChange, reportedUserId, reportedUserName, postId }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) {
      toast({ title: "Sign in to report", variant: "destructive" });
      return;
    }
    if (user.id === reportedUserId) {
      toast({ title: "You can't report yourself", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("user_reports").insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      post_id: postId ?? null,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Couldn't submit report", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Report submitted", description: "Our admins will review it soon." });
    setDetails("");
    setReason("spam");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Flag className="h-4 w-4 text-destructive" /> Report {reportedUserName ?? "user"}</DialogTitle>
          <DialogDescription>Help us keep ScriptToon safe. Reports are confidential.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
            {REASONS.map((r) => (
              <div key={r.value} className="flex items-center gap-2">
                <RadioGroupItem value={r.value} id={`r-${r.value}`} />
                <Label htmlFor={`r-${r.value}`} className="cursor-pointer text-sm">{r.label}</Label>
              </div>
            ))}
          </RadioGroup>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Add any details that will help admins (optional)"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
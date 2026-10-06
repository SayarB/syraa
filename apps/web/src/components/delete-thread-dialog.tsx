import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChatThread } from "@/lib/types";

type Props = {
  /** The chat to delete; null keeps the dialog closed. */
  thread: ChatThread | null;
  onCancel: () => void;
  onConfirm: (thread: ChatThread) => Promise<void>;
};

export function DeleteThreadDialog({ thread, onCancel, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false);

  async function confirm() {
    if (!thread) return;
    setDeleting(true);
    try {
      await onConfirm(thread);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={thread !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete chat?</DialogTitle>
          <DialogDescription>
            “{thread?.title}” and all its messages will be deleted permanently. This can't be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

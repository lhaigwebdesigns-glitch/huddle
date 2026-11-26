import { useState } from "react";
import { Button } from "./ui";
import { Modal } from "./Modal";

export function FeedbackDialog({ room, uid, name, onClose }: { room: string; uid: string; name: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done)
    return (
      <Modal
        size="md"
        title="Thank you!"
        subtitle="Your feedback goes straight to the person building Cairn."
        onClose={onClose}
        footer={
          <>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="ledge-btn min-w-[140px]">
              Close
            </button>
          </>
        }
      >
        <p className="text-[15px] text-fg-muted">Every note gets read. If something was broken, it's on the list.</p>
      </Modal>
    );
  return (
    <Modal
      size="md"
      title="Send feedback"
      subtitle="What's working, what's confusing, what should Cairn do next?"
      onClose={onClose}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room, uid, name, rating: 0, comment: text, page: location.pathname }),
        }).catch(() => null);
        setBusy(false);
        setDone(true);
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          <button type="submit" disabled={!text.trim() || busy} className="ledge-btn min-w-[160px]">
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="text-[15px] font-semibold">Your feedback</span>
        <textarea
          autoFocus
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Your feedback"
          className="mt-2 w-full rounded-2xl border border-line-strong bg-bg p-4 text-[15px] outline-none focus:border-fg focus:ring-4 focus:ring-fg/10"
        />
      </label>
    </Modal>
  );
}

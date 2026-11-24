import { useState } from "react";

export function FeedbackDialog({ room, uid, name, onClose }: { room: string; uid: string; name: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2 className="text-lg font-semibold">Thank you! 💜</h2>
            <p className="mt-2 text-sm text-zinc-500">Your feedback goes straight to the team building Cairn.</p>
            <button onClick={onClose} className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-fg">Close</button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              await fetch("/api/feedback", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ room, uid, name, rating: 0, comment: text, page: location.pathname }),
              });
              setDone(true);
            }}
          >
            <h2 className="text-lg font-semibold">Send feedback</h2>
            <p className="mt-1 text-sm text-zinc-500">What's working, what's confusing, what should we build next?</p>
            <textarea
              autoFocus
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="mt-3 w-full rounded-lg border border-zinc-300 bg-transparent p-3 dark:border-zinc-700"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-zinc-600">Cancel</button>
              <button className="rounded-lg bg-primary px-4 py-2 text-primary-fg">Send</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

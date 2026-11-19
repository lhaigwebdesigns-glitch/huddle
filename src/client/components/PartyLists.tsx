import { useState } from "react";
import { Ban, UserMinus } from "lucide-react";
import { Button } from "./ui";
import type { Ban as BanT } from "../../shared/protocol";

export function timeAgo(t: number, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Shared by the dashboard sheet and the in-room settings. */
export function PartyLists({
  people,
  bans,
  onAct,
}: {
  people: { uid: string; name: string; color: string; online?: boolean; isHost?: boolean }[];
  bans: BanT[];
  onAct: (a: "kick" | "ban" | "unban", p: { uid: string; name: string }) => void;
}) {
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  return (
    <>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">People</h3>
      <ul className="mt-2 space-y-1" data-testid="party-people">
        {people.length === 0 && <li className="text-sm text-fg-muted">Nobody has joined yet.</li>}
        {people.map((p) => (
          <li key={p.uid} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent-soft/60">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: p.color }}>
              {p.name[0]?.toUpperCase()}
              {p.online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-emerald-500" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{p.name}{p.isHost && <span className="ml-1.5 text-xs font-normal text-fg-subtle">(host)</span>}</span>
              <span className="block text-xs text-fg-subtle">{p.online ? "In the room now" : "Not here right now"}</span>
            </span>
            {!p.isHost &&
              (confirmBan === p.uid ? (
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="danger" onClick={() => (setConfirmBan(null), onAct("ban", p))}>Ban</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmBan(null)}>Cancel</Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  {p.online && (
                    <Button size="sm" variant="ghost" onClick={() => onAct("kick", p)} title="Remove now (they can rejoin with the code)">
                      <UserMinus className="h-4 w-4" /> Kick
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => setConfirmBan(p.uid)} title="Remove and block from rejoining">
                    <Ban className="h-4 w-4" /> Ban
                  </Button>
                </span>
              ))}
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Banned</h3>
      <ul className="mt-2 space-y-1" data-testid="party-bans">
        {bans.length === 0 && <li className="text-sm text-fg-muted">No one is banned.</li>}
        {bans.map((b) => (
          <li key={b.uid} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft"><Ban className="h-4 w-4 text-fg-subtle" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{b.name}</span>
              <span className="block text-xs text-fg-subtle">{b.at ? `Banned ${timeAgo(b.at)}` : "Banned"}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => onAct("unban", b)}>Unban</Button>
          </li>
        ))}
      </ul>
    </>
  );
}


import { useState } from "react";

/** A person's picture, or their initial on their color when they have none (or it fails to load). */
export function PersonAvatar({
  name,
  color,
  avatar,
  className = "h-7 w-7 text-[12px]",
}: {
  name: string;
  color: string;
  avatar?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (avatar && !broken)
    return (
      <img
        src={avatar}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ boxShadow: `0 0 0 1.5px ${color}` }}
        aria-hidden
      />
    );
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`} style={{ background: color }} aria-hidden>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

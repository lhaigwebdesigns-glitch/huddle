/** A small Google Drive-style mark (three-color triangle), drawn here so no logo file is needed. */
export function DriveMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 21" className={className} aria-hidden="true">
      <path d="M8 0h8l8 14h-8z" fill="#ffba00" />
      <path d="M8 0 0 14l4 7 8-14z" fill="#0f9d58" />
      <path d="M4 21h16l4-7H8z" fill="#4285f4" />
    </svg>
  );
}

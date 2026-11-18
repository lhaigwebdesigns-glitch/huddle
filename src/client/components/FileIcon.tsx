import { AppWindow, ClipboardList, FileText, PenTool, Presentation, Table2, type LucideProps } from "lucide-react";
import type { FileKind } from "../../shared/files";

const ICONS: Record<FileKind, (p: LucideProps) => JSX.Element> = {
  doc: (p) => <FileText {...p} />,
  sheet: (p) => <Table2 {...p} />,
  slides: (p) => <Presentation {...p} />,
  whiteboard: (p) => <PenTool {...p} />,
  form: (p) => <ClipboardList {...p} />,
  artifact: (p) => <AppWindow {...p} />,
};

/** One consistent stroke icon per file kind (replaces the emoji in FILE_INFO for UI chrome). */
export function FileIcon({ kind, className = "h-4 w-4" }: { kind: FileKind; className?: string }) {
  const I = ICONS[kind] ?? ICONS.doc;
  return <I className={className} strokeWidth={1.75} aria-hidden="true" />;
}

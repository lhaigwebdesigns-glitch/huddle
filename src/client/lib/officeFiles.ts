/** Which Word and PowerPoint files Cairn can bring in (the importer itself loads on first use). */

export type OfficeKind = "doc" | "slides";
export const OFFICE_ACCEPT =
  ".docx,.pptx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function officeKind(file: File): OfficeKind | null {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "docx") return "doc";
  if (ext === "pptx") return "slides";
  return null;
}

/** "Unit 3 worksheet.docx" → "Unit 3 worksheet". */
export const officeTitle = (file: File) => file.name.replace(/\.(docx|pptx)$/i, "").trim().slice(0, 120) || "Imported file";

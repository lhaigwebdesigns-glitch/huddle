import { describe, expect, it } from "vitest";
import { downloadPlan } from "./googleDrive";

describe("bringing files in from Google Drive", () => {
  it("exports Google Docs as Word and Slides as PowerPoint", () => {
    expect(downloadPlan("application/vnd.google-apps.document", "Lab handout")).toMatchObject({ fileName: "Lab handout.docx", exportAs: expect.stringContaining("wordprocessingml") });
    expect(downloadPlan("application/vnd.google-apps.presentation", "WWI deck")).toMatchObject({ fileName: "WWI deck.pptx", exportAs: expect.stringContaining("presentationml") });
  });

  it("downloads Word and PowerPoint files as they are, without doubling the extension", () => {
    const docx = downloadPlan("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Essay.docx");
    expect(docx).toMatchObject({ exportAs: null, fileName: "Essay.docx" });
    expect(downloadPlan("application/vnd.openxmlformats-officedocument.presentationml.presentation", "Talk")?.fileName).toBe("Talk.pptx");
  });

  it("turns away other kinds of file and cleans unsafe names", () => {
    expect(downloadPlan("application/pdf", "Scan.pdf")).toBeNull();
    expect(downloadPlan("application/vnd.google-apps.spreadsheet", "Grades")).toBeNull();
    expect(downloadPlan("application/vnd.google-apps.document", 'a/b:c*"d')?.fileName).toBe("a b c d.docx");
    expect(downloadPlan("application/vnd.google-apps.document", "")?.fileName).toBe("Untitled.docx");
  });
});

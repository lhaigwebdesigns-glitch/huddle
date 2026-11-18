import type { Attachment } from "../../shared/protocol";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "../../shared/knowledge";

/** Pull the text out of a PDF in the browser (pdf.js, Apache-2.0; loaded only when needed). */
async function pdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
  }
  return pages.join("\n\n");
}

function guessType(f: File) {
  if (f.type && UPLOAD_TYPES[f.type]) return f.type;
  const ext = f.name.toLowerCase().split(".").pop();
  return ext === "md" ? "text/markdown" : ext === "csv" ? "text/csv" : ext === "txt" ? "text/plain" : f.type;
}

/** Upload one file to the room; text files are indexed so the AI can search them. */
export async function uploadFile(room: string, file: File): Promise<Attachment> {
  const type = guessType(file);
  if (!UPLOAD_TYPES[type]) throw new Error(`${file.name}: only images, PDFs, CSV and text files are supported.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 10 MB.`);
  const form = new FormData();
  form.set("file", new File([file], file.name, { type }));
  if (UPLOAD_TYPES[type].text) {
    try {
      form.set("text", type === "application/pdf" ? await pdfText(file) : await file.text());
    } catch {
      /* still upload the file even if text extraction fails */
    }
  }
  const res = await fetch(`/api/rooms/${room}/upload`, { method: "POST", body: form });
  const data = (await res.json()) as Attachment & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data;
}

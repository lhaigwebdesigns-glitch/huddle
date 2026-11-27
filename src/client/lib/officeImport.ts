import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import type { Identity } from "./identity";
import { uploadFile } from "./uploads";
import { applySlideOps, deckOf, slidesOf, type SlideOp } from "../../shared/slides-model";

/**
 * Bring a Word or PowerPoint file into Cairn: Word becomes a doc, PowerPoint becomes slides.
 * It all runs in the browser; pictures are uploaded to the room like any other image.
 */

export { OFFICE_ACCEPT, officeKind, officeTitle, type OfficeKind } from "./officeFiles";
import { officeKind } from "./officeFiles";
// Big decks are mostly photos, which get shrunk before upload; the file itself stays in this browser.
const MAX_BYTES = 150 * 1024 * 1024;

export interface ImportResult {
  /** What didn't come through, for a short note ("1 chart"). */
  skipped: string[];
}

/**
 * Big photos (a phone picture in a deck can be 5–15 MB) are scaled to at most 2000 px and saved
 * as WebP, so they upload fast and fit under the upload limit. Small ones and GIFs stay as they are.
 */
async function shrink(name: string, type: string, bytes: ArrayBuffer | Uint8Array): Promise<File> {
  const original = new File([bytes as BlobPart], name, { type });
  if (type === "image/gif" || original.size < 900_000 || typeof createImageBitmap !== "function") return original;
  try {
    const bmp = await createImageBitmap(original);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
    if (!blob || blob.size >= original.size) return original;
    return new File([blob], name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return original;
  }
}

async function uploadImage(room: string, name: string, type: string, bytes: ArrayBuffer | Uint8Array): Promise<string | null> {
  try {
    const a = await uploadFile(room, await shrink(name, type, bytes));
    return a.url;
  } catch {
    return null;
  }
}

/** Word → HTML the doc editor understands (headings, bold/italic/underline, lists, tables, pictures, links). */
async function docxHtml(room: string, file: File): Promise<{ html: string; skipped: string[] }> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  let missing = 0;
  let n = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: ["u => u", "strike => s", "p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
      convertImage: mammoth.images.imgElement(async (image: { contentType: string; readAsArrayBuffer: () => Promise<ArrayBuffer>; altText?: string }) => {
        const type = image.contentType;
        if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) {
          missing++;
          return { src: "" };
        }
        const url = await uploadImage(room, `picture-${++n}.${type.split("/")[1]}`, type, await image.readAsArrayBuffer());
        if (!url) missing++;
        return { src: url ?? "", ...(image.altText ? { alt: image.altText } : {}) };
      }),
    },
  );
  // Pictures that couldn't be kept leave no empty box behind.
  const html = result.value.replace(/<img[^>]*src=""[^>]*>/g, "");
  return { html, skipped: missing ? [`${missing} picture${missing === 1 ? "" : "s"}`] : [] };
}

/** Replace a doc's contents with this HTML, as one change. */
async function writeDoc(ydoc: Y.Doc, html: string) {
  const [{ Editor }, { default: Collaboration }, { docExtensions }] = await Promise.all([
    import("@tiptap/core"),
    import("@tiptap/extension-collaboration"),
    import("./docExtensions"),
  ]);
  const editor = new Editor({ extensions: [...docExtensions(), Collaboration.configure({ document: ydoc })] });
  editor.commands.setContent(html);
  editor.destroy();
}

async function pptxDeck(room: string, file: File, progress?: (note: string) => void) {
  const { readPptx } = await import("../../shared/pptx-import");
  return readPptx(await file.arrayBuffer(), {
    parse: (xml) => new DOMParser().parseFromString(xml, "application/xml"),
    image: (img) => uploadImage(room, img.name, img.type, img.bytes),
    progress: (p) => progress?.(p.stage === "slides" ? `Reading slide ${Math.min(p.done + 1, p.total)} of ${p.total}…` : p.total ? `Uploading pictures: ${p.done} of ${p.total}…` : "Saving…"),
  });
}

/** Wait until everything typed into the connection has been sent. */
async function flushed(provider: YProvider) {
  const ws = (provider as unknown as { ws?: WebSocket | null }).ws;
  // A big deck is a big first save: give it up to a minute to go out.
  for (let i = 0; i < 600 && ws && ws.bufferedAmount > 0; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 400));
}

/**
 * Import `file` into the room file `fileId` (a doc for Word, slides for PowerPoint), replacing
 * what's there. The importer is credited with it on the work record, like a paste.
 */
export async function importOffice(room: string, fileId: string, file: File, me: Identity, progress?: (note: string) => void): Promise<ImportResult> {
  const kind = officeKind(file);
  if (!kind) throw new Error("Pick a Word (.docx) or PowerPoint (.pptx) file.");
  if (file.size > MAX_BYTES) throw new Error("That file is over 150 MB. Try saving it with smaller pictures (in PowerPoint: File, Compress Pictures).");
  // Read the file first, so a broken file never touches the room.
  const doc = kind === "doc" ? await docxHtml(room, file) : null;
  const deck = kind === "slides" ? await pptxDeck(room, file, progress) : null;
  if (deck && !deck.slides.length) throw new Error("That PowerPoint has no slides.");

  const ydoc = new Y.Doc();
  const provider = new YProvider(location.host, `${room}--${fileId}`, ydoc, { party: "doc" });
  provider.awareness.setLocalStateField("user", { name: me.name, color: me.color, uid: me.uid });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Couldn't reach the file. Check your connection and try again.")), 15000);
      provider.on("sync", (s: boolean) => {
        if (!s) return;
        clearTimeout(t);
        resolve();
      });
    });
    progress?.("Saving…");
    if (doc) await writeDoc(ydoc, doc.html);
    if (deck) {
      const ops: SlideOp[] = [
        ...Array.from({ length: slidesOf(ydoc).length }, () => ({ op: "delete" as const, index: 1 })),
        ...deck.slides.map((slide) => ({ op: "insert" as const, slide })),
      ];
      applySlideOps(ydoc, ops);
      ydoc.transact(() => deckOf(ydoc).set("theme", "light"));
    }
    await flushed(provider);
  } finally {
    provider.destroy();
    ydoc.destroy();
  }
  return { skipped: doc?.skipped ?? deck?.skipped ?? [] };
}

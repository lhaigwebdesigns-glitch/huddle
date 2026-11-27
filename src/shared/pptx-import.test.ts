import { describe, expect, it } from "vitest";
import { DOMParser } from "@xmldom/xmldom";
import PptxGenJS from "pptxgenjs";
import { readPptx, resolvePart } from "./pptx-import";

// A 1×1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function deck() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in, like the canvas
  const s1 = pptx.addSlide();
  s1.background = { color: "0A100D" };
  s1.addText("Unit 3: Cells", { x: 1, y: 0.5, w: 8, h: 1, fontSize: 40, bold: true, color: "A9FDAC" });
  s1.addText("1. What does the nucleus do?\n2. Name two organelles.", { x: 1, y: 2, w: 8, h: 2, fontSize: 24, color: "FFFFFF" });
  s1.addShape("ellipse", { x: 10, y: 1, w: 2, h: 2, fill: { color: "44CF6C" } });
  s1.addImage({ data: `image/png;base64,${PNG}`, x: 10, y: 4, w: 2, h: 2 });
  s1.addNotes("Give them ten minutes.");
  const s2 = pptx.addSlide();
  s2.addTable(
    [
      [{ text: "Organelle" }, { text: "Job" }],
      [{ text: "Nucleus" }, { text: "" }],
    ],
    { x: 1, y: 1, w: 8 },
  );
  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;

describe("PowerPoint import", () => {
  it("finds parts next to the file that points at them", () => {
    expect(resolvePart("ppt/slides/slide1.xml", "../media/image1.png")).toBe("ppt/media/image1.png");
    expect(resolvePart("ppt/presentation.xml", "slides/slide2.xml")).toBe("ppt/slides/slide2.xml");
    expect(resolvePart("ppt/slides/slide1.xml", "/ppt/media/a.png")).toBe("ppt/media/a.png");
  });

  it("keeps each slide's text boxes, sizes, colors, shapes, pictures, background and notes", async () => {
    const images: string[] = [];
    const { slides, skipped } = await readPptx(await deck(), {
      parse,
      image: async (img) => {
        images.push(img.type);
        return "/api/rooms/ABC123/blobs/0123456789abcdef";
      },
    });
    expect(slides).toHaveLength(2);
    const [one, two] = slides;
    expect(one.layout).toBe("free");
    expect(one.notes).toContain("Give them ten minutes.");
    const els = one.elements ?? [];
    // The dark background becomes a full-slide box underneath everything.
    expect(els[0]).toMatchObject({ type: "rect", x: 0, y: 0, w: 960, h: 540, fill: "#0a100d" });
    const title = els.find((e) => e.type === "text" && e.text === "Unit 3: Cells");
    expect(title).toMatchObject({ color: "#a9fdac", bold: true });
    // 1 inch in on a 13.33 in slide → 72 px on the 960 px canvas; 40 pt → 40 px.
    expect(title!.x).toBeCloseTo(72, -1);
    expect(title!.size).toBeCloseTo(40, -1);
    const questions = els.find((e) => e.type === "text" && e.text?.includes("nucleus"));
    expect(questions?.text).toContain("\n");
    expect(questions?.color).toBe("#ffffff");
    expect(els.some((e) => e.type === "ellipse" && e.fill === "#44cf6c")).toBe(true);
    expect(els.find((e) => e.type === "image")?.src).toBe("/api/rooms/ABC123/blobs/0123456789abcdef");
    expect(images).toEqual(["image/png"]);
    // Tables come through as a text box, one row per line.
    const table = (two.elements ?? []).find((e) => e.type === "text");
    expect(table?.text?.split("\n")[0]).toMatch(/Organelle\s+\|\s+Job/);
    expect(skipped).toEqual([]);
  });

  it("keeps how text and shapes look: master styles, italic, underline, centering, fonts, outlines, corners, rotation", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.defineSlideMaster({
      title: "DARK",
      background: { color: "1E2A3A" },
      objects: [{ rect: { x: 0, y: 6.9, w: "100%", h: 0.6, fill: { color: "5EB1BF" } } }],
      slideNumber: { x: 12, y: 7, color: "FFFFFF" },
    });
    const s = pptx.addSlide({ masterName: "DARK" });
    s.addText("Centered and italic", { x: 1, y: 0.5, w: 11, h: 1.2, fontSize: 36, italic: true, align: "center", valign: "middle", color: "FFFFFF", fontFace: "Georgia" });
    s.addText("Underlined note", { x: 1, y: 2.5, w: 6, h: 0.6, fontSize: 18, underline: { style: "sng" }, color: "F5F5F5" });
    s.addShape("roundRect", { x: 8, y: 2.5, w: 3, h: 2, fill: { color: "44CF6C" }, line: { color: "0A100D", width: 2 }, rectRadius: 0.3 });
    s.addShape("rect", { x: 1, y: 4, w: 3, h: 1, fill: { color: "8FA6CB" }, rotate: 15 });
    const bytes = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    const { slides } = await readPptx(bytes, { parse });
    const els = slides[0].elements ?? [];
    expect(els[0]).toMatchObject({ type: "rect", w: 960, h: 540, fill: "#1e2a3a" });
    // The master's band shows on the slide.
    expect(els.some((e) => e.type === "rect" && e.fill === "#5eb1bf" && e.y > 480)).toBe(true);
    const title = els.find((e) => e.text === "Centered and italic");
    expect(title).toMatchObject({ italic: true, align: "center", valign: "middle", font: "Georgia", color: "#ffffff" });
    expect(els.find((e) => e.text === "Underlined note")).toMatchObject({ underline: true });
    const round = els.find((e) => e.type === "rect" && e.fill === "#44cf6c");
    expect(round?.radius).toBeGreaterThan(0);
    expect(round).toMatchObject({ stroke: "#0a100d" });
    expect(els.find((e) => e.type === "rect" && e.fill === "#8fa6cb")?.rot).toBe(15);
  });

  it("uploads pictures a few at a time and reports progress", async () => {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    for (let i = 0; i < 12; i++) {
      const s = pptx.addSlide();
      s.addText(`Slide ${i + 1}`, { x: 1, y: 0.5, w: 8, h: 1, fontSize: 32 });
      s.addImage({ data: `image/png;base64,${PNG}`, x: 1, y: 2, w: 4, h: 3 });
    }
    const bytes = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    let running = 0;
    let most = 0;
    const seen: string[] = [];
    const { slides } = await readPptx(bytes, {
      parse,
      image: async () => {
        running++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return "/api/rooms/ABC123/blobs/0123456789abcdef";
      },
      progress: (p) => seen.push(`${p.stage}:${p.done}/${p.total}`),
    });
    expect(slides).toHaveLength(12);
    expect(slides.every((s) => s.elements!.some((e) => e.type === "image" && e.src))).toBe(true);
    expect(seen).toContain("slides:12/12");
    expect(seen.some((x) => x.startsWith("pictures:"))).toBe(true);
    expect(most).toBeLessThanOrEqual(4);
  });

  it("says when pictures couldn't be kept", async () => {
    const { slides, skipped } = await readPptx(await deck(), { parse, image: async () => null });
    expect((slides[0].elements ?? []).some((e) => e.type === "image")).toBe(false);
    expect(skipped).toEqual(["1 picture"]);
  });

  it("refuses a file that isn't a PowerPoint", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(readPptx(await zip.generateAsync({ type: "uint8array" }), { parse })).rejects.toThrow(/PowerPoint/);
  });
});

/** Save generated content as a file in the browser. */
export function download(name: string, mime: string, content: BlobPart) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A file-name-safe version of a title. */
export function safeName(title: string, fallback = "file") {
  return title.replace(/[^\w\- ]+/g, "").trim() || fallback;
}

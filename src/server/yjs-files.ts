import * as Y from "yjs";
import { FILE_SCHEMA, type FileKind } from "../shared/files";

const cloneValue = (v: unknown) => (v instanceof Y.AbstractType ? (v as any).clone() : v);

/**
 * Make `target`'s content equal `source`'s for the shared types a file kind uses, as one
 * normal Yjs change. Connected editors simply see the content change, and the restore
 * itself can be undone by restoring a newer version.
 */
export function replaceContent(target: Y.Doc, source: Y.Doc, kind: FileKind, origin = "restore") {
  target.transact(() => {
    for (const { name, type } of FILE_SCHEMA[kind]) {
      if (type === "xml") {
        const t = target.getXmlFragment(name);
        const s = source.getXmlFragment(name);
        t.delete(0, t.length);
        t.insert(0, s.toArray().map(cloneValue) as any);
      } else if (type === "map") {
        const t = target.getMap(name);
        const s = source.getMap(name);
        for (const k of [...t.keys()]) t.delete(k);
        s.forEach((v, k) => t.set(k, cloneValue(v)));
      } else if (type === "array") {
        const t = target.getArray(name);
        const s = source.getArray(name);
        t.delete(0, t.length);
        t.insert(0, s.toArray().map(cloneValue));
      } else {
        const t = target.getText(name);
        const s = source.getText(name);
        t.delete(0, t.length);
        t.applyDelta(s.toDelta());
      }
    }
  }, origin);
}

/** A fresh Y.Doc holding the given encoded state. */
export function docFromState(state: Uint8Array): Y.Doc {
  const d = new Y.Doc();
  Y.applyUpdate(d, state);
  return d;
}

/** Split bytes into storage-sized chunks (Durable Object values have a size cap). */
export function chunk(bytes: Uint8Array, size = 512 * 1024): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out.length ? out : [new Uint8Array()];
}

export function unchunk(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

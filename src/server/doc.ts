import { YServer } from "y-partyserver";
import * as Y from "yjs";
import type { Env } from "./env";
import { readMarkdown, writeMarkdown } from "./markdown-yjs";

/**
 * One Durable Object per collaborative document ("<ROOMCODE>--<fileId>").
 * Humans edit through Tiptap + Yjs; the AI edits through the RPC methods below,
 * and everyone sees changes live.
 */
export class Doc extends YServer<Env> {
  static callbackOptions = { debounceWait: 1500, debounceMaxWait: 8000 };

  async onLoad() {
    const saved = await this.ctx.storage.get<Uint8Array>("ydoc");
    if (saved) {
      const d = new Y.Doc();
      Y.applyUpdate(d, new Uint8Array(saved));
      return d;
    }
  }

  async onSave() {
    await this.ctx.storage.put("ydoc", Y.encodeStateAsUpdate(this.document));
  }

  async setMarkdown(markdown: string, mode: "replace" | "append" = "replace") {
    writeMarkdown(this.document, markdown, mode);
    await this.onSave();
    return { ok: true };
  }

  async getMarkdown() {
    return readMarkdown(this.document);
  }
}

import { getServerByName } from "partyserver";
import type { Env } from "./env";

/**
 * Where uploads and AI images live. R2 when the bucket is bound (best: cheap, big files);
 * otherwise a Durable Object per file, which works on every free account with no setup.
 */
export interface StoredBlob {
  bytes: Uint8Array;
  type: string;
  name: string;
}

export async function putBlob(env: Env, key: string, bytes: Uint8Array, type: string, name: string) {
  if (env.FILES) {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: type }, customMetadata: { name } });
    return;
  }
  const stub = await getServerByName(env.Doc, `blob:${key}`);
  await stub.putBlob(bytes, type, name);
}

export async function getBlob(env: Env, key: string): Promise<StoredBlob | null> {
  if (env.FILES) {
    const obj = await env.FILES.get(key);
    if (!obj) return null;
    return {
      bytes: new Uint8Array(await obj.arrayBuffer()),
      type: obj.httpMetadata?.contentType ?? "application/octet-stream",
      name: obj.customMetadata?.name ?? "file",
    };
  }
  const stub = await getServerByName(env.Doc, `blob:${key}`);
  return (await stub.getBlob()) as StoredBlob | null;
}

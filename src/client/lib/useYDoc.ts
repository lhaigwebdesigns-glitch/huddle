import { useEffect, useState } from "react";
import * as Y from "yjs";
import YProvider from "y-partyserver/provider";
import type { Identity } from "./identity";

export interface YConn {
  ydoc: Y.Doc;
  provider: YProvider;
}

/**
 * Connect to one file's live Yjs document. Created inside an effect (not useMemo) so React
 * StrictMode's mount/unmount/mount doesn't leave us holding a destroyed provider.
 * `ready` flips once after the first sync and stays true, so editors never seed an empty
 * document that would then merge with the real content.
 */
export function useYDoc(room: string, fileId: string, me?: Identity) {
  const [conn, setConn] = useState<YConn | null>(null);
  const [synced, setSynced] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const ydoc = new Y.Doc();
    const provider = new YProvider(location.host, `${room}--${fileId}`, ydoc, { party: "doc" });
    if (me) provider.awareness.setLocalStateField("user", { name: me.name, color: me.color, uid: me.uid });
    const onSync = (s: boolean) => {
      setSynced(s);
      if (s) setReady(true);
    };
    provider.on("sync", onSync);
    setConn({ ydoc, provider });
    return () => {
      provider.off("sync", onSync);
      provider.destroy();
      ydoc.destroy();
      setConn(null);
    };
  }, [room, fileId, me?.uid, me?.name, me?.color]);
  return { conn: ready ? conn : null, synced };
}

/** Re-render whenever any of the given Yjs types change (deeply). */
export function useYObserve(types: (Y.AbstractType<any> | undefined)[]) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const live = types.filter(Boolean) as Y.AbstractType<any>[];
    const bump = () => setTick((t) => t + 1);
    live.forEach((t) => t.observeDeep(bump));
    return () => live.forEach((t) => t.unobserveDeep(bump));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, types);
}

/** Other people's awareness states (cursors, selections, presenter position…). */
export function usePeers(provider: YProvider | undefined) {
  const [peers, setPeers] = useState<{ clientId: number; state: any }[]>([]);
  useEffect(() => {
    if (!provider) return;
    const aw = provider.awareness;
    const update = () =>
      setPeers(
        [...aw.getStates().entries()]
          .filter(([id]) => id !== aw.clientID)
          .map(([clientId, state]) => ({ clientId, state })),
      );
    update();
    aw.on("change", update);
    return () => aw.off("change", update);
  }, [provider]);
  return peers;
}

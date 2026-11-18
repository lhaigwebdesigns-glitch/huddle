import type { ClientMsg } from "../../shared/protocol";

/**
 * Lets an editor send a room message (e.g. "copy these form responses to a sheet") without
 * threading the room socket through every component. The room page registers its sender.
 */
let sender: ((m: ClientMsg) => void) | null = null;

export function setEditorSender(fn: ((m: ClientMsg) => void) | null) {
  sender = fn;
}

export function sendFromEditor(m: ClientMsg) {
  sender?.(m);
}

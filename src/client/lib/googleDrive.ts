import { useEffect, useState } from "react";

/**
 * Bring a file in from Google Drive: Google's own file chooser (the Picker), with the narrowest
 * Drive permission there is (drive.file: only the files the person picks). Google Docs come
 * down as Word and Slides as PowerPoint, then go through the same import as an uploaded file.
 * Everything happens in the browser; nothing is stored on Cairn's server.
 */

export interface DriveConfig {
  apiKey: string;
  appId: string;
  clientId: string;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const GDOC = "application/vnd.google-apps.document";
const GSLIDES = "application/vnd.google-apps.presentation";

/** The kinds of Drive file Cairn can bring in. */
export const PICKABLE = [GDOC, GSLIDES, DOCX, PPTX];

/**
 * How to download a picked file: Google files are exported (Docs → .docx, Slides → .pptx);
 * Word and PowerPoint files download as they are. null = a kind Cairn can't bring in.
 */
export function downloadPlan(mimeType: string, name: string): { exportAs: string | null; fileName: string; type: string } | null {
  const base = (name || "Untitled").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Untitled";
  const withExt = (ext: string) => (base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`);
  if (mimeType === GDOC) return { exportAs: DOCX, fileName: withExt(".docx"), type: DOCX };
  if (mimeType === GSLIDES) return { exportAs: PPTX, fileName: withExt(".pptx"), type: PPTX };
  if (mimeType === DOCX) return { exportAs: null, fileName: withExt(".docx"), type: DOCX };
  if (mimeType === PPTX) return { exportAs: null, fileName: withExt(".pptx"), type: PPTX };
  return null;
}

// ---------- config (from /api/auth/providers; absent until the keys are set) ----------

let configP: Promise<DriveConfig | null> | null = null;
function loadConfig() {
  configP ??= fetch("/api/auth/providers")
    .then((r) => r.json() as Promise<{ drive?: DriveConfig | null }>)
    .then((d) => d.drive ?? null)
    .catch(() => null);
  return configP;
}

/** Whether "From Google Drive" can be offered. Also warms up Google's scripts so the popup opens on the click. */
export function useDrive(): DriveConfig | null {
  const [cfg, setCfg] = useState<DriveConfig | null>(null);
  useEffect(() => {
    let live = true;
    void loadConfig().then((c) => {
      if (!live || !c) return;
      setCfg(c);
      void loadScripts().catch(() => {});
    });
    return () => void (live = false);
  }, []);
  return cfg;
}

// ---------- Google's scripts ----------

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}
const script = (src: string) =>
  new Promise<void>((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => rej(new Error("Couldn't reach Google. Check your connection and try again."));
    document.head.appendChild(s);
  });
let scriptsP: Promise<void> | null = null;
function loadScripts() {
  scriptsP ??= Promise.all([script("https://accounts.google.com/gsi/client"), script("https://apis.google.com/js/api.js")])
    .then(() => new Promise<void>((res) => window.gapi.load("picker", () => res())))
    .catch((e) => {
      scriptsP = null;
      throw e;
    });
  return scriptsP;
}

// One Drive permission per page visit is enough; Google's popup only shows the first time.
let token: { value: string; until: number } | null = null;
function getToken(cfg: DriveConfig): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return Promise.resolve(token.value);
  return new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r: { access_token?: string; expires_in?: number; error?: string }) => {
        if (!r.access_token) return rej(new Error(r.error === "access_denied" ? "Google Drive wasn't allowed, so nothing was brought in." : "Google sign-in didn't finish. Try again."));
        token = { value: r.access_token, until: Date.now() + (r.expires_in ?? 3600) * 1000 };
        res(r.access_token);
      },
      error_callback: () => rej(new Error("The Google window was closed before it finished.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/**
 * Opens Google's file chooser and returns the picked file, ready for the Word/PowerPoint import.
 * null = they closed the chooser without picking. Call it straight from a click.
 */
export async function pickFromDrive(cfg: DriveConfig): Promise<File | null> {
  await loadScripts();
  const access = await getToken(cfg);
  const G = window.google;
  const picked = await new Promise<{ id: string; name: string; mimeType: string } | null>((res) => {
    const view = new G.picker.DocsView(G.picker.ViewId.DOCS).setMimeTypes(PICKABLE.join(",")).setIncludeFolders(true).setSelectFolderEnabled(false);
    new G.picker.PickerBuilder()
      .setTitle("Pick a Doc, Slides, Word or PowerPoint file")
      .setOAuthToken(access)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .addView(view)
      .setCallback((d: { action: string; docs?: { id: string; name: string; mimeType: string }[] }) => {
        if (d.action === G.picker.Action.PICKED && d.docs?.[0]) res(d.docs[0]);
        else if (d.action === G.picker.Action.CANCEL) res(null);
      })
      .build()
      .setVisible(true);
  });
  if (!picked) return null;
  const plan = downloadPlan(picked.mimeType, picked.name);
  if (!plan) throw new Error("Cairn can bring in Google Docs, Google Slides, Word and PowerPoint files.");
  const url = plan.exportAs
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}/export?mimeType=${encodeURIComponent(plan.exportAs)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(picked.id)}?alt=media`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(r.status === 403 ? "Google wouldn't send that file (it may be too big to export, or not shared with you)." : "Couldn't download that file from Drive.");
  return new File([await r.blob()], plan.fileName, { type: plan.type });
}

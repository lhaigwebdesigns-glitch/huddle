/**
 * Run a JavaScript snippet in a throwaway sandboxed iframe (scripts only, opaque origin: no
 * access to Cairn, cookies or storage) and collect console output. Killed after a timeout.
 */
export function runJs(code: string, timeoutMs = 5000): Promise<{ output: string; error?: string; ms: number }> {
  return new Promise((resolve) => {
    const token = Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.display = "none";
    const lines: string[] = [];
    const t0 = performance.now();
    let done = false;
    const finish = (error?: string) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      iframe.remove();
      resolve({ output: lines.join("\n").slice(0, 20_000), error, ms: Math.round(performance.now() - t0) });
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.data?.token !== token) return;
      if (e.data.type === "log") lines.push(String(e.data.text));
      if (e.data.type === "done") finish(e.data.error);
    };
    window.addEventListener("message", onMsg);
    const timer = setTimeout(() => finish(`Stopped after ${timeoutMs / 1000}s (infinite loop?)`), timeoutMs);
    const runner = `
      const T=${JSON.stringify(token)};
      const fmt=(v)=>{try{return typeof v==="string"?v:JSON.stringify(v,null,2)??String(v)}catch{return String(v)}};
      const send=(type,extra)=>parent.postMessage({token:T,type,...extra},"*");
      for(const k of ["log","info","warn","error","table"])console[k]=(...a)=>send("log",{text:(k==="error"||k==="warn"?k+": ":"")+a.map(fmt).join(" ")});
      (async()=>{try{const r=await (async()=>{${"\n"}${code.replace(/<\/script/gi, "<\\/script")}${"\n"}})();if(r!==undefined)send("log",{text:"→ "+fmt(r)});send("done",{})}catch(e){send("done",{error:String(e&&e.stack||e)})}})();`;
    iframe.srcdoc = `<!doctype html><script>${runner}</script>`;
    document.body.appendChild(iframe);
  });
}

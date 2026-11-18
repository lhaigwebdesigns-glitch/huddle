import { memo, useEffect, useId, useState } from "react";

/** Renders ```mermaid blocks as diagrams (Mermaid is MIT; loaded only when needed, strict mode). */
function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
        });
        const out = await mermaid.render(`m${id}${Date.now()}`, code);
        if (!cancelled) setSvg(out.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 250); // wait for streaming to settle
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id]);
  if (failed || !svg) return <CodeBlock className="language-mermaid">{code}</CodeBlock>;
  return (
    <div
      className="not-prose my-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      data-testid="mermaid"
      role="img"
      aria-label="Diagram"
      // Mermaid sanitizes its own output in strict mode.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-(\w+)/.exec(className ?? "")?.[1];
  const text = String(children ?? "").replace(/\n$/, "");
  return (
    <div className="not-prose my-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between bg-zinc-100 px-3 py-1 text-xs text-zinc-500 dark:bg-zinc-900">
        <span>{lang ?? "code"}</span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-zinc-50 p-3 text-sm dark:bg-zinc-950">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-zinc max-w-none text-[15px] dark:prose-invert prose-p:my-2 prose-pre:my-0 prose-headings:mt-4 prose-headings:mb-2 prose-li:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => {
            const inline = !className && !String(children).includes("\n");
            if (!inline && /language-mermaid/.test(className ?? "")) return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
            return inline ? (
              <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em] before:content-none after:content-none dark:bg-zinc-800" {...rest}>
                {children}
              </code>
            ) : (
              <CodeBlock className={className}>{children}</CodeBlock>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

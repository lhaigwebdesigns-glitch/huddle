import { ArrowUp, Globe, Paperclip, Plus, Settings, Users } from "lucide-react";
import { FileIcon } from "./FileIcon";

/** A static, faithful miniature of a Huddle room for the landing page. Decorative only. */
export function ProductShot() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-5xl select-none">
      <div className="overflow-hidden rounded-[22px] border border-line bg-bg shadow-[0_30px_80px_-20px_rgba(0,0,0,0.25),0_10px_24px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex h-9 items-center gap-1.5 border-b border-line bg-sidebar px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="mx-auto rounded-md bg-bg px-3 py-0.5 text-[11px] text-fg-subtle">huddle · Bake sale</span>
        </div>
        <div className="grid h-[420px] grid-cols-[180px_1fr] text-left md:grid-cols-[190px_1fr_1fr]">
          {/* Sidebar */}
          <div className="flex flex-col gap-4 border-r border-line bg-sidebar p-3 text-[12px]">
            <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-fg">
              <Plus className="h-3.5 w-3.5" /> New file
            </div>
            <div>
              <div className="px-2 pb-1 text-[10.5px] font-medium text-fg-subtle">Files</div>
              {[
                ["doc", "Bake sale plan", true],
                ["sheet", "Budget"],
                ["slides", "Pitch deck"],
                ["form", "Volunteer sign-up"],
              ].map(([k, t, active]) => (
                <div key={t as string} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${active ? "bg-accent-soft text-fg" : "text-fg-muted"}`}>
                  <FileIcon kind={k as any} className="h-3.5 w-3.5" /> {t}
                </div>
              ))}
            </div>
            <div>
              <div className="px-2 pb-1 text-[10.5px] font-medium text-fg-subtle">In the room · 3</div>
              {[
                ["Maya", "#e8590c"],
                ["Theo", "#2f9e44"],
                ["Sam", "#1c7ed6"],
              ].map(([n, c]) => (
                <div key={n} className="flex items-center gap-2 px-2 py-1 text-fg-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} /> {n}
                </div>
              ))}
            </div>
            <div className="mt-auto space-y-1 text-fg-muted">
              <div className="rounded-lg border border-dashed border-line-strong px-2 py-1.5 text-center font-mono text-[12px] tracking-[0.2em] text-fg">K7Q-29F</div>
              <div className="flex items-center gap-2 px-2 py-1">
                <Settings className="h-3.5 w-3.5" /> Room settings
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[12px]">
              <span className="font-semibold text-fg">Bake sale</span>
              <span className="flex items-center gap-1 text-fg-subtle">
                <Users className="h-3 w-3" /> 3 here
              </span>
            </div>
            <div className="flex-1 space-y-4 overflow-hidden px-4 py-4 text-[12.5px] leading-relaxed">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3 py-2 text-fg">
                  <span className="block text-[10.5px] font-medium text-fg-subtle">Maya</span>
                  Can you plan our bake sale for Saturday? Budget is $150.
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-3 py-2 text-fg">
                  <span className="block text-[10.5px] font-medium text-fg-subtle">Theo</span>
                  And check what sells best at school sales
                </div>
              </div>
              <div className="text-fg">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
                  <Globe className="h-3 w-3" /> Searched the web · 4 sources
                </div>
                Here's the plan, Maya. Brownies and cookies sell best, so they lead the menu. I made a{" "}
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-medium">Bake sale plan</span> doc and a budget sheet, Theo.
              </div>
            </div>
            <div className="m-3 rounded-2xl border border-line-strong px-3 py-2.5 text-[12px] text-fg-subtle">
              Message the room and the AI…
              <div className="mt-2 flex items-center justify-between">
                <Paperclip className="h-3.5 w-3.5" />
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <ArrowUp className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>

          {/* Doc panel */}
          <div className="hidden min-w-0 flex-col border-l border-line md:flex">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12px] font-medium text-fg">
              <FileIcon kind="doc" className="h-3.5 w-3.5" /> Bake sale plan
              <span className="ml-auto flex -space-x-1">
                <span className="h-4 w-4 rounded-full border-2 border-bg bg-[#e8590c]" />
                <span className="h-4 w-4 rounded-full border-2 border-bg bg-[#2f9e44]" />
              </span>
            </div>
            <div className="space-y-2.5 px-5 py-4 text-[12px] leading-relaxed text-fg-muted">
              <div className="text-[17px] font-semibold tracking-tight text-fg">Bake sale plan</div>
              <div className="text-[12.5px] font-semibold text-fg">Menu</div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Brownies: 48 pieces at $2</li>
                <li>
                  Chocolate chip cookies: 60 at $1<span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-[#e8590c]" />
                </li>
                <li>Lemon bars: 24 at $2.50</li>
              </ul>
              <div className="text-[12.5px] font-semibold text-fg">Schedule</div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Fri 6pm: baking at Theo's</li>
                <li>Sat 9am: set up by the gym</li>
              </ul>
              <div className="mt-3 h-2 w-3/4 rounded bg-surface-2" />
              <div className="h-2 w-1/2 rounded bg-surface-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

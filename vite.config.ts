import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { fileURLToPath } from "node:url";

// Workers AI is a "remote" binding: in local dev it needs a Cloudflare login.
// Run `npx wrangler login` once, then `HUDDLE_REMOTE=1 npm run dev` to use it locally.
// Without it, local dev still works with Groq/Cerebras/OpenRouter keys or MOCK_AI.
const remote = process.env.HUDDLE_REMOTE === "1" || !!process.env.CLOUDFLARE_API_TOKEN;

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ remoteBindings: remote })],
  // "@/" = src/client (shadcn + Bklit charts import through it).
  resolve: { alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) } },
});

# HANDOFF v3: mobile port of istefox/obsidian-mcp-connector

Branch `mobile-port` of `/home/claude/work/up` (upstream commit `dc227c4`, v3.0.1). Three commits: mobile load, lss-tools `d458d43`, search modal + reader. The container is ephemeral, so push or download the branch.

## Done
- **Loads on mobile** (`isDesktopOnly: false`). Node-only code is behind one lazy `import("./desktop")`, gated on `Platform.isDesktop` in `main.ts`. `SettingsTab.svelte` loads the server/client-config sections the same way, so mobile shows only the semantic-search settings.
- Three load-time blockers fixed (found by forcing every Node builtin to throw while loading the bundle):
  1. `packages/shared/src/logger.ts`: Node `fs/os/path` now in try/catch, console fallback.
  2. `policyProvider.ts`: `AsyncLocalStorage` falls back to a no-op store (mobile serves no MCP calls).
  3. `bun.config.ts`: `@huggingface/transformers` now resolves to `transformers.web.js`. The `node` build did `require("fs"|"path"|"url"|"stream")` at load. **This changes the desktop bundle too and is untested on real desktop.**
- Cherry-picked `lss-tools` `d458d43` (catch-up indexing after Obsidian was closed). Skipped `072852a` (Qwen3 model, too big).
- Human UI: `SemanticSearchModal` (`features/semantic-search/components/SearchModal.ts`), command "Semantic search" and a ribbon icon.
- `tools/termux-reader/vault-rag.mjs`: zero-dependency stdio/HTTP MCP server (`semantic_search`, `get_similar`, `fetch_note`).

## Verified here
- `tsc`, `svelte-check`, prod build pass. `bun test`: 2915 pass, 2 fail, the same 2 `probePort` failures (IPv6) as on unmodified main.
- Prod `main.js` loads with Node builtins throwing; mocked mobile `onload`/`onunload` succeed with semantic search wired and the server half unloaded. Mocked desktop `onload` also succeeds.
- Reader tested over stdio and HTTP against an index written by the plugin's own `EmbeddingStore`: `get_similar`, `fetch_note`, path traversal and `.obsidian` reads blocked.

## NOT verified (needs the phone)
- Real Obsidian Mobile: plugin enables, model downloads, WASM inference runs, index gets written. This sandbox cannot reach huggingface.co or cdn.jsdelivr.net, so no model ran anywhere.
- `semantic_search` in the reader (Node/Termux model load). Fallback: query via `get_similar`, or run the embed on the phone.
- Desktop regression from the web transformers build.
- Reader query vs plugin vectors: plugin may use a different default dtype (q8 vs fp32), expect tiny score drift.

## Local-only hacks, not committed
`bun install` failed on `obsidian-daily-notes-interface` pulling `obsidian` from api.github.com (403). I installed with a locally patched copy of that package via a temporary `overrides` entry, then reverted `package.json` and `bun.lock`. On a normal network `bun install` just works.

## Next
1. Build (`bun run build` in `packages/obsidian-plugin`), copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/mcp-tools-istefox/` on the phone, enable, run "Semantic search", watch the first index.
2. Commit the `embeddings/native-minilm-l6-v2/` folder, pull it on Termux, run the reader, register in PicoClaw.
3. If the model fails to download on the phone, check the WebView console first (CDN-pinned ORT wasm).

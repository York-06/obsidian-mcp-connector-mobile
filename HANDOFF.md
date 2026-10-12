# HANDOFF: mobile fork of istefox/obsidian-mcp-connector

You are working in `York-06/obsidian-mcp-connector-mobile` (branch `mobile-port`, also `main`). It is a fork of `istefox/obsidian-mcp-connector` v3.0.1 made so the plugin's on-device semantic search runs on **Obsidian Mobile** (Android, OnePlus 6T) and a Termux agent (PicoClaw) can read the same index. Read this file, then `git log --graph`. Skip anything not listed here; it was tried and is not needed.

## Who this is for, and the rules
Emmanuel (GitHub `York-06`) owns the project and tests on his phone. His rules for choosing tech:
- Popular, maintained software beats obscure software, even if it must be crammed onto mobile.
- No cloud embeddings; everything on-device. No telemetry, no paid tiers.
- `isDesktopOnly: true` is a flag, not a verdict; ask how hard the port is.
- Take existing code wherever possible. Credit whoever wrote it, in git history, not only in prose.
- Be terse with him; he is on a slow connection and limited usage. Ask only when blocked. Do not do code cleanup until tests run (he said "later, after successful tests").

## Why this plugin
Two interfaces were needed over one local index: a **human UI** (search inside Obsidian Mobile) and a **bot MCP interface** (Termux daemon for PicoClaw). Four plugins were read (Seek, Similar Notes, MCP Connector, Vault Retrieval); MCP Connector won on popularity (44,349 downloads, rank #375 of 8,639) and an index stored as plain vault files. Do not revisit the others. Already eliminated: Copilot, Smart Connections (AJSON files), Local REST API, Open Connections (`node:sqlite` blocks mobile), QMD.

## Status table (MCP Connector, after our changes)
| Row | Value | Confidence |
|---|---|---|
| Downloads (rank of 8,639) | 44,349 (#375) | from Obsidian's community-plugin-stats.json |
| Version, license | 3.0.1 upstream, MIT | read |
| Runs on mobile | Loads in simulation (all Node builtins forced to throw; mocked `onload`/`onunload`). **Not run on a real phone.** | simulated |
| Human UI | `SemanticSearchModal`: command "Semantic search" + ribbon icon, opens note at matching line | typechecks, not run in Obsidian |
| Bot / MCP interface | Desktop: upstream in-plugin HTTP server. Mobile/Termux: `tools/termux-reader/vault-rag.mjs` (stdio or HTTP) | reader tested on a fixture only |
| Where embeddings live | `<vault>/.obsidian/plugins/mcp-tools-istefox/embeddings/native-minilm-l6-v2/embeddings.seg0..15.bin` + `.index.json`, `mtimes.json`, `embeddings.meta.json` | read, round-trip tested |
| Vector format | Float32, 384-d, L2-normalised, format version 4; chunk text is not stored, re-read from the note at `offset` | read |
| Granularity | Chunks: `chunkId, filePath, offset, heading, contentHash` | read |
| Embedding compute | `Xenova/all-MiniLM-L6-v2` via Transformers.js, mean pooling, WASM (web build of the library) | read; **never run** |

Rows still to fill (need the phone): first-index time on the 6T, index size on disk, model download success, whether WebGPU is absent (expected), search latency.

## What changed vs upstream (git history is the source of truth)
- `lss-tools` merge: their original commits `d458d43` (index catch-up after Obsidian was closed) and `072852a` (Qwen3 provider) are in via a real merge, so authorship and hashes are theirs. We reverted Qwen (`91e3bd9`): 914 MB, too big for a WebView.
- `785a0d8` mobile load: `src/desktop.ts` is the only entry to Node-using code (HTTP server, broker, client-config); `main.ts` and `SettingsTab.svelte` import it lazily behind `Platform.isDesktop`. Also fixed three load-time crashes: shared `logger.ts` (Node `fs/os/path`, now try/catch + console), `policyProvider.ts` (`AsyncLocalStorage`, now falls back), and `bun.config.ts` (Transformers.js now resolves to `transformers.web.js`; the `node` build `require`d fs/path/url/stream at load). **The web build also affects desktop and is untested there.** `isDesktopOnly` is now false.
- `4277e3c`: search modal, Termux reader, unload-teardown fix.

## Verified vs not
Verified: `tsc`, `svelte-check`, prod build; `bun test` 2915 pass / 2 fail (the same 2 `probePort` failures exist on unmodified upstream; sandbox has no IPv6); mocked mobile and desktop `onload`; reader against an index written by the plugin's own `EmbeddingStore` (similar search, `fetch_note`, path-traversal and `.obsidian` blocked, HTTP mode).
Not verified: real Obsidian Mobile load, model download (needs `huggingface.co` and `cdn.jsdelivr.net`, blocked in the agent sandbox), actual embeddings, `semantic_search` in Termux (onnxruntime-node has no Termux build; `get_similar` needs no model), desktop regression, query/index dtype drift (q8 vs fp32).

## Next steps, in order
1. **Device test.** `cd packages/obsidian-plugin && bun run build`; copy `main.js` + `manifest.json` (repo root) to `.obsidian/plugins/mcp-tools-istefox/` on the phone; enable; run "Semantic search"; watch the first index. If the model fails to load, read the WebView console first (ORT wasm is CDN-pinned).
2. Commit/pull `embeddings/native-minilm-l6-v2/` to Termux, run `node tools/termux-reader/vault-rag.mjs --vault <path>`, register in PicoClaw (stdio or `--http 27124`).
3. Fill the "still to fill" rows above from real measurements.
4. **Upstream PRs (Emmanuel will ask).** Do not send this branch as-is. Make a branch from `dc227c4` (upstream) with only: the mobile-load commit, the search modal; leave out the `lss-tools` merge and the Qwen revert (the catch-up fix is `lss-tools`' work; suggest they open their own PR, or credit them with `Co-authored-by`). Offer the Termux reader as a separate PR or keep it here. Credit Emmanuel in the PR text.
5. Code cleanup / tightening: only after tests pass on device.

## Environment gotchas
- Agent sandbox blocks `api.github.com` tarballs, `huggingface.co`, `cdn.jsdelivr.net`, GraphQL. `bun install` fails on `obsidian-daily-notes-interface` pulling `obsidian` from a GitHub tarball. Workaround used: `npm pack obsidian-daily-notes-interface@0.9.4`, drop its `obsidian` dependency, point root `package.json` `overrides` at the folder, install, then revert `package.json`/`bun.lock`. Elsewhere plain `bun install` works.
- Pushing needs the repo attached to the session (the git proxy only injects credentials for attached repos). `origin` is upstream; our remote was `mine`.
- Root `tsc --noEmit` does not cover the plugin; use `npx tsc --noEmit` inside `packages/obsidian-plugin`.

## Credits
`istefox` (Stefano Ferri) and Jack Steam (`obsidian-mcp-tools`) wrote the plugin; `lss-tools` wrote the catch-up indexing fix; Emmanuel (`York-06`) directed the mobile port, chose the architecture and tests on-device; Claude wrote the port.

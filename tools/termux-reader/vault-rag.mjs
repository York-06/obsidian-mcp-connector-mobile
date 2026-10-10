#!/usr/bin/env node
// Read-only MCP server over the plugin's on-disk embedding index, for Termux.
// The plugin on the phone is the only writer; this never touches the index
// except to read it, so Git-synced updates can't split-brain.
// Format: packages/obsidian-plugin/src/features/semantic-search/services/store.ts
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const vault = path.resolve(arg("vault", "."));
const key = arg("provider", "native-minilm-l6-v2");
const plug = arg("plugin-id", "mcp-tools-istefox");
const dir = path.join(vault, ".obsidian", "plugins", plug, "embeddings", key);
const FORMAT = 4; // store.ts FORMAT_VERSION; a mismatch means re-index, not read
const SEGS = 16;

let chunks = []; // {file, offset, heading, vec}
let stamp = "";

const sig = () =>
  Array.from({ length: SEGS }, (_, k) => {
    try {
      return fs.statSync(path.join(dir, `embeddings.seg${k}.index.json`)).mtimeMs;
    } catch {
      return 0;
    }
  }).join(",");

function load() {
  const out = [];
  for (let k = 0; k < SEGS; k++) {
    const ix = path.join(dir, `embeddings.seg${k}.index.json`);
    if (!fs.existsSync(ix)) continue;
    const meta = JSON.parse(fs.readFileSync(ix, "utf8"));
    if (meta.version !== FORMAT) throw new Error(`index v${meta.version}, reader expects v${FORMAT}`);
    if (!meta.records.length) continue;
    const raw = fs.readFileSync(path.join(dir, `embeddings.seg${k}.bin`));
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    for (const r of meta.records) {
      if (r.byteOffset % 4 || r.byteLength % 4 || r.byteOffset + r.byteLength > buf.byteLength) continue;
      out.push({
        file: r.filePath,
        offset: r.offset,
        heading: r.heading,
        vec: new Float32Array(buf, r.byteOffset, r.byteLength / 4),
      });
    }
  }
  chunks = out;
  stamp = sig();
}

// Cheap staleness check so a Git pull is picked up without a restart.
const fresh = () => {
  if (sig() !== stamp) load();
};

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function top(q, k, keep = () => true) {
  const best = [];
  for (const c of chunks) {
    if (!keep(c)) continue;
    const score = dot(q, c.vec);
    if (best.length === k && score <= best[k - 1].score) continue;
    let i = best.length;
    while (i > 0 && best[i - 1].score < score) i--;
    best.splice(i, 0, { c, score });
    if (best.length > k) best.pop();
  }
  return best;
}

const inVault = (rel) => {
  const abs = path.resolve(vault, rel);
  const ok = abs.startsWith(vault + path.sep) && !rel.split(/[\\/]/).some((p) => p.startsWith("."));
  return ok ? abs : null;
};

function excerpt(file, offset) {
  const abs = inVault(file);
  if (!abs || !fs.existsSync(abs)) return { text: "", line: null };
  const t = fs.readFileSync(abs, "utf8");
  return { text: t.slice(offset, offset + 500), line: t.slice(0, offset).split("\n").length - 1 };
}

const fmt = (hits) =>
  hits.map(({ c, score }) => {
    const e = excerpt(c.file, c.offset);
    return { path: c.file, heading: c.heading, line: e.line, score: +score.toFixed(4), excerpt: e.text };
  });

let embedder;
async function embed(text) {
  // Optional dependency: `npm i @huggingface/transformers`. get_similar needs none.
  embedder ??= import("@huggingface/transformers").then((m) =>
    m.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"),
  );
  const r = await (await embedder)(text, { pooling: "mean", normalize: true });
  return new Float32Array(r.data);
}

const tools = {
  semantic_search: {
    description: "Find notes by meaning for a free-text query.",
    schema: { query: "string", limit: "number?", folder: "string?" },
    async run({ query, limit = 8, folder }) {
      const q = await embed(String(query));
      return fmt(top(q, limit, (c) => !folder || c.file.startsWith(folder.replace(/\/?$/, "/"))));
    },
  },
  get_similar: {
    description: "Find notes similar to a given note, using its stored vectors (no embedding model needed).",
    schema: { path: "string", limit: "number?" },
    async run({ path: p, limit = 8 }) {
      const mine = chunks.filter((c) => c.file === p);
      if (!mine.length) throw new Error(`not indexed: ${p}`);
      const q = new Float32Array(mine[0].vec.length);
      for (const c of mine) for (let i = 0; i < q.length; i++) q[i] += c.vec[i] / mine.length;
      const n = Math.sqrt(dot(q, q)) || 1;
      for (let i = 0; i < q.length; i++) q[i] /= n;
      return fmt(top(q, limit, (c) => c.file !== p));
    },
  },
  fetch_note: {
    description: "Read a note's full text by vault-relative path.",
    schema: { path: "string" },
    async run({ path: p }) {
      const abs = inVault(p);
      if (!abs) throw new Error("path outside vault or hidden");
      return fs.readFileSync(abs, "utf8");
    },
  },
};

const toolList = () =>
  Object.entries(tools).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(t.schema).map(([k, v]) => [k, { type: v.replace("?", "") }]),
      ),
      required: Object.entries(t.schema).filter(([, v]) => !v.endsWith("?")).map(([k]) => k),
    },
  }));

async function rpc(m) {
  const reply = (result) => ({ jsonrpc: "2.0", id: m.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: m.id, error: { code, message } });
  if (m.id === undefined) return null; // notification
  switch (m.method) {
    case "initialize":
      return reply({
        protocolVersion: m.params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "vault-rag", version: "0.1.0" },
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: toolList() });
    case "tools/call": {
      const t = tools[m.params?.name];
      if (!t) return fail(-32602, `unknown tool ${m.params?.name}`);
      try {
        fresh();
        const out = await t.run(m.params.arguments ?? {});
        return reply({ content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 1) }] });
      } catch (e) {
        return reply({ isError: true, content: [{ type: "text", text: String(e.message ?? e) }] });
      }
    }
    default:
      return fail(-32601, `method not found: ${m.method}`);
  }
}

load();
console.error(`vault-rag: ${chunks.length} chunks from ${dir}`);

const port = arg("http");
if (port) {
  http
    .createServer(async (req, res) => {
      if (req.method !== "POST") return res.writeHead(405).end();
      let body = "";
      for await (const d of req) body += d;
      const out = await rpc(JSON.parse(body));
      if (!out) return res.writeHead(202).end();
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
    })
    .listen(+port, "127.0.0.1", () => console.error(`vault-rag: http://127.0.0.1:${port}`));
} else {
  let buf = "";
  process.stdin.on("data", async (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const out = await rpc(JSON.parse(line));
      if (out) process.stdout.write(JSON.stringify(out) + "\n");
    }
  });
}

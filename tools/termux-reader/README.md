# vault-rag: read-only MCP server for Termux

Serves the plugin's on-disk embedding index to an agent (PicoClaw). The phone's Obsidian is the only writer. This process only reads, so Git syncs can't split-brain.

```
node vault-rag.mjs --vault ~/vault            # stdio
node vault-rag.mjs --vault ~/vault --http 27124  # POST JSON-RPC to 127.0.0.1
```

Tools: `semantic_search` (needs the model, see below), `get_similar` (stored vectors only), `fetch_note`.

- Index: `<vault>/.obsidian/plugins/mcp-tools-istefox/embeddings/native-minilm-l6-v2/`, so commit that folder to Git and pull it into the agent's clone. Reloads on change, no restart.
- `semantic_search` embeds the query, which needs `npm i @huggingface/transformers` and MiniLM-L6-v2. onnxruntime-node has no Termux build, so this is **untested on the phone**; `get_similar` works without it.
- Tested here only against an index written by the plugin's own `store.ts` (fixture, not a real vault).

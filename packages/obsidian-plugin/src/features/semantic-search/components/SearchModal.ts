import { Notice, SuggestModal, type App } from "obsidian";
import type { SearchResult, SemanticSearchState } from "../index";

/**
 * Free-text semantic search for the person at the keyboard. The MCP tools
 * serve agents; without this the on-device index has no human way in.
 * Reads `state.provider` on each query because the settings UI swaps it.
 */
export class SemanticSearchModal extends SuggestModal<SearchResult> {
  private seq = 0;

  constructor(
    app: App,
    private readonly state: () => SemanticSearchState | undefined,
  ) {
    super(app);
    this.setPlaceholder("Search your vault by meaning");
    this.limit = 20;
  }

  async getSuggestions(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const provider = this.state()?.provider;
    if (!provider?.isReady()) {
      this.setPlaceholder("Semantic index is not ready yet");
      return [];
    }
    // A slow embed must not overwrite the results of a newer keystroke.
    const mine = ++this.seq;
    const found = await provider.search(q, { limit: this.limit });
    return mine === this.seq ? found : [];
  }

  renderSuggestion(hit: SearchResult, el: HTMLElement): void {
    const where = hit.heading
      ? `${hit.filePath} › ${hit.heading}`
      : hit.filePath;
    el.createEl("div", { text: where });
    el.createEl("small", {
      text: `${hit.score.toFixed(2)} · ${hit.excerpt.slice(0, 160)}`,
    });
  }

  onChooseSuggestion(hit: SearchResult): void {
    const file = this.app.vault.getFileByPath(hit.filePath);
    if (!file) {
      new Notice(`Note no longer exists: ${hit.filePath}`);
      return;
    }
    const line = hit.line ?? 0;
    void this.app.workspace.getLeaf(false).openFile(file, { eState: { line } });
  }
}

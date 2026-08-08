export const BROWSE_CSS = `
.browse { display: flex; flex-direction: column; gap: 5px; }
.browse-path {
  color: var(--muted); font-size: 11px; font-family: ui-monospace, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left;
}
.browse-list {
  max-height: 190px; overflow-y: auto; border: 1px solid var(--line);
  border-radius: 6px; background: #131316;
}
.browse-list button {
  display: block; width: 100%; text-align: left; border: 0; background: none;
  color: var(--text); padding: 4px 9px; font: inherit; font-size: 12px; cursor: pointer;
}
.browse-list button:hover { background: #1c1c21; }
.browse-list button.dir { color: var(--muted); }
.browse-list button.sheet { color: var(--accent); }
.browse-empty { padding: 8px 9px; color: var(--muted); font-size: 12px; }
`;

type Entry = { readonly name: string; readonly kind: "dir" | "file" };
type Listing = {
  readonly dir: string;
  readonly parent: string | undefined;
  readonly entries: readonly Entry[];
};

async function list(dir: string): Promise<Listing> {
  const response = await fetch(`/__pg/list?dir=${encodeURIComponent(dir)}`);
  if (!response.ok) throw new Error(`Cannot read ${dir || "the repository root"}.`);
  return await response.json() as Listing;
}

export async function readSheet(path: string): Promise<string> {
  const response = await fetch(`/__pg/read?file=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(`Cannot read ${path}.`);
  return await response.text();
}

export type Browser = {
  readonly element: HTMLElement;
  open(dir: string): void;
};

/**
 * A directory list, starting at the repository root.
 *
 * Only directories and stylesheets are offered, because those are the only
 * things this panel can act on. A folder with neither reads as empty, which is
 * the truth about what the playground can do with it.
 */
export function createBrowser(onSheet: (path: string) => void): Browser {
  const element = document.createElement("div");
  element.className = "browse";
  const path = document.createElement("div");
  path.className = "browse-path";
  const listing = document.createElement("div");
  listing.className = "browse-list";
  element.append(path, listing);

  let current = ".";

  function open(dir: string): void {
    current = dir;
    void list(dir).then((result) => {
      path.textContent = result.dir === "" ? "/" : `/${result.dir}`;
      path.title = path.textContent;
      listing.replaceChildren();

      if (result.parent !== undefined) {
        const up = document.createElement("button");
        up.type = "button";
        up.className = "dir";
        up.textContent = "../";
        up.addEventListener("click", () => open(result.parent!));
        listing.append(up);
      }
      for (const entry of result.entries) {
        const item = document.createElement("button");
        item.type = "button";
        const child = result.dir === "" ? entry.name : `${result.dir}/${entry.name}`;
        if (entry.kind === "dir") {
          item.className = "dir";
          item.textContent = `${entry.name}/`;
          item.addEventListener("click", () => open(child));
        } else if (entry.name.endsWith(".svs")) {
          item.className = "sheet";
          item.textContent = entry.name;
          item.addEventListener("click", () => onSheet(child));
        } else {
          continue;
        }
        listing.append(item);
      }
      if (listing.childElementCount === 0) {
        const empty = document.createElement("div");
        empty.className = "browse-empty";
        empty.textContent = "No folders or stylesheets here.";
        listing.append(empty);
      }
    }).catch((error: unknown) => {
      listing.replaceChildren();
      const failed = document.createElement("div");
      failed.className = "browse-empty";
      failed.textContent = error instanceof Error ? error.message : String(error);
      listing.append(failed);
    });
  }

  open(current);
  return { element, open };
}

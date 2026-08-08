import { renderPreview } from "../preview/render.js";
import type { PreviewSubject } from "../svs/discover.js";
import { sealProgramSpace } from "../svml.js";

export const GALLERY_CSS = `
.gallery { flex: 1; min-width: 0; overflow-y: auto; background: #0d0d10; padding: 18px; }
.gallery-grid { display: flex; flex-wrap: wrap; gap: 18px; align-content: flex-start; }
.tile { display: flex; flex-direction: column; gap: 7px; cursor: pointer; }
.tile-frame {
  position: relative; overflow: hidden; background: #000;
  box-shadow: 0 0 0 1px var(--line); border-radius: 3px;
}
.tile:hover .tile-frame { box-shadow: 0 0 0 1px var(--accent); }
.tile-frame iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: top left; }
.tile-name { font-size: 12px; font-family: ui-monospace, monospace; }
.tile-kind { font-size: 11px; color: var(--muted); }
.tile-error {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  padding: 10px; color: var(--danger); font-size: 11px; text-align: center;
  font-family: ui-monospace, monospace; background: #2a1416;
}
.gallery-note { color: var(--muted); font-size: 12px; margin: 22px 0 7px; }
.gallery-unmatched { display: flex; flex-direction: column; gap: 3px; }
.gallery-unmatched code { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.gallery-unmatched b { color: var(--text); font-weight: 500; }
`;

const TILE_WIDTH = 250;

export type GalleryInput = {
  readonly subjects: readonly PreviewSubject[];
  readonly unmatched: readonly { readonly path: string; readonly keys: readonly string[] }[];
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly fps: number;
  readonly durationSec: number;
  readonly onFocus: (subject: PreviewSubject) => void;
};

/**
 * Every Recipe in a sheet, previewed side by side.
 *
 * Each tile is an independent document at composition scale, shrunk by
 * transform. Tiles hold one representative frame rather than a scrubber: the
 * gallery answers "what is in this stylesheet", and a Recipe you want to work
 * on gets focused into the single stage.
 */
export function renderGallery(input: GalleryInput): HTMLElement {
  const element = document.createElement("div");
  element.className = "gallery";
  const grid = document.createElement("div");
  grid.className = "gallery-grid";
  element.append(grid);

  const scale = TILE_WIDTH / input.canvas.width;
  const height = Math.round(input.canvas.height * scale);

  for (const subject of input.subjects) {
    const tile = document.createElement("div");
    tile.className = "tile";
    const frame = document.createElement("div");
    frame.className = "tile-frame";
    frame.style.width = `${TILE_WIDTH}px`;
    frame.style.height = `${height}px`;

    try {
      const programSpace = sealProgramSpace({
        contract: "svml.program-space@1",
        durationSec: input.durationSec,
        frameRate: { numerator: input.fps, denominator: 1 },
      });
      const preview = renderPreview({
        id: subject.component.id,
        canvas: input.canvas,
        programSpace,
        tracks: subject.component.build({
          parameters: subject.parameters,
          content: subject.content,
          programSpace,
          canvas: input.canvas,
        }),
      });
      const view = document.createElement("iframe");
      view.title = subject.path;
      view.style.width = `${input.canvas.width}px`;
      view.style.height = `${input.canvas.height}px`;
      view.style.transform = `scale(${scale})`;
      view.srcdoc = preview.srcdoc;
      // A third of the way in shows a Present that has settled rather than one
      // still animating in from nothing.
      const at = Math.floor(preview.frameCount / 3);
      view.addEventListener("load", () => {
        (view.contentWindow as { __svmlSeekFrame?: (frame: number) => void } | null)
          ?.__svmlSeekFrame?.(at);
      });
      frame.append(view);
    } catch (error) {
      const failed = document.createElement("div");
      failed.className = "tile-error";
      failed.textContent = error instanceof Error ? error.message : String(error);
      frame.append(failed);
    }

    const name = document.createElement("div");
    name.className = "tile-name";
    name.textContent = subject.path;
    const kind = document.createElement("div");
    kind.className = "tile-kind";
    kind.textContent = subject.component.label;
    tile.append(frame, name, kind);
    tile.addEventListener("click", () => input.onFocus(subject));
    grid.append(tile);
  }

  if (input.subjects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "gallery-note";
    empty.textContent = "This stylesheet declares nothing the playground can draw yet.";
    element.append(empty);
  }

  if (input.unmatched.length > 0) {
    const note = document.createElement("div");
    note.className = "gallery-note";
    note.textContent = `${input.unmatched.length} Recipe(s) have no preview — their property sets match no component:`;
    const list = document.createElement("div");
    list.className = "gallery-unmatched";
    for (const entry of input.unmatched) {
      const line = document.createElement("code");
      const path = document.createElement("b");
      path.textContent = entry.path;
      line.append(path, document.createTextNode(`  { ${entry.keys.join(", ")} }`));
      list.append(line);
    }
    element.append(note, list);
  }

  return element;
}

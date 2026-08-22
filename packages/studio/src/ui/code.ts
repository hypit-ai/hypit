import type { Range, StudioSnapshot } from "../shared.js";
import { icon, setIcon } from "./icons.js";
import { intentTones } from "./markers.js";
import { tokenizeSvml } from "./syntax.js";
import type { Token } from "./syntax.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type Highlight = {
  readonly range: Range;
  /**
   * `element` outlines the authored tag, `binding` the author's intent, and
   * `onscreen` a tag that is merely drawn at this frame rather than chosen.
   */
  readonly tone: "element" | "binding" | "onscreen";
  /** Nesting depth, so an inner pair is drawn distinctly from the one enclosing it. */
  readonly depth?: number;
};

export type CodePane = {
  readonly element: HTMLElement;
  show(snapshot: StudioSnapshot): void;
  highlight(values: readonly Highlight[], scrollIntoView: boolean): void;
  /** Mark the word being spoken at the playhead, or nothing outside speech. */
  speak(range: Range | undefined): void;
  /** Absolute source offset under a pointer event, or undefined outside the text. */
  offsetAt(event: MouseEvent): number | undefined;
};

/** One text node and the absolute source span it covers. */
type Piece = { readonly node: Text; readonly start: number; readonly end: number };

type Line = {
  readonly element: HTMLElement;
  readonly code: HTMLElement;
  readonly start: number;
  readonly end: number;
  readonly pieces: readonly Piece[];
};

/** A point on the rendered glyph grid, in scroll-container coordinates. */
type Caret = { readonly x: number; readonly y: number; readonly height: number };

/**
 * One rounded outline through an arbitrary polygon. Ported from the Hypit
 * demo so a highlight here reads the same as a highlight on the site.
 */
function roundedRangePath(points: readonly { x: number; y: number }[], radius = 6): string {
  return `${points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const next = points[(index + 1) % points.length]!;
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y) || 1;
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y) || 1;
    const corner = Math.min(radius, previousLength / 2, nextLength / 2);
    const before = {
      x: point.x + (previous.x - point.x) * corner / previousLength,
      y: point.y + (previous.y - point.y) * corner / previousLength,
    };
    const after = {
      x: point.x + (next.x - point.x) * corner / nextLength,
      y: point.y + (next.y - point.y) * corner / nextLength,
    };
    return `${index === 0 ? "M" : "L"} ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }).join(" ")} Z`;
}

/** Keep source-range outlines clear of the line-number column. */
const RANGE_LEFT = 41;

export function createCodePane(): CodePane {
  const element = document.createElement("section");
  element.className = "code";
  element.innerHTML = `
    <div class="pane-heading code-heading">
      <div class="pane-tabs" role="tablist" aria-label="Workspace views">
        <button type="button" class="pane-tab active" role="tab" aria-selected="true">SVML</button>
      </div>
      <div class="code-actions">
        <span class="code-location" data-path></span>
        <span class="code-save-state" data-save-state></span>
        <button type="button" class="icon-button code-mode" data-mode aria-label="Edit source" title="Edit source">
          <span data-mode-icon>${icon("edit")}</span>
        </button>
      </div>
    </div>
    <div class="code-scroll"><svg class="range-canvas" aria-hidden="true"></svg></div>
    <textarea class="code-editor" data-editor spellcheck="false" aria-label="SVML source"></textarea>`;
  const path = element.querySelector<HTMLElement>("[data-path]")!;
  const scroll = element.querySelector<HTMLElement>(".code-scroll")!;
  const canvas = element.querySelector<SVGSVGElement>(".range-canvas")!;
  const editor = element.querySelector<HTMLTextAreaElement>("[data-editor]")!;
  const mode = element.querySelector<HTMLButtonElement>("[data-mode]")!;
  const modeIcon = mode.querySelector<HTMLElement>("[data-mode-icon]")!;
  const saveState = element.querySelector<HTMLElement>("[data-save-state]")!;

  let lines: Line[] = [];
  let current: readonly Highlight[] = [];
  let spoken: HTMLElement | undefined;
  let snapshotRevision = 0;
  let editingRevision = 0;
  let sourceText = "";
  let editing = false;
  let dirty = false;
  let saveTimer: number | undefined;

  const setEditing = (value: boolean): void => {
    editing = value;
    element.classList.toggle("is-editing", editing);
    setIcon(modeIcon, editing ? "eye" : "edit");
    mode.setAttribute("aria-label", editing ? "Read source" : "Edit source");
    mode.title = editing ? "Read source" : "Edit source";
    if (editing) {
      editor.value = sourceText;
      editingRevision = snapshotRevision;
      editor.focus({ preventScroll: true });
    }
  };

  const save = async (): Promise<void> => {
    if (!editing || !dirty) return;
    saveState.textContent = "Saving";
    saveState.className = "code-save-state saving";
    try {
      const response = await fetch("/__studio/source", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: editor.value, revision: editingRevision }),
      });
      if (!response.ok) {
        const reason = await response.text();
        throw new Error(reason || `Save failed (${response.status})`);
      }
      sourceText = editor.value;
      dirty = false;
      saveState.textContent = "Saved";
      saveState.className = "code-save-state saved";
      window.setTimeout(() => {
        if (!dirty) saveState.textContent = "";
      }, 1200);
    } catch (error) {
      saveState.textContent = error instanceof Error && error.message.includes("changed")
        ? "Changed outside Studio"
        : "Save failed";
      saveState.className = "code-save-state error";
    }
  };

  mode.addEventListener("click", () => {
    if (editing && dirty) void save();
    setEditing(!editing);
  });
  editor.addEventListener("input", () => {
    dirty = true;
    saveState.textContent = "Unsaved";
    saveState.className = "code-save-state dirty";
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void save(), 480);
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      void save();
    }
  });

  const lineAt = (offset: number): Line | undefined =>
    lines.find((line) => offset >= line.start && offset <= line.end);

  /**
   * Measure one absolute offset from a real source character. Using a character
   * rectangle also keeps punctuation and token boundaries exact.
   */
  const caret = (offset: number, edge: "start" | "end"): Caret | undefined => {
    const line = lineAt(offset);
    if (line === undefined) return undefined;
    const box = scroll.getBoundingClientRect();
    const toLocal = (rect: DOMRect, x: number): Caret => ({
      x: x - box.left + scroll.scrollLeft,
      y: (rect.top + rect.bottom) / 2 - box.top + scroll.scrollTop,
      height: rect.height,
    });

    const piece = edge === "start"
      ? line.pieces.find((item) => offset >= item.start && offset < item.end)
        ?? line.pieces.find((item) => offset <= item.start)
      : line.pieces.find((item) => offset > item.start && offset <= item.end)
        ?? line.pieces.findLast((item) => offset >= item.end);

    const range = document.createRange();
    if (piece !== undefined) {
      const within = Math.max(0, Math.min(offset - piece.start, piece.node.length));
      if (within < piece.node.length) {
        range.setStart(piece.node, within);
        range.setEnd(piece.node, within + 1);
        const rect = range.getClientRects()[0];
        if (rect !== undefined) return toLocal(rect, rect.left);
      }
      if (within > 0) {
        range.setStart(piece.node, within - 1);
        range.setEnd(piece.node, within);
        const rect = range.getClientRects()[0];
        if (rect !== undefined) return toLocal(rect, rect.right);
      }
    }
    const rect = line.code.getBoundingClientRect();
    return toLocal(rect, edge === "start" ? rect.left : rect.right);
  };

  const draw = (): void => {
    const width = Math.max(scroll.clientWidth, scroll.scrollWidth);
    const last = lines.at(-1)?.element;
    const height = Math.max(scroll.clientHeight, last === undefined ? 0 : last.offsetTop + last.offsetHeight);
    canvas.setAttribute("width", String(width));
    canvas.setAttribute("height", String(height));
    canvas.setAttribute("viewBox", `0 0 ${width} ${height}`);
    canvas.replaceChildren();
    if (width === 0) return;

    for (const item of current) {
      const start = caret(item.range.start, "start");
      const end = caret(item.range.end, "end");
      if (start === undefined || end === undefined) continue;
      const lineHeight = start.height || Number.parseFloat(getComputedStyle(scroll).lineHeight) || 20;
      // The outline starts at the code column rather than over the line number.
      const left = RANGE_LEFT;
      const right = width - 10;
      const startX = Math.max(left, start.x - 3);
      const endX = Math.max(left, end.x + 3);
      const top = start.y - lineHeight / 2;
      const bottom = end.y + lineHeight / 2;
      // Compare measured baselines so multi-line source ranges use one outline.
      const sameRow = Math.abs(start.y - end.y) < lineHeight / 2;
      // A multi-row range becomes one flag rather than a stack of boxes, so the
      // whole region reads as a single selection.
      const points = sameRow
        ? [{ x: startX, y: top }, { x: endX, y: top }, { x: endX, y: bottom }, { x: startX, y: bottom }]
        : [
          { x: startX, y: top }, { x: right, y: top },
          { x: right, y: end.y - lineHeight / 2 }, { x: endX, y: end.y - lineHeight / 2 },
          { x: endX, y: bottom }, { x: left, y: bottom },
          { x: left, y: start.y + lineHeight / 2 }, { x: startX, y: start.y + lineHeight / 2 },
        ];
      const node = document.createElementNS(SVG_NS, "path");
      node.setAttribute("d", roundedRangePath(points));
      node.setAttribute("class",
        `range range-${item.tone}${item.depth === undefined ? "" : ` tone-${item.depth}`}`);
      canvas.append(node);
    }
  };

  scroll.addEventListener("scroll", draw);
  new ResizeObserver(draw).observe(scroll);

  return {
    element,
    show(snapshot) {
      path.textContent = snapshot.source.path;
      const source = snapshot.source.text;
      snapshotRevision = snapshot.revision;
      sourceText = source;
      if (!editing || !dirty) {
        editor.value = source;
        editingRevision = snapshot.revision;
      }
      const tokens: readonly Token[] = tokenizeSvml(source);
      const tones = intentTones(snapshot);
      lines = [];
      const fragment = document.createDocumentFragment();
      let offset = 0;
      let index = 0;

      for (const [number, value] of source.split("\n").entries()) {
        const lineStart = offset;
        const lineEnd = offset + value.length;
        const row = document.createElement("div");
        row.className = "code-line";
        row.dataset.offset = String(lineStart);
        const gutter = document.createElement("span");
        gutter.className = "line-number";
        gutter.textContent = String(number + 1);
        const code = document.createElement("code");
        const pieces: Piece[] = [];

        // Emit one text node per token and per gap between tokens, clipped to
        // this line, so the concatenation stays byte-identical to the source.
        const emit = (from: number, to: number, token?: Token): void => {
          if (to <= from) return;
          const node = document.createTextNode(source.slice(from, to));
          if (token === undefined) code.append(node);
          else {
            const span = document.createElement("span");
            // A marker pair shares a tone with the clip it binds, so the two
            // ends of `@claim … @/claim` read as one thing.
            const tone = token.id === undefined ? undefined : tones.get(token.id);
            span.className = `tok tok-${token.kind}${tone === undefined ? "" : ` tone-${tone}`}`;
            if (token.id !== undefined) span.dataset.marker = token.id;
            span.append(node);
            code.append(span);
          }
          pieces.push({ node, start: from, end: to });
        };

        while (index < tokens.length && tokens[index]!.end <= lineStart) index += 1;
        let cursor = lineStart;
        for (let scan = index; scan < tokens.length && tokens[scan]!.start < lineEnd; scan += 1) {
          const token = tokens[scan]!;
          const from = Math.max(token.start, lineStart);
          const to = Math.min(token.end, lineEnd);
          if (to <= cursor) continue;
          emit(cursor, from);
          emit(from, to, token);
          cursor = to;
        }
        emit(cursor, lineEnd);
        // An empty line still needs a box to measure and click.
        if (pieces.length === 0) code.append(document.createTextNode(" "));

        row.append(gutter, code);
        fragment.append(row);
        lines.push({ element: row, code, start: lineStart, end: lineEnd, pieces });
        offset = lineEnd + 1;
      }

      scroll.replaceChildren(canvas, fragment);
      draw();
    },
    speak(range) {
      spoken?.remove();
      spoken = undefined;
      if (range === undefined) return;
      const line = lineAt(range.start);
      const piece = line?.pieces.find((item) => range.start >= item.start && range.start < item.end);
      // A word is highlighted by drawing over it rather than by rewriting the
      // text: the offsets every other measurement depends on stay put.
      const start = caret(range.start, "start");
      const end = caret(range.end, "end");
      if (line === undefined || piece === undefined || start === undefined || end === undefined) return;
      if (Math.abs(start.y - end.y) > (start.height || 20) / 2) return;
      const mark = document.createElement("div");
      mark.className = "spoken";
      mark.style.left = `${start.x - 2}px`;
      mark.style.top = `${start.y - (start.height || 20) / 2}px`;
      mark.style.width = `${Math.max(2, end.x - start.x + 4)}px`;
      mark.style.height = `${start.height || 20}px`;
      scroll.append(mark);
      spoken = mark;
    },
    highlight(values, scrollIntoView) {
      current = values;
      draw();
      const first = values[0];
      if (!scrollIntoView || first === undefined) return;
      lineAt(first.range.start)?.element.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    offsetAt(event) {
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>(".code-line");
      const line = row === null || row === undefined
        ? undefined
        : lines.find((item) => item.element === row);
      if (line === undefined) return undefined;
      // Pick the character whose rendered box is nearest to the pointer.
      const range = document.createRange();
      let best = line.start;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const piece of line.pieces) {
        for (let within = 0; within < piece.node.length; within += 1) {
          range.setStart(piece.node, within);
          range.setEnd(piece.node, within + 1);
          const rect = range.getClientRects()[0];
          if (rect === undefined) continue;
          const dy = event.clientY < rect.top ? rect.top - event.clientY
            : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0;
          const dx = event.clientX < rect.left ? rect.left - event.clientX
            : event.clientX > rect.right ? event.clientX - rect.right : 0;
          const distance = dy * 1000 + dx;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = piece.start + within;
          }
        }
      }
      return best;
    },
  };
}

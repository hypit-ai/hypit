import type { PlaygroundSnapshot, Range } from "../shared.js";
import { markerTones } from "./markers.js";
import { tokenizeSvml } from "./syntax.js";
import type { Token } from "./syntax.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export type Highlight = {
  readonly range: Range;
  /**
   * `element` outlines the authored tag, `binding` the Script marker, and
   * `onscreen` a tag that is merely drawn at this frame rather than chosen.
   */
  readonly tone: "element" | "binding" | "onscreen";
  /** Nesting depth, so an inner pair is drawn distinctly from the one enclosing it. */
  readonly depth?: number;
};

export type CodePane = {
  readonly element: HTMLElement;
  show(snapshot: PlaygroundSnapshot): void;
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

/**
 * The gutter holds one bar per nesting level. `GUTTER_LEFT` is where the
 * outermost bar starts, past the right edge of a three-digit line number.
 */
const GUTTER_LEFT = 27;
const GUTTER_STEP = 3;
const GUTTER_LEVELS = 4;
/** Where a range outline may begin: clear of every bar the gutter can hold. */
const GUTTER_TEXT = GUTTER_LEFT + GUTTER_STEP * GUTTER_LEVELS + 2;

export function createCodePane(): CodePane {
  const element = document.createElement("section");
  element.className = "code";
  element.innerHTML = `
    <div class="pane-heading"><h2>Source</h2><span data-path></span></div>
    <div class="code-scroll"><svg class="range-canvas" aria-hidden="true"></svg></div>`;
  const path = element.querySelector<HTMLElement>("[data-path]")!;
  const scroll = element.querySelector<HTMLElement>(".code-scroll")!;
  const canvas = element.querySelector<SVGSVGElement>(".range-canvas")!;

  let lines: Line[] = [];
  let current: readonly Highlight[] = [];
  let spoken: HTMLElement | undefined;

  const lineAt = (offset: number): Line | undefined =>
    lines.find((line) => offset >= line.start && offset <= line.end);

  /**
   * Measure one absolute offset. Text is wrapped, so a collapsed DOM range at a
   * wrap boundary can report no rectangles at all: measure a real character and
   * take the edge that faces the offset instead.
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
    const width = scroll.clientWidth;
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
      // The outline's left edge sits clear of the gutter bars rather than over
      // the first characters of the code.
      const left = GUTTER_TEXT;
      const right = width - 10;
      const startX = Math.max(left, start.x - 3);
      const endX = Math.max(left, end.x + 3);
      const top = start.y - lineHeight / 2;
      const bottom = end.y + lineHeight / 2;
      // Wrapping means "same line" is a question about rendered rows, not about
      // source lines: compare the measured baselines.
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
      const tokens: readonly Token[] = tokenizeSvml(source);
      const tones = markerTones(snapshot);
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

      // Mark every line that can be clicked, at the level it belongs to. Only a
      // small part of a Source binds to anything, so what is clickable has to be
      // visible standing still rather than discovered by sweeping the pointer
      // over it — and a Script range is as clickable as an authored element.
      const clickable: { range: Range; tone: number | undefined }[] = [];
      for (const segment of snapshot.script?.segments ?? []) {
        clickable.push({ range: segment.range, tone: tones.get(segment.id) });
      }
      for (const selection of snapshot.script?.selections ?? []) {
        for (const occurrence of selection.occurrences) {
          clickable.push({
            range: { start: occurrence.open.start, end: occurrence.close.end },
            tone: tones.get(selection.id),
          });
        }
      }
      for (const track of snapshot.tracks) {
        for (const clip of track.clips) {
          if (clip.elementRange === undefined) continue;
          clickable.push({ range: clip.elementRange, tone: tones.get(clip.authoredId) });
        }
      }
      for (const line of lines) {
        // Widest first: a bar per level the line sits inside, laid left to
        // right so the enclosing pair stays visible beside the nested one
        // instead of being covered by it.
        // Several clips can be drawn from one tag - a Caption Track is one tag
        // and a dozen cues - and a bar per clip would say the line is nested a
        // dozen deep. One bar per distinct range is what nesting means.
        const distinct = new Map<string, { range: Range; tone: number | undefined }>();
        for (const item of clickable) {
          if (line.end < item.range.start || line.start > item.range.end) continue;
          const key = `${item.range.start}:${item.range.end}`;
          if (!distinct.has(key)) distinct.set(key, item);
        }
        const covering = [...distinct.values()]
          .sort((left, right) =>
            (right.range.end - right.range.start) - (left.range.end - left.range.start))
          .slice(0, GUTTER_LEVELS);
        if (covering.length === 0) continue;
        line.element.classList.add("bound");
        // The tightest range is what the line means, so the line-number hover
        // colour still follows the innermost level.
        const innermost = covering[covering.length - 1]!;
        if (innermost.tone !== undefined) line.element.classList.add(`tone-${innermost.tone}`);
        for (const [level, item] of covering.entries()) {
          const bar = document.createElement("span");
          bar.className = item.tone === undefined ? "gutter-bar" : `gutter-bar tone-${item.tone}`;
          bar.style.left = `${GUTTER_LEFT + level * GUTTER_STEP}px`;
          line.element.append(bar);
        }
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
      // Pick the character whose rendered box contains the pointer. Wrapping
      // makes this a two-dimensional question, so the row has to match too.
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

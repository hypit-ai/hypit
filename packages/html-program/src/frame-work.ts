/**
 * Page-local absolute-frame work lookup shared by HTML renderer runtime features.
 *
 * The index deliberately knows only half-open frame spans, stable order and an
 * opaque payload. Text, animation and media semantics remain with their own
 * evaluators. Every render page derives and discards its own index.
 */
export const frameSelectionRuntime = String.raw`
let htmlRequestedFrameSpans = null;
let htmlFrameSelectionPrepared = false;
const htmlFrameProgramInitializers = [];
const htmlRegisterFrameProgramInitializer = (initializer) => {
  if (htmlFrameSelectionPrepared) throw new Error('HTML Program runtime is already prepared.');
  if (typeof initializer !== 'function') throw new Error('HTML Program initializer must be a function.');
  htmlFrameProgramInitializers.push(initializer);
};
const htmlPrepareFrameSelection = (source) => {
  if (htmlFrameSelectionPrepared) throw new Error('HTML Program runtime is already prepared.');
  htmlFrameSelectionPrepared = true;
  if (source === undefined) return;
  if (!Array.isArray(source)) throw new Error('HTML renderer requested frame spans must be an array.');
  let previousEnd = -1;
  htmlRequestedFrameSpans = Object.freeze(source.map((span) => {
    if (span === null || typeof span !== 'object') throw new Error('HTML renderer requested frame span must be an object.');
    const startFrame = Number(span.startFrame);
    const endFrameExclusive = Number(span.endFrameExclusive);
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive)
      || startFrame < 0 || endFrameExclusive <= startFrame || startFrame < previousEnd) {
      throw new Error('HTML renderer requested frame spans must be ordered, disjoint and valid.');
    }
    previousEnd = endFrameExclusive;
    return Object.freeze({ startFrame, endFrameExclusive });
  }));
};
const htmlSelectionOverlaps = (startFrame, endFrameExclusive) => {
  if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive)
    || startFrame < 0 || endFrameExclusive <= startFrame) {
    throw new Error('HTML renderer selection query span is invalid.');
  }
  if (htmlRequestedFrameSpans === null) return true;
  let low = 0;
  let high = htmlRequestedFrameSpans.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (htmlRequestedFrameSpans[middle].endFrameExclusive <= startFrame) low = middle + 1;
    else high = middle;
  }
  const candidate = htmlRequestedFrameSpans[low];
  return candidate !== undefined && candidate.startFrame < endFrameExclusive;
};
`;

export const frameWorkIndexRuntime = String.raw`${frameSelectionRuntime}
const htmlCreateFrameWorkIndex = (sourceEntries) => {
  const entries = sourceEntries.map((entry, serial) => {
    const startFrame = Number(entry.startFrame);
    const endFrameExclusive = Number(entry.endFrameExclusive);
    const order = entry.order === undefined ? serial : Number(entry.order);
    if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive)
      || startFrame < 0 || endFrameExclusive <= startFrame || !Number.isSafeInteger(order)) {
      throw new Error('HTML renderer frame work has an invalid span or order.');
    }
    return Object.freeze({ startFrame, endFrameExclusive, order, serial, payload: entry.payload });
  });
  const build = (items) => {
    if (items.length === 0) return null;
    const centers = items
      .map((entry) => entry.startFrame + (entry.endFrameExclusive - entry.startFrame) / 2)
      .sort((left, right) => left - right);
    const center = centers[Math.floor(centers.length / 2)];
    const left = [];
    const right = [];
    const overlaps = [];
    for (const entry of items) {
      if (entry.endFrameExclusive <= center) left.push(entry);
      else if (entry.startFrame > center) right.push(entry);
      else overlaps.push(entry);
    }
    return Object.freeze({
      center,
      byStart: Object.freeze([...overlaps].sort((a, b) =>
        a.startFrame - b.startFrame || a.endFrameExclusive - b.endFrameExclusive || a.serial - b.serial)),
      byEnd: Object.freeze([...overlaps].sort((a, b) =>
        b.endFrameExclusive - a.endFrameExclusive || a.startFrame - b.startFrame || a.serial - b.serial)),
      left: build(left),
      right: build(right),
    });
  };
  const root = build(entries);
  const collect = (node, frame, result) => {
    if (node === null) return;
    if (frame < node.center) {
      for (const entry of node.byStart) {
        if (entry.startFrame > frame) break;
        result.push(entry);
      }
      collect(node.left, frame, result);
      return;
    }
    for (const entry of node.byEnd) {
      if (entry.endFrameExclusive <= frame) break;
      result.push(entry);
    }
    collect(node.right, frame, result);
  };
  const collectOverlapping = (node, span, result) => {
    if (node === null) return;
    for (const entry of node.byStart) {
      if (entry.startFrame >= span.endFrameExclusive) break;
      if (entry.endFrameExclusive > span.startFrame) result.push(entry);
    }
    if (span.startFrame < node.center) collectOverlapping(node.left, span, result);
    if (span.endFrameExclusive > node.center) collectOverlapping(node.right, span, result);
  };
  const ordered = (result) => result.sort((left, right) => left.order - right.order || left.serial - right.serial);
  return Object.freeze({
    at(frame) {
      if (!Number.isSafeInteger(frame) || frame < 0) throw new Error('HTML renderer frame work query is invalid.');
      const result = [];
      collect(root, frame, result);
      return ordered(result);
    },
    overlapping(span) {
      const startFrame = Number(span?.startFrame);
      const endFrameExclusive = Number(span?.endFrameExclusive);
      if (!Number.isSafeInteger(startFrame) || !Number.isSafeInteger(endFrameExclusive)
        || startFrame < 0 || endFrameExclusive <= startFrame) {
        throw new Error('HTML renderer frame work query span is invalid.');
      }
      const result = [];
      collectOverlapping(root, { startFrame, endFrameExclusive }, result);
      return ordered(result);
    },
  });
};`;

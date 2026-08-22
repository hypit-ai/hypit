/**
 * Cut an Author Source down to the one stretch a comparison is looking at, mechanically.
 *
 * Rendering an element means rendering a program, and a program is as long as its Script. Comparing
 * six seconds of a sixty-second video meant drawing all sixty and cropping, which is most of the
 * cost of a comparison round.
 *
 * The cut is a **transformation of the original text, not a rewrite**: every element that survives is
 * copied out of the Source byte for byte, at the range the parse gave it. Nothing is authored here,
 * so the fragment cannot describe something the Source does not.
 *
 * What decides survival is reference integrity, not distance from the element being looked at.
 * Following inputs backwards from the target would keep what it depends on and drop everything else —
 * and the Tracks that can collide with it on screen are exactly the ones it has no edge to. A caption
 * sliced that way hangs over nothing, which is the shape of the defect this whole path exists to
 * catch. So instead: keep the Segment, drop the rest of the Script, and then drop only what can no
 * longer resolve — an element naming a Segment, Selection or Moment that is gone, and anything
 * naming an element dropped for that reason, to a fixed point. A peer bound inside the kept Segment
 * survives by construction, because its binding still resolves.
 */

export type SliceResult = {
  /** The fragment, verbatim from the original except for what was removed. */
  readonly text: string;
  /** Element ids left out, and the name each one could no longer reach. */
  readonly dropped: readonly { readonly id: string; readonly unresolved: string }[];
  readonly keptSegment: string;
};

type Element = {
  readonly id: string | undefined;
  readonly start: number;
  readonly end: number;
  readonly depth: number;
  readonly text: string;
};

/**
 * Every element in the document with its byte range, including children. A tag is either
 * self-closing or closed by name; comments and the Script's own prose are skipped, since a `<` inside
 * spoken words is not a tag.
 */
function elements(source: string, skip: readonly (readonly [number, number])[]): Element[] {
  const found: Element[] = [];
  const open: { name: string; start: number; depth: number }[] = [];
  const inside = (index: number): boolean => skip.some(([from, to]) => index >= from && index < to);
  const pattern = /<(\/?)([a-z][a-z0-9-]*(?::[A-Za-z][A-Za-z0-9]*)?)\b([^>]*?)(\/?)>/gsu;
  for (const match of source.matchAll(pattern)) {
    const index = match.index;
    if (inside(index)) continue;
    const whole = match[0];
    const closing = match[1]!;
    const name = match[2]!;
    const attributes = match[3]!;
    const selfClosing = match[4]!;
    if (closing === "/") {
      const last = open.pop();
      if (last !== undefined && last.name === name) {
        found.push({
          id: undefined, start: last.start, end: index + whole.length, depth: last.depth,
          text: source.slice(last.start, index + whole.length),
        });
      }
      continue;
    }
    if (selfClosing === "/") {
      found.push({
        id: /\bid="([^"]+)"/u.exec(attributes)?.[1], start: index, end: index + whole.length,
        depth: open.length, text: whole,
      });
      continue;
    }
    open.push({ name, start: index, depth: open.length });
  }
  // A closed element's id has to be read back off its own opening tag.
  return found.map((element) => element.id === undefined
    ? { ...element, id: /^<[^>]*?\bid="([^"]+)"/su.exec(element.text)?.[1] }
    : element);
}

/** The Script names an element reaches for, and the element ids it reaches for. */
function references(text: string): { readonly story: Set<string>; readonly ids: Set<string> } {
  const story = new Set<string>();
  const ids = new Set<string>();
  // A Script name is reached through more than one space — `story.selection.x` in word space and
  // `story.caption.selection.x` in caption space name the same Selection. Matching only the first
  // leaves an element holding a dead name in caption space, and the cut looks clean until the graph
  // refuses it.
  for (const match of text.matchAll(/\{story\.(?:[a-z]+\.)*?(segment|selection|moment)\.([A-Za-z0-9_-]+)/gu)) {
    story.add(`${match[1]!}.${match[2]!}`);
  }
  for (const match of text.matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)[.}]/gu)) {
    const id = match[1]!;
    if (id !== "story") ids.add(id);
  }
  return { story, ids };
}

/**
 * @param source   the Author SVML
 * @param segment  the Segment to keep, named in the Script
 */
export function sliceSource(source: string, segment: string): SliceResult {
  const open = /<script\b[^>]*>/u.exec(source);
  if (open === null) throw new Error("the Source declares no <script>");
  const bodyStart = open.index + open[0].length;
  const bodyEnd = source.indexOf("</script>", bodyStart);
  if (bodyEnd < 0) throw new Error("the Source's <script> is not closed");

  // The Segment to keep, taken out of the Script whole. A Segment is one element in the Script body,
  // so this is a range, and what it contains — its Selections, its Moments — comes with it.
  const body = source.slice(bodyStart, bodyEnd);
  const kept = new RegExp(`<${segment}\\b[^>]*>.*?</${segment}>`, "su").exec(body);
  if (kept === null) throw new Error(`the Script has no <${segment}> Segment`);

  // Which Script names survive: the Segment itself, and every Selection and Moment marked inside it.
  const alive = new Set<string>([`segment.${segment}`]);
  for (const match of kept[0].matchAll(/@([a-z][a-z0-9-]*)\b/gu)) {
    alive.add(`selection.${match[1]!}`);
    alive.add(`moment.${match[1]!}`);
  }

  const skip: (readonly [number, number])[] = [[bodyStart, bodyEnd]];
  for (const comment of source.matchAll(/<!--.*?-->/gsu)) skip.push([comment.index, comment.index + comment[0].length]);
  const all = elements(source, skip);

  // Drop to a fixed point: an element that names something gone is gone, and so is one that names it.
  //
  // What an element names is on its own opening tag. Reading its whole text instead makes a container
  // inherit its children's references, so a Speech Track dies of one dead Take and takes the Film
  // with it. Children are elements too and answer for themselves — which is also why the set is keyed
  // by position: a `<speech:Take>` has no id, and still has to be droppable on its own.
  const opening = (element: Element): string => /^<[^>]*>/su.exec(element.text)?.[0] ?? element.text;
  const dropped = new Map<number, string>();
  const byId = new Map(all.flatMap((element) => element.id === undefined ? [] : [[element.id, element] as const]));
  const deadIds = new Set<string>();
  for (;;) {
    let changed = false;
    for (const element of all) {
      if (dropped.has(element.start)) continue;
      const { story, ids } = references(opening(element));
      const missingStory = [...story].find((name) => !alive.has(name));
      if (missingStory !== undefined) {
        dropped.set(element.start, `story.${missingStory}`);
        if (element.id !== undefined) deadIds.add(element.id);
        changed = true;
        continue;
      }
      const missingId = [...ids].find((id) => deadIds.has(id) && byId.has(id));
      if (missingId !== undefined) {
        dropped.set(element.start, missingId);
        if (element.id !== undefined) deadIds.add(element.id);
        changed = true;
      }
    }
    // A container emptied by the cut goes with its children. A Track written with Items is refused
    // when it has none, and the refusal names the Track rather than the Segment that took its Items
    // away, so leaving it in turns one clean cut into a graph error a reader has to trace back.
    for (const element of all) {
      if (dropped.has(element.start)) continue;
      const children = all.filter((other) =>
        other !== element && other.start > element.start && other.end <= element.end);
      if (children.length === 0) continue;
      if (children.some((child) => !dropped.has(child.start))) continue;
      dropped.set(element.start, "every child was cut");
      if (element.id !== undefined) deadIds.add(element.id);
      changed = true;
    }
    if (!changed) break;
  }

  // Rebuild: the Script body becomes the one Segment, and every dropped element's range is removed.
  // Only the outermost dropped element is cut, since cutting a child of a cut parent removes text
  // twice and leaves the document short of a closing tag.
  const cuts = all
    .filter((element) => dropped.has(element.start))
    .filter((element, _, list) => !list.some((other) =>
      other !== element && other.start <= element.start && other.end >= element.end
      && !(other.start === element.start && other.end === element.end)))
    .sort((left, right) => left.start - right.start);

  let text = "";
  let cursor = 0;
  for (const cut of cuts) {
    if (cut.start < cursor) continue;
    text += source.slice(cursor, cut.start);
    cursor = cut.end;
    // Take the rest of the line with it, so a removal never leaves a blank indented line behind.
    while (source[cursor] === " " || source[cursor] === "\t") cursor += 1;
    if (source[cursor] === "\n") cursor += 1;
  }
  text += source.slice(cursor);

  // The Script body is replaced last, in the rebuilt text, since every range above indexes the
  // original. Its content is unique enough to find again.
  const rebuiltOpen = /<script\b[^>]*>/u.exec(text);
  if (rebuiltOpen === null) throw new Error("the Script was removed by the cut");
  const rebuiltStart = rebuiltOpen.index + rebuiltOpen[0].length;
  const rebuiltEnd = text.indexOf("</script>", rebuiltStart);
  text = `${text.slice(0, rebuiltStart)}\n    ${kept[0]}\n  ${text.slice(rebuiltEnd)}`;

  return {
    text,
    dropped: all.flatMap((element) => dropped.has(element.start)
      ? [{ id: element.id ?? opening(element).slice(0, 40), unresolved: dropped.get(element.start)! }]
      : []),
    keptSegment: segment,
  };
}

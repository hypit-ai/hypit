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

  /**
   * A Selection may open in one Segment and close in another — the Script says so and the parser
   * records each end's own Segment. Cutting the Script to one Segment left the surviving end of such a
   * Selection with no partner, and the fragment was refused outright with SCRIPT_SELECTION_UNCLOSED:
   * not the element dropped, the whole render.
   *
   * The end that is missing is supplied at the fragment's own edge. What that expresses is exactly
   * what the Selection covers inside this stretch — from its mark to the end of the Segment, or from
   * the start of the Segment to its mark — which is what a render over this stretch has to show.
   */
  // The end of a name has to be asserted, not merely looked past: a lookahead alone backtracks, and
  // `@title-out!` was read as an open called `title-ou` with a `t` after it.
  const opened = new Set([...kept[0].matchAll(/(?<![\w/])@([a-z][a-z0-9-]*)(?![a-z0-9!-])/gu)].map((match) => match[1]!));
  const closed = new Set([...kept[0].matchAll(/@\/([a-z][a-z0-9-]*)~?/gu)].map((match) => match[1]!));
  const marked = new Set([...kept[0].matchAll(/@([a-z][a-z0-9-]*)!/gu)].map((match) => match[1]!));
  let fragment = kept[0];
  for (const id of opened) {
    if (closed.has(id) || marked.has(id)) continue;
    const end = fragment.lastIndexOf("</");
    fragment = `${fragment.slice(0, end)} @/${id}\n    ${fragment.slice(end)}`;
    closed.add(id);
  }
  for (const id of closed) {
    if (opened.has(id)) continue;
    // After the Segment's own opening tag and the speaker tag that follows it, which is where the
    // Segment's first spoken word begins.
    const speaker = /^<[^>]*>\s*<[^>]*>/su.exec(fragment);
    const at = speaker === null ? fragment.indexOf(">") + 1 : speaker[0].length;
    fragment = `${fragment.slice(0, at)} @${id}${fragment.slice(at)}`;
    opened.add(id);
  }

  // Which Script names survive: the Segment itself, and every Selection and Moment marked inside it.
  const alive = new Set<string>([`segment.${segment}`]);
  for (const match of fragment.matchAll(/@\/?([a-z][a-z0-9-]*)\b/gu)) {
    alive.add(`selection.${match[1]!}`);
    alive.add(`moment.${match[1]!}`);
  }

  // Which Script names are marked after the kept Segment ends.
  //
  // A name outside the cut is not always a name the element can do without. An element given the span
  // it occupies and a Moment to cut it — `during="program" until={story.moment.done}` — is on screen
  // for the whole of any stretch that ends before that word. Dropping it made the one element a
  // reference is about unrenderable over every Segment but the last, while the round asks for it to be
  // compared over each of them. Marked before the cut it really is gone, and marked inside it survives
  // already, so this is the one case: a close that has not arrived yet, which the fragment reaches by
  // no longer closing.
  const later = new Set<string>();
  for (const match of body.slice(kept.index + kept[0].length).matchAll(/@\/?([a-z][a-z0-9-]*)\b/gu)) {
    later.add(`selection.${match[1]!}`);
    later.add(`moment.${match[1]!}`);
  }
  /** The `until=` attribute naming a name the cut left behind, when dropping it is enough. */
  const closesLater = (tag: string, name: string): string | undefined => {
    if (!later.has(name)) return undefined;
    const written = new RegExp(`\\suntil=\\{story\\.(?:[a-z]+\\.)*?${name.replace(".", "\\.")}\\}`, "u").exec(tag);
    return written?.[0];
  };

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
  /** Opening tags rewritten by the cut, keyed by where the element starts. */
  const reopened = new Map<number, string>();
  const byId = new Map(all.flatMap((element) => element.id === undefined ? [] : [[element.id, element] as const]));
  const deadIds = new Set<string>();
  for (;;) {
    let changed = false;
    for (const element of all) {
      if (dropped.has(element.start)) continue;
      const tag = reopened.get(element.start) ?? opening(element);
      const { story, ids } = references(tag);
      const missingStory = [...story].find((name) => !alive.has(name));
      if (missingStory !== undefined) {
        // A close that has not arrived in this stretch is removed rather than fatal: the element keeps
        // the span it was given and simply does not end inside the fragment.
        const close = closesLater(tag, missingStory);
        if (close !== undefined) {
          reopened.set(element.start, tag.replace(close, ""));
          changed = true;
          continue;
        }
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

  // A rewritten opening tag replaces its own bytes, in the same pass and in the same order as a cut,
  // so the two never disagree about where the cursor is. A tag inside a range being cut is not
  // reached: the cut takes it with everything else.
  const edits = [
    ...cuts.map((element) => ({ start: element.start, end: element.end, text: undefined as string | undefined })),
    ...[...reopened].flatMap(([start, tag]) => {
      const element = all.find((candidate) => candidate.start === start);
      if (element === undefined || dropped.has(start)) return [];
      const length = (/^<[^>]*>/su.exec(element.text)?.[0] ?? element.text).length;
      return [{ start, end: start + length, text: tag }];
    }),
  ].sort((left, right) => left.start - right.start);

  let text = "";
  let cursor = 0;
  for (const edit of edits) {
    if (edit.start < cursor) continue;
    text += source.slice(cursor, edit.start);
    if (edit.text !== undefined) {
      text += edit.text;
      cursor = edit.end;
      continue;
    }
    cursor = edit.end;
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
  text = `${text.slice(0, rebuiltStart)}\n    ${fragment}\n  ${text.slice(rebuiltEnd)}`;

  return {
    text,
    dropped: all.flatMap((element) => dropped.has(element.start)
      ? [{ id: element.id ?? opening(element).slice(0, 40), unresolved: dropped.get(element.start)! }]
      : []),
    keptSegment: segment,
  };
}

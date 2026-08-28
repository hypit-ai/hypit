/**
 * Which stretches of a program are worth looking at, decided from the Source alone.
 *
 * An element drawn over five Segments does not need five looks. It needs one per distinct visual
 * declaration. Deciding that by reading the Source is what makes a round reproducible and what lets
 * the gate ask for coverage rather than for participation.
 *
 * **A distinct declaration is a distinct picture.** Group an element's placements by what they
 * declare and look at each group once, where it first appears. This is also the floor: every placed
 * element has at least one declaration, so every element gets at least one look.
 *
 * The unit is a token range rather than a Segment name because both sides of a comparison already
 * work in words — `frameOfToken` here, `spokenRange` on the reference — so the range is what they
 * both take, and a name comes along only to be read.
 */
import { parseScript } from "@hypit/script";
import type { ParsedNarrative } from "@hypit/script";

/** One thing to look at: an element, over a range of the Script's words, and why it earned a look. */
export type PlanEntry = {
  readonly element: string;
  /** Half-open over the Script's speech tokens, the same index space `frameOfToken` is in. */
  readonly tokens: readonly [number, number];
  /** What that range is, for a reader. Never parsed back — the range is the identity. */
  readonly named: string;
  readonly why: readonly string[];
};

/** A drawing element as the gate enumerates it, before its placements are read. */
export type PlannedElement = {
  readonly id: string;
  readonly tag: string;
  readonly alias: string;
  readonly specifier: string;
};

/**
 * Attributes that say *when* rather than *what*, so they never join a declaration key.
 *
 * Two placements differing only in these are the same design over different words, which is one
 * look and two stretches — the case rule 1 exists to collapse.
 */
const WINDOW_ATTRIBUTES = new Set([
  "during", "at", "for", "start", "end", "selection", "segment", "moment", "until",
  "until-boundary", "terminal", "semantic", "document", "narrative", "program-ref",
]);

/**
 * Attributes naming material a Build has not made, so they never join a declaration key either.
 *
 * Every one of these is a flat placeholder in the render this plan is for. Two Items differing only
 * in which unbuilt picture they name draw the identical mock, so looking at both spends a subagent
 * to see the same grey rectangle twice.
 */
const MOCKED_ATTRIBUTES = new Set(["image", "video", "media", "source", "icon", "audio", "source-audio"]);

/** Never a declaration: the id is what the key is being computed *for*. */
const IGNORED_ATTRIBUTES = new Set(["id"]);

type Placement = {
  readonly element: string;
  readonly tag: string;
  readonly key: string;
  readonly stretch: Stretch;
};

type Stretch = {
  readonly tokens: readonly [number, number];
  readonly named: string;
};

/** Every attribute on an opening tag, as written. */
function attributesOf(text: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(/\b([a-z][a-z0-9-]*)="([^"]*)"/gu)) found.set(match[1] ?? "", match[2] ?? "");
  // A reference is written `attr={id}` rather than quoted, and it is the form every Recipe and Frame
  // arrives in, so a key built from quoted attributes alone would miss the whole declaration.
  for (const match of text.matchAll(/\b([a-z][a-z0-9-]*)=\{([^}]*)\}/gu)) found.set(match[1] ?? "", `{${match[2] ?? ""}}`);
  return found;
}

/**
 * What this placement declares, as one comparable string.
 *
 * Everything on the tag except the three excluded sets, sorted so attribute order — which this
 * markup does not make significant — cannot split one group into two. The tag name leads, because
 * the same attributes on a different element are a different picture.
 *
 * Taking everything rather than a list of known Recipe attributes is deliberate. `screen-overlay`
 * declares its entire appearance as tag literals and names no Recipe at all, and a package added
 * tomorrow will be read correctly without this file learning its vocabulary. The cost of the wide
 * net is a split group, which is one extra look; the cost of a narrow one is a merged group, which
 * is a picture nobody sees.
 */
function declarationKey(tag: string, attributes: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  for (const [name, value] of attributes) {
    if (WINDOW_ATTRIBUTES.has(name) || MOCKED_ATTRIBUTES.has(name) || IGNORED_ATTRIBUTES.has(name)) continue;
    parts.push(`${name}=${value}`);
  }
  return `${tag}|${parts.sort().join("|")}`;
}

/** The whole Script, for an element bound to the program rather than to a marked range. */
function wholeProgram(parsed: ParsedNarrative): Stretch {
  return { tokens: [0, parsed.tokens.length], named: "the whole program" };
}

/**
 * Where a placement's `during=` or `at=` puts it, in words.
 *
 * Returns undefined when the binding names something the Script does not mark, which is a Source
 * defect `preview_check` reports rather than something to guess at here.
 */
function stretchOf(attributes: ReadonlyMap<string, string>, parsed: ParsedNarrative): Stretch | undefined {
  const during = attributes.get("during");
  if (during === "program") return wholeProgram(parsed);

  const named = (value: string | undefined): { readonly kind: string; readonly id: string } | undefined => {
    const match = /^\{story\.(segment|selection|moment)\.([A-Za-z0-9_-]+)\}$/u.exec(value ?? "");
    return match === undefined || match === null ? undefined : { kind: match[1]!, id: match[2]! };
  };

  const bound = named(during) ?? named(attributes.get("at"));
  if (bound === undefined) return undefined;

  if (bound.kind === "segment") {
    const segment = parsed.segments.find((item) => item.id === bound.id);
    return segment === undefined
      ? undefined
      : { tokens: [segment.tokenStart, segment.tokenEndExclusive], named: `segment ${bound.id}` };
  }
  if (bound.kind === "selection") {
    const selection = parsed.selections.find((item) => item.id === bound.id);
    return selection === undefined
      ? undefined
      : {
        tokens: [selection.open.boundary.tokenIndex, selection.close.boundary.tokenIndex],
        named: `selection ${bound.id}`,
      };
  }
  // A Moment is an instant, not a range. What it marks is a change inside whichever Segment holds
  // it, so that Segment is the stretch a look would be rendered over.
  const moment = parsed.moments.find((item) => item.id === bound.id);
  if (moment === undefined) return undefined;
  const index = moment.boundary.tokenIndex;
  const holding = parsed.segments.find((item) => index >= item.tokenStart && index < item.tokenEndExclusive);
  return holding === undefined
    ? undefined
    : { tokens: [holding.tokenStart, holding.tokenEndExclusive], named: `segment ${holding.id} (at moment ${bound.id})` };
}

/**
 * The body of one element, so its children can be read.
 *
 * These Tracks do not nest inside themselves, so the first matching close tag is this element's.
 * Returns an empty string for a self-closing element, which has no children to find.
 */
function bodyOf(svml: string, alias: string, tag: string, id: string): string {
  const opening = new RegExp(`<${alias}:${tag}\\b[^>]*?\\bid="${id}"[^>]*?(/?)>`, "su").exec(svml);
  if (opening === null || opening[1] === "/") return "";
  const after = svml.slice(opening.index + opening[0].length);
  const close = after.indexOf(`</${alias}:${tag}>`);
  return close === -1 ? after : after.slice(0, close);
}

/**
 * What an element's own children add to its declaration.
 *
 * A child that binds a window is a placement in its own right and is read as one. A child that does
 * not is part of how its parent looks: `<media-track:Sampling>` is a zoom across the whole window,
 * `<text:Motion>` holds the keyframes, `<caption-fine:Fallback>` names the font to reach for, and a
 * `<P>` or `<Span>` overrides the Style for one run of text. None of them appears on the parent tag,
 * so a key built from attributes alone reads two Items as one design when only one of them animates.
 *
 * Sorted, because the order children are written in is not what they look like.
 */
function childDeclarations(body: string, parsed: ParsedNarrative): readonly string[] {
  const parts: string[] = [];
  for (const child of body.matchAll(/<([a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*)\b([^>]*?)\/?>/gsu)) {
    const tag = child[1] ?? "";
    const attributes = attributesOf(child[0] ?? "");
    if (stretchOf(attributes, parsed) !== undefined) continue;
    parts.push(declarationKey(tag, attributes));
  }
  return parts.sort();
}

/** The opening tag of one element, by id. */
function openingOf(svml: string, alias: string, tag: string, id: string): string {
  return new RegExp(`<${alias}:${tag}\\b[^>]*?\\bid="${id}"[^>]*?/?>`, "su").exec(svml)?.[0] ?? "";
}

/**
 * The Styles a caption Program hands out, and the stretch each one covers.
 *
 * A caption Track is one tag with no window on it — it draws wherever the Script has words — so
 * reading its placements the way every other element is read finds exactly one, and reports one
 * design. That is wrong whenever the Program overrides a Style: `<caption:Use style=… selection=…>`
 * is how one stretch is drawn differently from the rest, and it is written inside the Program rather
 * than on the Track, so nothing on the Track says it happened.
 *
 * Each override is its own declaration over its own words. The default is a declaration too, over
 * whatever the overrides did not claim, which is where the Track's single placement belongs.
 */
function captionStyles(svml: string, element: PlannedElement, parsed: ParsedNarrative): readonly Placement[] {
  const opening = openingOf(svml, element.alias, element.tag, element.id);
  const program = /\bprogram=\{([A-Za-z0-9_-]+)\}/u.exec(opening)?.[1];
  if (program === undefined) return [];
  const declaring = new RegExp(`<[a-z][a-z0-9-]*:Program\\b[^>]*?\\bid="${program}"[^>]*?(/?)>`, "su").exec(svml);
  if (declaring === null) return [];

  const body = declaring[1] === "/" ? "" : (() => {
    const after = svml.slice(declaring.index + declaring[0].length);
    const close = after.search(/<\/[a-z][a-z0-9-]*:Program>/u);
    return close === -1 ? after : after.slice(0, close);
  })();

  const tag = `${element.alias}:${element.tag}`;
  const found: Placement[] = [];
  for (const use of body.matchAll(/<[a-z][a-z0-9-]*:Use\b([^>]*?)\/?>/gsu)) {
    const attributes = attributesOf(use[0] ?? "");
    // A Use names its stretch with `selection=`, not the `during=` every drawn element uses, because
    // it is assigning a Style to a run of words rather than placing a picture over them.
    const marked = /^\{story\.selection\.([A-Za-z0-9_-]+)\}$/u.exec(attributes.get("selection") ?? "")?.[1];
    const selection = marked === undefined ? undefined : parsed.selections.find((item) => item.id === marked);
    const stretch = selection === undefined
      ? stretchOf(attributes, parsed)
      : {
        tokens: [selection.open.boundary.tokenIndex, selection.close.boundary.tokenIndex] as readonly [number, number],
        named: `selection ${marked}`,
      };
    const style = attributes.get("style");
    if (stretch === undefined || style === undefined) continue;
    found.push({
      element: element.id, tag: `${tag} (caption:Use)`,
      key: `${tag}|style=${style}`, stretch,
    });
  }
  return found;
}

/**
 * Every placement one drawing element makes.
 *
 * A Track holding forty Items draws nothing itself: the Items carry the windows and the Recipes, and
 * they are what a look is actually of. So the element's own tag is a placement only when it binds a
 * window itself, and each child that binds one is a placement too.
 */
function placementsOf(svml: string, element: PlannedElement, parsed: ParsedNarrative): readonly Placement[] {
  const found: Placement[] = [];
  const opening = openingOf(svml, element.alias, element.tag, element.id);
  const own = attributesOf(opening);
  const body = bodyOf(svml, element.alias, element.tag, element.id);
  const ownKey = [declarationKey(`${element.alias}:${element.tag}`, own), ...childDeclarations(body, parsed)].join("&&");
  const ownStretch = stretchOf(own, parsed);
  if (ownStretch !== undefined) {
    found.push({
      element: element.id, tag: `${element.alias}:${element.tag}`,
      key: ownKey, stretch: ownStretch,
    });
  }

  for (const child of body.matchAll(/<([a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*)\b([^>]*?)(\/?)>/gsu)) {
    const tag = child[1] ?? "";
    const attributes = attributesOf(child[0] ?? "");
    const stretch = stretchOf(attributes, parsed);
    if (stretch === undefined) continue;
    // An Item's own children — its Sampling, its Paint, its inline runs — are part of how it looks.
    const inner = child[3] === "/" ? "" : (() => {
      const after = body.slice((child.index ?? 0) + (child[0]?.length ?? 0));
      const close = after.indexOf(`</${tag}>`);
      return close === -1 ? "" : after.slice(0, close);
    })();
    // The child's own declaration is what it draws, but it sits inside the Track's, so the Track's
    // is part of the key: the same Item under two Tracks with different Canvases is two pictures.
    found.push({
      element: element.id,
      tag,
      key: `${ownKey}>>${[declarationKey(tag, attributes), ...childDeclarations(inner, parsed)].join("&&")}`,
      stretch,
    });
  }

  // An element that binds no window anywhere is on screen for the whole program — a persistent
  // badge, a Film-wide treatment — and the whole program is the stretch it is looked at over.
  if (found.length === 0) {
    found.push({
      element: element.id,
      tag: `${element.alias}:${element.tag}`,
      key: ownKey,
      stretch: wholeProgram(parsed),
    });
  }
  return found;
}

/** One look per distinct declaration, at the stretch where that declaration first appears. */
function firstOfEachDeclaration(placements: readonly Placement[]): readonly PlanEntry[] {
  const seen = new Set<string>();
  const entries: PlanEntry[] = [];
  for (const placement of placements) {
    if (seen.has(placement.key)) continue;
    seen.add(placement.key);
    entries.push({
      element: placement.element,
      tokens: placement.stretch.tokens,
      named: placement.stretch.named,
      why: [`first use of this declaration (${placement.tag})`],
    });
  }
  return entries;
}

/**
 * Merge nominations that landed on the same thing.
 *
 * Two distinct declarations can first appear over the same stretch. That is one rendered picture
 * with both reasons, not two copies of the same picture.
 */
function merge(entries: readonly PlanEntry[]): readonly PlanEntry[] {
  const byKey = new Map<string, PlanEntry>();
  for (const entry of entries) {
    const key = `${entry.element} ${entry.tokens[0]}-${entry.tokens[1]}`;
    const held = byKey.get(key);
    if (held === undefined) { byKey.set(key, entry); continue; }
    byKey.set(key, { ...held, why: [...held.why, ...entry.why.filter((reason) => !held.why.includes(reason))] });
  }
  return [...byKey.values()];
}

/** What a round has to look at, for one Source. */
export function reviewPlan(input: {
  readonly svml: string;
  readonly svmlPath: string;
  readonly scriptBody: { readonly id: string; readonly text: string; readonly offset: number };
  readonly drawn: readonly PlannedElement[];
}): readonly PlanEntry[] {
  const parsed = parseScript(input.svmlPath, input.scriptBody.text, input.scriptBody.offset);
  const entries: PlanEntry[] = [];

  for (const element of input.drawn) {
    // A caption Track's designs are declared inside its Program, not on the Track, so they are read
    // separately and joined to whatever the ordinary placement scan found.
    const placements = [
      ...placementsOf(input.svml, element, parsed),
      ...(element.specifier.includes("caption") ? captionStyles(input.svml, element, parsed) : []),
    ];
    entries.push(...firstOfEachDeclaration(placements));
  }
  return merge(entries);
}

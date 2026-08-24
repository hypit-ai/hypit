import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface } from "@hypit/markup";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import { parseScript } from "@hypit/script";
import { videoCliDistribution } from "@hypit/video-cli";
import { loadStudioAdapterRegistry } from "@hypit/studio/src/adapter-profile.js";
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { readStudioSession } from "@hypit/studio/src/session.js";
import type { StudioSession } from "@hypit/studio/src/session.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";

import { aliasPattern, invokedFrom, nearestPackageRoot, referenceRoot, scriptBody } from "./authoring.js";
import { assert, round } from "./media.js";

export type PreviewCheckInput = {
  readonly run: string;
  readonly runtime?: string;
};

const AWAITING = "the Studio projection closure requires unresolved capabilities:";

/**
 * Preview-check a reconstruction before it is delivered.
 *
 * `pnpm hypit check` proves a Source is legal; it proves nothing about whether
 * the tracks it declares can actually be built. A track that fails here fails
 * the same way when the author opens Studio, so find out now.
 *
 * The input is the Run Source, not the Author SVML. Studio's unit of work is
 * the Run — it reads the Author SVML back out of it — so a check that took the
 * `.svml` would be checking something Studio never opens.
 *
 * Studio names what it cannot resolve and stops, so preflight throwing is itself
 * the report rather than something to inspect around. Two kinds of issue come
 * back, and they mean opposite things. An unresolved *capability* means the
 * graph traced all the way to a Film and a semantic spine, and what remains is
 * work a Provider has to do — the ordinary state of a Source that declares its
 * generation rather than performing it. Every other issue means the graph is
 * wrong and no amount of generation will fix it. Only the second kind is
 * reported as unsound. `StudioPreflightError` carries `issues` as an array so
 * the two can be told apart rather than matched out of one joined message.
 */
export async function previewCheck(
  input: PreviewCheckInput,
  roots: { readonly packageRoot: string },
): Promise<Record<string, unknown>> {
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  const runtimePath = input.runtime === undefined ? undefined : resolve(cwd, input.runtime);
  const packageRoot = nearestPackageRoot(dirname(runPath)) ?? roots.packageRoot;
  const workspaceRoot = dirname(runPath);

  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");

  const registry = await loadStudioAdapterRegistry({ workspaceRoot, packageRoot, distributionPackageRoot });
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
  const archive = await openStudioArchive(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);

  let session: StudioSession | undefined;
  let refusal: string | undefined;
  let awaiting: readonly string[] | undefined;
  try {
    const run = await loadStudioRun({
      run: runPath,
      domain,
      ...(archive === undefined ? {} : { archive }),
    });
    // Preflight first, so an unopenable Run is reported as the refusal it is
    // rather than as whatever the build happens to fail on afterwards.
    inspectStudioRun(registry, run.source, run);
    session = await readStudioSession({
      domain,
      registry,
      run,
      workspaceRoot,
      ...(archive === undefined ? {} : { archive }),
      revision: 0,
    });
  } catch (error) {
    const issues = (error as { readonly issues?: unknown } | null)?.issues;
    if (Array.isArray(issues) && issues.every((issue) => String(issue).startsWith(AWAITING))) {
      awaiting = issues.flatMap((issue) => String(issue).slice(AWAITING.length).split(",").map((capability) => capability.trim()));
    } else {
      refusal = error instanceof Error ? error.message : String(error);
    }
  } finally {
    // Close before reporting: a runtime archive left open outlives the check.
    await archive?.close();
  }

  if (refusal !== undefined) return { run: runPath, sound: false, refused: refusal };

  if (awaiting !== undefined) {
    // The graph traced all the way to a Film and a semantic spine; what is left is
    // work a Provider has to do. That is a pass for this gate, and the delivery
    // measurements happen on the real Build either way.
    const noun = awaiting.length === 1 ? "capability" : "capabilities";
    return {
      run: runPath,
      sound: true,
      summary: `the graph is sound, waiting on ${awaiting.length} ${noun}.`,
      awaiting,
    };
  }

  const tracks = session!.snapshot.tracks;
  const problems: Record<string, unknown>[] = [];
  for (const track of tracks) {
    const { status, errors, output } = track.provenance;
    if (errors.length > 0) problems.push({ track: track.label, errors });
    else if (status === "unresolved") problems.push({ track: track.label, unresolved: output });
  }

  if (problems.length === 0) {
    return { run: runPath, sound: true, summary: `every Track resolved (${tracks.length}).`, tracks: tracks.length };
  }
  return { run: runPath, sound: false, problems };
}

export type ReconstructionCheckInput = {
  readonly run: string;
  readonly reference_id?: string;
};

/**
 * Which clock timed the stand-ins an element's comparisons were made over.
 *
 * `reference` is every recorded comparison drawn at the pace the reference speaks those words;
 * `estimate` is every one drawn at the pace `estimate:Speech` predicts; `mixed` is both among them.
 * `not recorded` is a comparison whose picture carried no `render_element` sidecar, so what timed it
 * is unknown.
 */
type TimingBasis = "reference" | "estimate" | "mixed" | "not recorded";

/** One element that draws a Track, and the comparisons recorded against its id. */
type ElementReport = {
  readonly element: string;
  readonly id: string;
  readonly package_name: string;
  readonly comparisons: number;
  /** The stretches it was compared against: a shot, or the words a Segment or Selection marks. */
  readonly compared_against: readonly string[];
  readonly state: string;
  readonly timing_basis: TimingBasis;
  readonly note?: string;
};

/** One timed picture and the Recipe key that decides what it draws once its material ends. */
type PlaybackReport = {
  readonly id: string;
  readonly tag: string;
  readonly recipe: string;
  readonly playback: string;
};

/** One run of consecutive Script words that nothing filling the frame is drawn over. */
type CoverageGap = {
  readonly segment: string;
  /** The words themselves, so a reader can find the stretch in the Script. */
  readonly words: string;
  readonly word_count: number;
};

/** How many words the Script has, and which runs of them carry no full-frame picture. */
type CoverageReport = {
  readonly words: number;
  readonly gaps: readonly CoverageGap[];
};

type Edge = "left" | "top" | "right" | "bottom";

/** One edge of a Frame that lands outside the Canvas, and how far past it reaches. */
type FrameEdge = {
  readonly edge: Edge;
  /** The value as the Source writes it. */
  readonly declared: string;
  /** How far past the Canvas edge it sits, as a share of the Canvas and in Canvas pixels. */
  readonly outside_percent: number;
  readonly outside_pixels: number;
};

/** One Frame that does not sit wholly inside its Canvas, and the elements drawn into it. */
type OutOfBoundsFrame = {
  readonly frame: string;
  readonly canvas: string;
  /** Every element that names this Frame, by its own id. */
  readonly elements: readonly string[];
  readonly edges: readonly FrameEdge[];
  /** How much of the Frame's area lands off the Canvas, from 0 to 1. */
  readonly outside_fraction: number;
};

/** A rectangle in Canvas pixels. The origin is top-left and y increases downward. */
type Box = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };

/**
 * Whether some rectangles, together, leave no part of a Canvas unpainted.
 *
 * One picture filling the frame is the ordinary case and the cheap one. What this exists for is the
 * case where no single picture does: a split screen, a stacked pair, a grid of panels. Those cover the
 * delivery completely while every one of them is, on its own, an insert.
 *
 * The test is exact rather than an area sum, because rectangles overlap and overlapping ones add up to
 * more area than they cover. Cutting the Canvas at every edge any rectangle contributes leaves a grid
 * of cells, each of which is wholly inside a rectangle or wholly outside all of them; the Canvas is
 * covered when no cell is outside all of them. Rectangles are grouped by the Canvas they are rooted
 * in, since two rooted in different Canvases never meet.
 */
function fillsACanvas(
  placed: readonly { readonly canvas: string; readonly box: Box }[],
  canvases: ReadonlyMap<string, Box>,
): boolean {
  const byCanvas = new Map<string, Box[]>();
  for (const item of placed) byCanvas.set(item.canvas, [...(byCanvas.get(item.canvas) ?? []), item.box]);
  for (const [id, boxes] of byCanvas) {
    const canvas = canvases.get(id);
    if (canvas === undefined) continue;
    // Clipped to the Canvas: a Frame declared past the edge covers only the part of the picture that
    // exists, and counting the rest would let an overhang stand in for coverage it never provides.
    const clipped = boxes
      .map((box) => ({
        left: Math.max(box.left, canvas.left), top: Math.max(box.top, canvas.top),
        right: Math.min(box.right, canvas.right), bottom: Math.min(box.bottom, canvas.bottom),
      }))
      .filter((box) => box.right > box.left && box.bottom > box.top);
    if (clipped.length === 0) continue;
    const xs = [...new Set([canvas.left, canvas.right, ...clipped.flatMap((box) => [box.left, box.right])])]
      .filter((value) => value >= canvas.left && value <= canvas.right).sort((a, b) => a - b);
    const ys = [...new Set([canvas.top, canvas.bottom, ...clipped.flatMap((box) => [box.top, box.bottom])])]
      .filter((value) => value >= canvas.top && value <= canvas.bottom).sort((a, b) => a - b);
    let whole = true;
    for (let column = 0; whole && column + 1 < xs.length; column += 1) {
      for (let row = 0; whole && row + 1 < ys.length; row += 1) {
        const x = (xs[column]! + xs[column + 1]!) / 2;
        const y = (ys[row]! + ys[row + 1]!) / 2;
        whole = clipped.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom);
      }
    }
    if (whole) return true;
  }
  return false;
}

type FrameDeclaration ={ readonly within: string; readonly edges: Readonly<Record<Edge, string>> };
type FrameGeometry = {
  readonly canvases: ReadonlyMap<string, Box>;
  readonly declared: ReadonlyMap<string, FrameDeclaration>;
  /** The rectangle a Frame or Canvas finally occupies, in the pixels of the Canvas it is rooted in. */
  readonly resolve: (id: string) => Box | undefined;
  /** Which Canvas a Frame is finally measured inside, found by following `within` up to one. */
  readonly canvasOf: (id: string) => string | undefined;
};

/**
 * Where every Canvas and Frame the Source declares actually sits.
 *
 * `within` names a Canvas or a parent Frame, and a length is a number followed by `px` or `%`, a
 * percentage resolving against the parent's width on the x axis and its height on the y axis. So a
 * Frame is resolved by resolving whatever it is written inside and measuring its own edges against
 * that rectangle, however deep the chain runs.
 *
 * Two readings need this: whether a Frame reaches outside its Canvas, and whether the Frames drawn
 * over a word add up to the whole picture.
 */
function frameGeometry(svml: string): FrameGeometry {
  const space = aliasPattern(svml, "@hypit/spatial", "space");
  const canvases = new Map<string, Box>();
  for (const match of svml.matchAll(new RegExp(`<(?:${space}):Canvas\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const width = Number(/\bwidth="(\d+)"/u.exec(attributes)?.[1]);
    const height = Number(/\bheight="(\d+)"/u.exec(attributes)?.[1]);
    if (id !== undefined && Number.isFinite(width) && Number.isFinite(height)) {
      canvases.set(id, { left: 0, top: 0, right: width, bottom: height });
    }
  }

  const declared = new Map<string, FrameDeclaration>();
  for (const match of svml.matchAll(new RegExp(`<(?:${space}):Frame\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const within = /\bwithin=\{([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
    const written = (name: Edge): string | undefined => new RegExp(`\\b${name}="([^"]+)"`, "u").exec(attributes)?.[1];
    const left = written("left");
    const top = written("top");
    const right = written("right");
    const bottom = written("bottom");
    if (id === undefined || within === undefined) continue;
    if (left === undefined || top === undefined || right === undefined || bottom === undefined) continue;
    declared.set(id, { within, edges: { left, top, right, bottom } });
  }

  const measure = (value: string, span: number, origin: number): number | undefined => {
    const parsed = /^\s*(-?\d+(?:\.\d+)?)\s*(%|px)\s*$/u.exec(value);
    if (parsed === null) return undefined;
    const number = Number(parsed[1]);
    return parsed[2] === "%" ? origin + span * number / 100 : origin + number;
  };

  const resolving = new Set<string>();
  const resolved = new Map<string, Box | undefined>();
  const resolve = (id: string): Box | undefined => {
    const canvas = canvases.get(id);
    if (canvas !== undefined) return canvas;
    if (resolved.has(id)) return resolved.get(id);
    // A Frame written inside itself is refused by `hypit check`; this keeps the walk finite anyway.
    if (resolving.has(id)) return undefined;
    const frame = declared.get(id);
    if (frame === undefined) return undefined;
    resolving.add(id);
    const parent = resolve(frame.within);
    resolving.delete(id);
    let box: Box | undefined;
    if (parent !== undefined) {
      const width = parent.right - parent.left;
      const height = parent.bottom - parent.top;
      const left = measure(frame.edges.left, width, parent.left);
      const top = measure(frame.edges.top, height, parent.top);
      const right = measure(frame.edges.right, width, parent.left);
      const bottom = measure(frame.edges.bottom, height, parent.top);
      if (left !== undefined && top !== undefined && right !== undefined && bottom !== undefined) {
        box = { left, top, right, bottom };
      }
    }
    resolved.set(id, box);
    return box;
  };

  const canvasOf = (id: string): string | undefined => {
    const seen = new Set<string>();
    let at: string | undefined = id;
    while (at !== undefined && !canvases.has(at)) {
      if (seen.has(at)) return undefined;
      seen.add(at);
      at = declared.get(at)?.within;
    }
    return at;
  };

  return { canvases, declared, resolve, canvasOf };
}

/**
 * Every Frame that reaches past the Canvas it is measured inside.
 *
 * A Frame places its four edges against a Canvas, and an edge outside 0%–100% puts that much of
 * whatever is drawn into it off the picture. This is arithmetic on the Source: no threshold, no
 * measurement of a rendered frame, no observer.
 *
 * It is the one thing on this route a comparison cannot see. An element authored mostly below the
 * bottom edge is drawn at the Canvas the Source declares, and so is the stand-in it is compared
 * against, so the render and the reference both put it in the same place off the edge and agree with
 * each other. Both are wrong the same way, which reads as correct.
 *
 * Reaching past the edge is also how a great deal of correct authoring works: an element that slides
 * in from off-screen is outside at the start of its window, and a full-bleed picture is routinely
 * declared past the edge so a `fit` crops it rather than letterboxing it. The arithmetic is the same
 * either way, so what this produces is a list of candidates for a reader to answer one at a time. It
 * never decides `passed`: the Source cannot tell an intended overhang from an unintended one, and a
 * gate that ruled on it would be ruling on something it cannot see.
 */
function framesPastTheCanvas(svml: string): readonly OutOfBoundsFrame[] {
  const { canvases, declared, resolve, canvasOf } = frameGeometry(svml);

  // Which elements draw into each Frame. A Track names it `frame=`, and a speech Track names the Frame
  // it draws each Take into `visual-frame=`, so any attribute whose name ends in `frame` counts.
  const bound = new Map<string, string[]>();
  for (const match of svml.matchAll(/<([a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*)\b([^>]*?)\/?>/gsu)) {
    const tag = match[1] ?? "";
    const attributes = match[2] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1] ?? tag;
    for (const reference of attributes.matchAll(/\b[a-z-]*frame=\{([A-Za-z0-9_-]+)\}/gu)) {
      const frame = reference[1] ?? "";
      const named = bound.get(frame) ?? [];
      if (!named.includes(id)) named.push(id);
      bound.set(frame, named);
    }
  }

  const report: OutOfBoundsFrame[] = [];
  for (const [id, frame] of declared) {
    const box = resolve(id);
    const canvasId = canvasOf(id);
    const canvas = canvasId === undefined ? undefined : canvases.get(canvasId);
    if (box === undefined || canvas === undefined || canvasId === undefined) continue;
    const width = canvas.right - canvas.left;
    const height = canvas.bottom - canvas.top;
    // An edge is outside when it is outside the Canvas at all, on either side. A Frame parked wholly
    // off the left has both its x edges past the left edge, and naming only the one on its own side
    // would report half of where it sits.
    const outside = (value: number, low: number, high: number): number => Math.max(low - value, value - high, 0);
    const past: readonly { readonly edge: Edge; readonly outside: number; readonly span: number }[] = [
      { edge: "left", outside: outside(box.left, canvas.left, canvas.right), span: width },
      { edge: "top", outside: outside(box.top, canvas.top, canvas.bottom), span: height },
      { edge: "right", outside: outside(box.right, canvas.left, canvas.right), span: width },
      { edge: "bottom", outside: outside(box.bottom, canvas.top, canvas.bottom), span: height },
    ];
    const edges = past.filter((item) => item.outside > 0).map((item) => ({
      edge: item.edge,
      declared: frame.edges[item.edge],
      outside_percent: round(item.outside / item.span * 100),
      outside_pixels: round(item.outside),
    }));
    if (edges.length === 0) continue;
    const area = Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
    const inside = Math.max(0, Math.min(box.right, canvas.right) - Math.max(box.left, canvas.left))
      * Math.max(0, Math.min(box.bottom, canvas.bottom) - Math.max(box.top, canvas.top));
    report.push({
      frame: id,
      canvas: canvasId,
      elements: bound.get(id) ?? [],
      edges,
      outside_fraction: round(area === 0 ? 1 : 1 - inside / area),
    });
  }
  return report;
}

/**
 * Report what the route can still settle after the Source is written and before a Build runs: which
 * reconstructed elements have never been compared against the reference, which words of the Script
 * nothing draws a full-frame picture over, and which timed pictures are configured to stop before
 * their window ends.
 *
 * `preview_check` proves the graph is wired. It proves nothing about whether what the graph draws
 * resembles the reference video, and a Source can pass every structural check while a component
 * draws something the reference never contained. Closing that gap is
 * `references/reconstruction/reconstruction-loop.md`, which is prose, and prose is what a route
 * skips silently. This is the same requirement as a command that answers whether it was met.
 *
 * What it checks is **participation, not convergence**. The loop is deliberately bounded and may
 * stop with visible differences remaining, so requiring convergence here would contradict it. An
 * element that was compared once and stopped at its ceiling passes; an element nobody ever looked
 * at does not.
 *
 * Every element that draws is required, whichever package draws it. A Track from installed
 * vocabulary carries authored values exactly as a project-local one does — a caption Style's size,
 * colour and placement are as unverified as a new package's — and `render_element` stands in for the
 * speech, so it renders before a Build like any other.
 *
 * A comparison counts whether its answer came back in-band (`complete`, the gemini observer) or was
 * handed out to be answered by looking (`pending`, the agent observer); only `failed` is not a
 * comparison. The gate cannot judge whether the shot an element was compared against actually showed
 * it, so the shots are reported for a reader, and a lone comparison is called out rather than assumed
 * meaningful.
 *
 * Each element also carries what timed the stand-ins it was compared over, read from the sidecar
 * `render_element` writes beside its output and carried into the log by `compare_reconstruction`.
 * That is reported rather than required: participation is the rule here, and an estimate-timed
 * comparison is a comparison. What it says is which elements have had their behaviour over their
 * window looked at and which have only had their layout looked at.
 *
 * Where each Frame sits is decided from the Source alone and is reported rather than required. A
 * Frame with an edge outside 0%–100% of its Canvas puts that much of whatever is drawn into it off
 * the picture, and a comparison cannot see it: the render and the stand-in are drawn at the same
 * Canvas, so both put the element in the same place off the edge and agree. Reaching past the edge is
 * also how an element slides in from off-screen and how a full-bleed picture is cropped by a `fit`,
 * which look identical here, so `passed` does not depend on it.
 *
 * Frame coverage is decided from the Source alone and is required: a word is either drawn over by
 * something bound to the whole picture or it is not. What covers is read from an element's own
 * opening tag — a full-bleed `frame=`, the `canvas=`, or a speech Track's full-frame `visual-frame=`
 * over the Segments whose Takes carry a picture — so a Track never inherits its children's `during=`
 * bindings.
 *
 * A project that places no drawing element passes with nothing to require.
 */
export async function reconstructionCheck(
  input: ReconstructionCheckInput,
  roots: { readonly packageRoot: string },
): Promise<Record<string, unknown>> {
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  // Where the Source's imports resolve from. A project's own packages are installed against the
  // project, so the Run names its own root: the nearest directory at or above it holding a
  // `package.json`, which is the same walk `hypit check` makes. Taking it from the working directory
  // instead meant a Run named by a path resolved its packages somewhere else entirely, and the
  // project's own elements read as packages that do not exist.
  const packageRoot = nearestPackageRoot(dirname(runPath)) ?? roots.packageRoot;

  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${input.run} declares no <author source="…"/>`);
  const svmlPath = resolve(dirname(runPath), author);
  const svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  // Read from the Source alone, so every answer below carries it, including the ones that stop early.
  const overhang = framesPastTheCanvas(svml);

  // Every package this Source imports. The scope is whatever the Source wrote: a project that declares
  // a vocabulary gap and fills it publishes under its own scope, and those elements draw exactly as an
  // installed one does.
  const imports = [...svml.matchAll(/<import\s+as="([^"]+)"\s+from="(@[^"@/]+\/[^"@]+)@\d+"/gu)]
    .map((match) => ({ alias: match[1] ?? "", specifier: match[2] ?? "" }));
  if (imports.length === 0) {
    return {
      run: runPath,
      passed: true,
      summary: ["the Source imports no package; nothing to compare."],
      elements: [],
      playback: [],
      uncovered: [],
      out_of_bounds: overhang,
    };
  }

  // Which of their Surfaces draw a Track. A Style Surface publishes a Style and draws nothing, so
  // requiring a comparison of it would be asking for a picture that does not exist.
  const specifiers = [...new Set(imports.map((item) => item.specifier))];
  // One unresolvable package used to take the rest with it: the whole selection loads or none of it
  // does, and a swallowed failure left `drawingTags` empty, so every element in the Source read as
  // drawing nothing and the check passed on an empty answer. Fall back to loading them one at a time so
  // the ones that resolve still count, and keep the names of the ones that did not.
  const unresolved: string[] = [];
  const loaded = await loadNodePackageSelection(specifiers, packageRoot).catch(async () => {
    const each = await Promise.all(specifiers.map(async (specifier) =>
      await loadNodePackageSelection([specifier], packageRoot).catch(() => {
        unresolved.push(specifier);
        return [];
      })));
    return each.flat();
  });
  const drawingTags = new Set<string>();
  for (const pack of loaded) {
    for (const facet of pack.contribution.hostFacets ?? []) {
      if (facet.abi !== markupSurfaceHostFacetAbi) continue;
      const surface = facet.implementation as RegisteredSurface;
      const draws = surface.outputs.some((output) =>
        output.module.name === "@hypit/composition" && (output.name === "VisualTrack" || output.name === "AudioTrack"));
      if (draws) drawingTags.add(`${pack.specifier}#${surface.tag}`);
    }
  }

  // Every use of one of those tags, by the id the Source gave it.
  const drawn: { readonly id: string; readonly tag: string; readonly alias: string; readonly specifier: string }[] = [];
  for (const { alias, specifier } of imports) {
    const pattern = new RegExp(`<${alias}:([A-Za-z][A-Za-z0-9]*)\\b[^>]*?\\bid="([^"]+)"`, "gu");
    for (const match of svml.matchAll(pattern)) {
      const tag = match[1] ?? "";
      const id = match[2] ?? "";
      if (!drawingTags.has(`${specifier}#${tag}`)) continue;
      if (!drawn.some((item) => item.id === id)) drawn.push({ id, tag, alias, specifier });
    }
  }

  // Which Normalize ids carry a picture. A take normalized with `video="none"` is a voice: it has no
  // window to fill, and nothing it feeds puts anything on the Canvas.
  const moving = new Set<string>();
  const pipeline = aliasPattern(svml, "@hypit/media-pipeline", "pipeline");
  for (const match of svml.matchAll(new RegExp(`<(?:${pipeline}):Normalize\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const video = /\bvideo="([^"]+)"/u.exec(attributes)?.[1];
    if (id !== undefined && video !== undefined && video !== "none") moving.add(id);
  }

  // ---- Timed pictures that stop before their window ends ----
  //
  // A generated take is asked for a whole number of seconds, and the window it has to fill comes from
  // speech the same Build synthesizes. The two lengths are arrived at separately and do not meet: the
  // estimate rounds, and the voice that finally speaks is not the voice the estimate predicted. So the
  // material is routinely shorter than the window it was made for, by anything from a rounding
  // remainder to a couple of seconds.
  //
  // What happens then is decided by one Recipe key. `playback` defaults to `once-start`, which draws
  // the material once and then draws nothing at all — `sampling.ts` emits no segment for the remainder,
  // so those frames fall through to whatever is beneath. Under a full-frame base that is the Film
  // background, which is black. `hold-start` pins the last frame for the rest of the window instead,
  // `loop-start` repeats, and `stretch` retimes to fit; any of the three fills it.
  //
  // This is `frame-coverage.md`'s inherited edge — "a generated take, which ends where its material
  // ends rather than where the shot should" — in the one form the route can settle before a Build, from
  // the Source and its Recipe sheets alone.
  const playbackReport = async (): Promise<readonly PlaybackReport[]> => {
    // Every Recipe body the Source can name, by the alias its sheet was imported under.
    const sheets = new Map<string, Map<string, string>>();
    for (const match of svml.matchAll(/<import\s+as="([^"]+)"\s+source="([^"]+\.svs)"/gu)) {
      const alias = match[1] ?? "";
      const source = match[2] ?? "";
      const text = await readFile(resolve(dirname(svmlPath), source), "utf8").catch(() => undefined);
      if (text === undefined) continue;
      const recipes = new Map<string, string>();
      for (const recipe of text.matchAll(/([A-Za-z0-9_.-]+)\s*\{([^}]*)\}/gu)) recipes.set(recipe[1] ?? "", recipe[2] ?? "");
      sheets.set(alias, recipes);
    }

    // Which aliases belong to a package that draws. Plenty of elements consume a normalized media
    // without placing it — `whisperx:SemanticTake` reads one to align speech against it and puts no
    // picture on the Canvas, so it has no window to fill and no occupancy to choose. Requiring the
    // alias to come from a package with a Track that outputs a VisualTrack keeps those out, and keeps
    // the Items and Sequences written inside such a Track in, without this needing to know their tags.
    const draws = new Set(imports
      .filter(({ specifier }) => [...drawingTags].some((key) => key.startsWith(`${specifier}#`)))
      .map(({ alias }) => alias));

    // Every element that places one of those pictures, and what its Recipe says to do with a window the
    // material does not fill.
    const running: PlaybackReport[] = [];
    for (const match of svml.matchAll(/<([a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*)\b([^>]*?)\/?>/gsu)) {
      const tag = match[1] ?? "";
      const attributes = match[2] ?? "";
      if (!draws.has(tag.slice(0, tag.indexOf(":")))) continue;
      const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
      if (media === undefined || !moving.has(media)) continue;
      const appearance = /\bappearance=\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+)\}/u.exec(attributes);
      const body = appearance === null ? undefined : sheets.get(appearance[1] ?? "")?.get(appearance[2] ?? "");
      const playback = body === undefined ? undefined : /\bplayback\s*:\s*([A-Za-z-]+)/u.exec(body)?.[1];
      if (playback !== undefined && playback !== "once-start" && playback !== "once-end") continue;
      running.push({
        id: /\bid="([^"]+)"/u.exec(attributes)?.[1] ?? tag,
        tag,
        recipe: appearance === null ? "no appearance Recipe" : `${appearance[1]}.${appearance[2]}`,
        playback: playback ?? "once-start, by default",
      });
    }
    return running;
  };

  // ---- Words nothing draws a full-frame picture over ----
  //
  // A delivery is a picture at every frame; a Source is a list of placements. A word no full-frame
  // element is drawn over is an instant the Source hands to whatever lies beneath it, and beneath the
  // last placement is the Film background, which is black. That is `frame-coverage.md`'s rule in the
  // one form the Source settles on its own, and it needs no threshold: it is a yes or no per word.
  //
  // What covers is read from each element's own opening tag and never from what is written inside it.
  // A Track holding forty Lines with `during=` bindings draws nothing itself; crediting it with its
  // children's bindings would report full coverage for a Source that places text over nothing.
  const coverageReport = (): CoverageReport => {
    const body = scriptBody(svml);
    const parsed = parseScript(svmlPath, body.text, body.offset);

    // Where every Frame and Canvas the Source declares actually sits, so a word can be asked whether
    // the pictures drawn over it add up to the whole one rather than whether any single one does.
    //
    // A split screen is why. Two people on a podcast, one above the other, each half the height: the
    // one speaking owns the Segment and the one listening covers the rest, and neither Frame is the
    // whole picture. Read one Frame at a time, both are inserts and every word of the program is
    // uncovered — which is the opposite of what the delivery shows.
    const geometry = frameGeometry(svml);

    // What each word has drawn over it, as rectangles in the pixels of the Canvas they are rooted in.
    const claims: { readonly canvas: string; readonly box: Box }[][] = Array.from(
      { length: parsed.tokens.length }, () => []);
    const claimSpan = (from: number, to: number, canvas: string, box: Box): void => {
      for (let index = Math.max(0, from); index < Math.min(to, claims.length); index += 1) {
        claims[index]!.push({ canvas, box });
      }
    };
    const claimSegment = (id: string, canvas: string, box: Box, stops = Infinity): void => {
      const segment = parsed.segments.find((item) => item.id === id);
      if (segment !== undefined) claimSpan(segment.tokenStart, Math.min(segment.tokenEndExclusive, stops), canvas, box);
    };
    const claimSelection = (id: string, canvas: string, box: Box, stops = Infinity): void => {
      const selection = parsed.selections.find((item) => item.id === id);
      if (selection !== undefined) {
        claimSpan(selection.open.boundary.tokenIndex, Math.min(selection.close.boundary.tokenIndex, stops), canvas, box);
      }
    };
    // A Frame drawn into, resolved to where it sits. Naming the Canvas directly is the whole of it.
    const placement = (frame: string | undefined, canvas: string | undefined): { readonly canvas: string; readonly box: Box } | undefined => {
      const named = frame ?? canvas;
      if (named === undefined) return undefined;
      const rooted = geometry.canvasOf(named);
      const box = geometry.resolve(named);
      if (rooted === undefined || box === undefined) return undefined;
      return { canvas: rooted, box };
    };

    // Every element that draws a picture, and the words its own `during=` claims. `program` is the
    // whole Script; a Segment or a Selection is the words it marks.
    for (const match of svml.matchAll(/<[a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*\b([^>]*?)\/?>/gsu)) {
      const attributes = match[1] ?? "";
      const where = placement(
        /\bframe=\{([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1],
        /\bcanvas=\{([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1]);
      if (where === undefined) continue;
      // A Moment in `until=` cuts the span short, so the words after it have this picture over them in
      // the Source and not in the delivery. Reading `during=` alone would let an element that leaves
      // half way through the program answer for the whole of it.
      const until = /\buntil=\{story\.moment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
      const stops = until === undefined
        ? claims.length
        : parsed.moments.find((item) => item.id === until)?.boundary.tokenIndex ?? claims.length;
      if (/\bduring="program"/u.test(attributes)) claimSpan(0, stops, where.canvas, where.box);
      const bound = /\bduring=\{story\.(segment|selection)\.([A-Za-z0-9_-]+)\}/u.exec(attributes);
      if (bound?.[1] === "segment") claimSegment(bound[2] ?? "", where.canvas, where.box, stops);
      if (bound?.[1] === "selection") claimSelection(bound[2] ?? "", where.canvas, where.box, stops);
    }

    // A speech Track draws each Take it assembles into its own `visual-frame`, so that Frame is what
    // the Take's Segment has over it. A Take fed by a Normalize with `video="none"` is a voice and
    // puts nothing there, so its Segment is spoken over whatever is already on screen.
    const takes = new Map<string, { readonly segment: string; readonly picture: boolean }>();
    const whisperx = aliasPattern(svml, "@hypit/whisperx", "whisperx");
    const speech = aliasPattern(svml, "@hypit/speech-track", "speech");
    for (const match of svml.matchAll(new RegExp(`<(?:${whisperx}):SemanticTake\\b([^>]*?)/?>`, "gsu"))) {
      const attributes = match[1] ?? "";
      const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
      const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
      const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
      if (id === undefined || segment === undefined) continue;
      takes.set(id, { segment, picture: media !== undefined && moving.has(media) });
    }
    for (const track of svml.matchAll(new RegExp(`<(?:${speech}):Track\\b([^>]*?)>(.*?)</(?:${speech}):Track>`, "gsu"))) {
      const where = placement(/\bvisual-frame=\{([A-Za-z0-9_-]+)\}/u.exec(track[1] ?? "")?.[1], undefined);
      if (where === undefined) continue;
      for (const take of (track[2] ?? "").matchAll(new RegExp(`<(?:${speech}):Take\\b[^>]*?\\bsource=\\{([A-Za-z0-9_-]+)\\.take\\}`, "gu"))) {
        const named = takes.get(take[1] ?? "");
        if (named?.picture === true) claimSegment(named.segment, where.canvas, where.box);
      }
    }

    const covered = claims.map((placed) => placed.length > 0 && fillsACanvas(placed, geometry.canvases));

    // The uncovered words as runs, cut at Segment boundaries so each run is named by the Segment a
    // reader would look in to find it.
    const gaps: CoverageGap[] = [];
    for (const segment of parsed.segments) {
      let run: number[] = [];
      const close = (): void => {
        if (run.length === 0) return;
        gaps.push({ segment: segment.id, words: run.map((index) => parsed.tokens[index]!.text).join(" "), word_count: run.length });
        run = [];
      };
      for (let index = segment.tokenStart; index < segment.tokenEndExclusive; index += 1) {
        if (covered[index] === true) close();
        else run.push(index);
      }
      close();
    }
    return { words: parsed.tokens.length, gaps };
  };

  const running = await playbackReport();

  if (drawn.length === 0 && running.length === 0) {
    return {
      run: runPath,
      passed: true,
      summary: ["no drawing element is placed in the Source; nothing to require."],
      elements: [],
      playback: [],
      uncovered: [],
      out_of_bounds: overhang,
    };
  }

  const coverage = coverageReport();
  const uncoveredWords = coverage.gaps.reduce((sum, gap) => sum + gap.word_count, 0);

  // The Source does not name the reference it reconstructs, so a single prepared reference is used
  // when there is exactly one and named explicitly when there is more than one.
  const preparedRoot = referenceRoot();
  const prepared = (await readdir(preparedRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  let reference = input.reference_id;
  if (reference === undefined) {
    assert(prepared.length > 0, `no prepared reference under ${preparedRoot}; run prepare_reference first`);
    assert(prepared.length === 1, `${prepared.length} prepared references; pass --reference-id (${prepared.join(", ")})`);
    reference = prepared[0]!;
  }
  assert(prepared.includes(reference), `reference ${reference} is not prepared under ${preparedRoot}`);

  type LoggedComparison = {
    readonly element?: string;
    readonly shot_id?: string;
    readonly range?: { readonly segment?: string; readonly selection?: string };
    readonly status: string;
    readonly id?: string;
    readonly stand_in?: { readonly timing?: { readonly basis?: string } };
  };
  // What the comparison was made against, as a reader would name it: a shot, or the words a Segment
  // or Selection marks.
  const against = (entry: LoggedComparison): string =>
    entry.shot_id
    ?? (entry.range?.segment === undefined ? undefined : `segment ${entry.range.segment}`)
    ?? (entry.range?.selection === undefined ? undefined : `selection ${entry.range.selection}`)
    ?? "an unnamed stretch";
  const logPath = join(preparedRoot, reference, "comparisons.jsonl");
  const logged = (await readFile(logPath, "utf8").catch(() => ""))
    .split("\n").filter((line) => line.trim().length > 0)
    .flatMap((line) => { try { return [JSON.parse(line) as LoggedComparison]; } catch { return []; } });
  // A pair handed out and not yet reported on. Naming these separately is what keeps an element with
  // three open comparisons from reading as one that was never looked at.
  const awaiting = logged.filter((entry) => entry.status === "pending");
  const log = logged
    // A comparison counts when it was answered. The observer that uploads answers in band and the
    // entry is written `complete`; the observer that reads pictures is handed the pair and closes its
    // entry with `record_observation --key comparison:<id>`. An entry still `pending` is a pair nobody
    // has reported on, and crediting it credited the tool call rather than the look.
    .filter((entry) => entry.status === "complete");

  // Which stretches each element was compared against, in order. The gate cannot judge whether a
  // stretch was the right one to compare against — it does not know what the element draws — so it
  // reports them and lets a reader notice a component compared against one that never showed it.
  const rounds = new Map<string, string[]>();
  // What timed each comparison's stand-in. A picture drawn at the estimator's pace holds every
  // element in the right place for the wrong length of time, so an element compared only that way has
  // had its layout settled and its behaviour over the window left alone.
  const bases = new Map<string, TimingBasis[]>();
  for (const entry of log) {
    if (entry.element === undefined) continue;
    const seen = rounds.get(entry.element) ?? [];
    seen.push(against(entry));
    rounds.set(entry.element, seen);
    const recorded = entry.stand_in?.timing?.basis;
    const basis: TimingBasis = recorded === "reference" || recorded === "estimate" || recorded === "mixed" ? recorded : "not recorded";
    bases.set(entry.element, [...(bases.get(entry.element) ?? []), basis]);
  }
  // One answer per element, over every comparison it has. Agreement carries through; disagreement is
  // `mixed`, which is the honest answer for an element compared once each way.
  const timingBasis = (id: string): TimingBasis => {
    const recorded = new Set(bases.get(id) ?? []);
    if (recorded.size === 0) return "not recorded";
    return recorded.size === 1 ? [...recorded][0]! : "mixed";
  };

  const never = drawn.filter((element) => (rounds.get(element.id) ?? []).length === 0);
  const unlabelled = log.filter((entry) => entry.element === undefined).length;
  // A misspelled --element is otherwise silent: the comparison happens, the log grows, and the element
  // it was meant for stays at zero for ever.
  const known = new Set(drawn.map((item) => item.id));
  const unknown = [...new Set([...rounds.keys()].filter((id) => !known.has(id)))];

  const elements: ElementReport[] = drawn.map((element) => {
    const stretches = rounds.get(element.id) ?? [];
    const state = stretches.length === 0
      ? "never compared"
      : `${stretches.length} comparison${stretches.length === 1 ? "" : "s"} against ${[...new Set(stretches)].join(", ")}`;
    return {
      element: `${element.alias}:${element.tag}`,
      id: element.id,
      package_name: element.specifier,
      comparisons: stretches.length,
      compared_against: [...new Set(stretches)],
      state,
      timing_basis: timingBasis(element.id),
      // The gate cannot judge whether the stretch chosen actually showed the element, so a lone
      // comparison is called out for a reader to confirm rather than silently accepted.
      ...(stretches.length === 1 ? { note: "single comparison — confirm this stretch shows the element, not a look-alike" } : {}),
    };
  });

  // Elements whose comparisons say nothing about how they behave over their window: every recorded
  // comparison was drawn at the estimator's pace, or its picture carried no record of what timed it.
  const untimed = elements.filter((element) => element.comparisons > 0 && element.timing_basis !== "reference");

  const summary: string[] = [];
  if (never.length === 0 && running.length === 0) {
    summary.push(`every drawing element has been compared (${elements.length}), and every timed picture fills its window.`);
  }
  if (never.length > 0) summary.push(`${never.length} of ${elements.length} elements have never been compared.`);
  if (running.length > 0) {
    summary.push(`${running.length} window${running.length === 1 ? "" : "s"} will empty before ${running.length === 1 ? "it ends" : "they end"}.`);
  }
  summary.push(uncoveredWords === 0
    ? `every word of the Script is drawn over by something that fills the frame (${coverage.words}).`
    : `${uncoveredWords} of ${coverage.words} words are drawn over by nothing that fills the frame.`);
  if (overhang.length > 0) {
    summary.push(`${overhang.length} Frame${overhang.length === 1 ? "" : "s"} `
      + `${overhang.length === 1 ? "reaches" : "reach"} past the Canvas; read each one against the reference.`);
  }
  const compared = elements.filter((element) => element.comparisons > 0).length;
  if (compared > 0) {
    summary.push(untimed.length === 0
      ? `every compared element was looked at over a reference-timed stand-in (${compared}).`
      : `${untimed.length} of ${compared} compared elements have comparisons over a stand-in that was not reference-timed.`);
  }
  if (unresolved.length > 0) {
    summary.push(`${unresolved.length} imported package${unresolved.length === 1 ? "" : "s"} could not be resolved, `
      + "so nothing is known about what they draw.");
  }
  if (awaiting.length > 0) {
    summary.push(`${awaiting.length} comparison${awaiting.length === 1 ? " is" : "s are"} still waiting for `
      + "the differences to be recorded.");
  }

  return {
    run: runPath,
    reference_id: reference,
    passed: never.length === 0 && running.length === 0 && coverage.gaps.length === 0 && unresolved.length === 0,
    summary,
    elements,
    ...(never.length === 0 ? {} : {
      never_compared: {
        ids: never.map((element) => element.id),
        next: "Read .claude/skills/hypit/references/reconstruction/reconstruction-loop.md, then for each: "
          + "render the element as the Source configures it, mock the layers a Build has not made, "
          + "and compare the whole stretch blind — one comparison per Segment or Selection it is drawn over.",
        commands: never.map((element) =>
          `hypit-reference-video-tools compare_reconstruction --reference-id ${reference} --run ${runPath} `
          + `--segment <each Segment ${element.id} is drawn over> `
          + `--video <rendered clip>.mp4 --element ${element.id}`),
      },
    }),
    ...(awaiting.length === 0 ? {} : {
      awaiting_answer: {
        ids: awaiting.map((entry) => entry.id).filter((id) => id !== undefined),
        elements: [...new Set(awaiting.map((entry) => entry.element).filter((id) => id !== undefined))],
        note: `${awaiting.length} comparison${awaiting.length === 1 ? " was" : "s were"} performed and handed to an `
          + "observer that answers out of band, and the differences have not come back. Until they do, the pair has "
          + "been drawn and cut but nobody has said what it shows, so it credits nothing here.\n\n"
          + "Close each one with its id:\n"
          + "  hypit-reference-video-tools record_observation --reference-id "
          + `${reference} --key comparison:<id> --text-file <the differences>`,
      },
    }),
    ...(unresolved.length === 0 ? {} : {
      unresolved_packages: {
        names: unresolved,
        package_root: packageRoot,
        note: `${unresolved.length} package${unresolved.length === 1 ? "" : "s"} the Source imports could not be `
          + `resolved from ${packageRoot}. Whatever they draw is invisible here, so no element of theirs is asked `
          + "for a comparison and this check cannot say the reconstruction is covered.\n\n"
          + "A project that publishes its own packages resolves them from the project root, where "
          + "`packages/<name>/package.json` carries the scoped name. Run the command from that directory, or "
          + "pass --package-root <project directory>.",
      },
    }),
    ...(unknown.length === 0 ? {} : {
      unknown_elements: {
        names: unknown,
        note: `${unknown.length} logged element name${unknown.length === 1 ? " does" : "s do"} not name a drawing `
          + "element in the Source — either the id is not there at all, or it belongs to something that puts no "
          + "picture on the Canvas. Either way the comparison credits nothing, and the element it was meant for "
          + "is still at zero.",
      },
    }),
    ...(unlabelled === 0 ? {} : {
      unlabelled_comparisons: {
        count: unlabelled,
        note: `${unlabelled} comparison${unlabelled === 1 ? " was" : "s were"} recorded without --element and cannot be credited to one.`,
      },
    }),
    ...(untimed.length === 0 ? {} : {
      timing_next: {
        ids: untimed.map((element) => element.id),
        note: "A stand-in sized by estimate:Speech puts every element where the Source puts it and gives it "
          + "the wrong length of time to be there. Anything whose appearance is a function of elapsed time "
          + "inside its window — a progressive reveal, a typewriter, staggered rows at a fixed rate, an "
          + "enter animation scaled to the window — was therefore compared at a speed the reference never "
          + "ran at, and is unverified. A comparison with no recorded basis says the same thing, because "
          + "nothing on the record says otherwise.\n\n"
          + "Re-render each of these with render_element --reference-id "
          + `${reference} and compare again: the reference's own transcript times every Segment whose words `
          + "it carries, so each window runs for as long as the reference spends on it. What is left after "
          + "that is alignment against the speech the Build synthesizes, which is measured at "
          + "playbooks/craft/production-gates.md Gate 3.",
        commands: untimed.map((element) =>
          `hypit-reference-video-tools render_element ${runPath} --element ${element.id} `
          + `--reference-id ${reference} --segment <the Segment the shot covers> --out <rendered clip>.mp4`),
      },
    }),
    uncovered: coverage.gaps,
    ...(coverage.gaps.length === 0 ? {} : {
      uncovered_next: "Each stretch listed here shows whatever the placements around it left on screen, and "
        + "beneath the last of them is the Film background, which is black. Read "
        + "playbooks/craft/frame-coverage.md, then claim each stretch with whatever the reference shows "
        + "there: an element bound to the full Frame or to the Canvas, drawn over those words. Placing "
        + "something beneath the stretch instead changes which wrong picture appears and leaves the stretch "
        + "unclaimed.",
    }),
    out_of_bounds: overhang,
    ...(overhang.length === 0 ? {} : {
      out_of_bounds_note: "Each Frame here places part of what is drawn into it off the picture, by the amount "
        + "beside each edge. `outside_fraction` is how much of the Frame's own area lands off the Canvas. This "
        + "is read from the Source's own `space:Canvas` and `space:Frame` arithmetic — no rendered frame is "
        + "measured and no observer is asked.\n\n"
        + "Answer each one: is this overhang intended? Two shapes of it are, and both are visible in the "
        + "Source. An element that travels in from off-screen is outside for part of its window, so its "
        + "Recipe carries the movement — an `enter`, a fly-from origin, an animated offset — and the Frame is "
        + "where it starts rather than where it stays. A full-bleed picture is declared past the edge on "
        + "purpose so a `fit` crops it instead of letterboxing it, so its Recipe carries that `fit`. A Frame "
        + "with neither, holding something the reference shows whole, is placed wrong: the part past the edge "
        + "is the part nobody will see.\n\n"
        + "This decides nothing on its own, because the Source cannot tell the two apart. It is here because "
        + "comparison cannot see it at all: an element authored mostly off the picture is drawn at the Canvas "
        + "the Source declares, and the stand-in it is compared against is drawn at that same Canvas, so both "
        + "put it in the same place off the edge and agree with each other.",
    }),
    playback: running,
    ...(running.length === 0 ? {} : {
      playback_next: "A generated take is ordered in whole seconds and its window is measured from speech the "
        + "Build has yet to synthesize, so the material is shorter than the window it fills more "
        + "often than not. Under a full-frame picture the remainder is the Film background, which "
        + "reads as a black gap; under a cutaway it is the layer beneath blinking through.\n\n"
        + "Give each Recipe listed here a playback: hold-start to pin the last frame for the rest of the "
        + "window, loop-start to repeat, or stretch to retime. Read playbooks/craft/frame-coverage.md "
        + "on inherited edges before choosing — lengthening the material instead leaves the same edge.",
    }),
  };
}

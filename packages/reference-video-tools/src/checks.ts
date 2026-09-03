import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";

import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface } from "@hypit/markup";
import { loadNodePackageSelection, physicalPackageName } from "@hypit/package-loader-node";
import { parseScript, validateCaptionCueLengths } from "@hypit/script";
import { videoCliDistribution } from "@hypit/video-cli";
import { loadStudioCompanionRegistry } from "@hypit/studio/src/companion-profile.js";
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { readStudioSession } from "@hypit/studio/src/session.js";
import type { StudioSession } from "@hypit/studio/src/session.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";

import { aliasPattern, invokedFrom, nearestPackageRoot, referenceRoot, scriptBody } from "./authoring.js";
import { assert, readJson, round } from "./media.js";
import { reviewPlan } from "./plan.js";
import type { ReferenceState } from "./types.js";

export type PreviewCheckInput = {
  readonly run: string;
  readonly runtime?: string;
};

export type ScriptCueCheckInput = { readonly run: string };

type ScriptSource = { readonly path: string; readonly source: string };

/** Read the Run's reachable Author Source closure without relying on compiler internals. */
async function reachableAuthorSources(runPath: string): Promise<readonly ScriptSource[]> {
  const runSource = await readFile(runPath, "utf8");
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  if (author === undefined) throw new Error("AUTHOR_NOT_DECLARED");
  const queue = [resolve(dirname(runPath), author)];
  const seen = new Set<string>();
  const sources: ScriptSource[] = [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const source = await readFile(path, "utf8").catch(() => undefined);
    if (source === undefined) continue;
    sources.push({ path, source });
    for (const match of source.matchAll(/<import\s+[^>]*\bsource="([^"]+)"[^>]*\/?\s*>/gu)) {
      queue.push(resolve(dirname(path), match[1]!));
    }
  }
  return sources;
}

function scriptBodies(source: string): readonly { readonly text: string; readonly offset: number }[] {
  const bodies: { text: string; offset: number }[] = [];
  for (const opening of source.matchAll(/<script\b[^>]*>/gu)) {
    const start = opening.index! + opening[0].length;
    const end = source.indexOf("</script>", start);
    if (end < 0) throw new Error("SCRIPT_NOT_CLOSED");
    bodies.push({ text: source.slice(start, end), offset: start });
  }
  return bodies;
}

/** Validate every authored caption Cue before any preview or coverage work is attempted. */
export async function scriptCueCheck(input: ScriptCueCheckInput): Promise<Record<string, unknown>> {
  const runPath = resolve(invokedFrom(), input.run);
  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  if (runSource === undefined) return { run: runPath, passed: false, errors: [{ code: "RUN_NOT_FOUND" }] };
  try {
    const sources = await reachableAuthorSources(runPath);
    if (sources.length === 0) {
      const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
      return { run: runPath, passed: false, errors: [{ code: author === undefined ? "AUTHOR_NOT_DECLARED" : "AUTHOR_NOT_FOUND", ...(author === undefined ? {} : { path: resolve(dirname(runPath), author) }) }] };
    }
    const violations: Record<string, unknown>[] = [];
    const errors: Record<string, unknown>[] = [];
    const scriptSources: string[] = [];
    for (const item of sources) {
      let bodies: readonly { readonly text: string; readonly offset: number }[];
      try { bodies = scriptBodies(item.source); }
      catch (error) {
        errors.push({ code: "SCRIPT_PARSE", path: item.path, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      for (const body of bodies) {
        scriptSources.push(item.path);
        try {
          const parsed = parseScript(item.path, body.text, body.offset);
          violations.push(...validateCaptionCueLengths(parsed));
        } catch (error) {
          errors.push({ code: "SCRIPT_PARSE", path: item.path, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
    return { run: runPath, author: sources[0]!.path, sources: [...new Set(scriptSources)], passed: violations.length === 0 && errors.length === 0, max_words: 4, violations, ...(errors.length === 0 ? {} : { errors }) };
  } catch (error) {
    const code = error instanceof Error && error.message === "AUTHOR_NOT_DECLARED" ? "AUTHOR_NOT_DECLARED" : "AUTHOR_NOT_FOUND";
    return { run: runPath, passed: false, errors: [{ code, message: error instanceof Error ? error.message : String(error) }] };
  }
}

const AWAITING = "the Studio projection closure requires unresolved capabilities:";

/**
 * Every Source the Run reaches, checked before anything is traced.
 *
 * One `hypit check` of the Run covers the closure: it compiles the Author the Run names, the Author's
 * `<import>`ed Recipe sheets and kits along with it, and it typechecks the project's own author
 * packages. A break in a kit is reported as `kits/street-interview-v1.svs:5993`, with the path the
 * file has from the project — so one check reads more than a list of them would and says where in the
 * same breath.
 */
async function checkedSources(runPath: string): Promise<{ readonly ok: boolean; readonly output: string }> {
  // The CLI as it was launched, when this process was launched by it, and the Distribution's own
  // otherwise — `hypit-reference-video-tools` does not set the launcher variable, and the Distribution
  // root is where `bin/` sits in a checkout and in an install alike.
  const launcher = process.env.HYPIT_CLI_LAUNCHER?.trim();
  const distributionRoot = videoCliDistribution.packageRoot;
  if ((launcher === undefined || launcher.length === 0) && distributionRoot === undefined) {
    throw new Error("active Hypit Distribution has no package root");
  }
  const hypit = launcher !== undefined && launcher.length > 0
    ? launcher
    : join(distributionRoot!, "bin", "hypit.mjs");

  // The project is the package root, the way `hypit check` finds it when it is run from there. A
  // project inside a larger tree resolves none of its own packages without this.
  const checked = spawnSync(process.execPath, [hypit, "check", runPath, "--package-root", dirname(runPath)], {
    encoding: "utf8", windowsHide: true, timeout: 600_000,
    env: { ...process.env, HYPIT_STRICT_SCRIPT_CUES: "1" },
  });
  // Node writes its own deprecation warnings to the same stream the refusal arrives on, and this
  // output is read as the reason a check failed. Two lines about `module.register()` above the file
  // and position are two lines between the reader and the thing they came for.
  const output = `${checked.stdout ?? ""}${checked.stderr ?? ""}`
    .split("\n")
    .filter((line) => !/^\(node:\d+\)/u.test(line) && !line.startsWith("(Use `node --trace-"))
    .join("\n").trim();
  return { ok: checked.status === 0, output };
}

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

  // The sources first, then whether the graph traces. A Source that does not check has nothing useful
  // to say about tracing, and its refusal names the file and the position it is at; the same mistake
  // met while tracing arrives as whatever the compiler happened to fail on afterwards.
  const sources = await checkedSources(runPath);
  if (!sources.ok) return { run: runPath, sound: false, sources, refused: sources.output };
  const runtimePath = input.runtime === undefined ? undefined : resolve(cwd, input.runtime);
  const packageRoot = nearestPackageRoot(dirname(runPath)) ?? roots.packageRoot;
  const workspaceRoot = dirname(runPath);

  const distributionPackageRoot = videoCliDistribution.packageRoot;
  if (distributionPackageRoot === undefined) throw new Error("active Hypit Distribution has no package root");

  const registry = await loadStudioCompanionRegistry({ workspaceRoot, packageRoot, distributionPackageRoot });
  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
  const archive = await openStudioArchive(runtimePath, packageRoot, workspaceRoot, distributionPackageRoot);

  let session: StudioSession | undefined;
  let refusal: string | undefined;
  let awaiting: readonly string[] | undefined;
  try {
    const run = await loadStudioRun({
      run: runPath,
      domain,
      registry,
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

  if (refusal !== undefined) return { run: runPath, sound: false, sources, refused: refusal };

  if (awaiting !== undefined) {
    // The graph traced all the way to a Film and a semantic spine; what is left is
    // work a Provider has to do. That is a pass for this gate, and the delivery
    // measurements happen on the real Build either way.
    const noun = awaiting.length === 1 ? "capability" : "capabilities";
    return {
      run: runPath,
      sound: true,
      sources,
      summary: `every source checks; the graph is sound, waiting on ${awaiting.length} ${noun}.`,
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
    return {
      run: runPath,
      sound: true,
      sources,
      summary: `every source checks; every Track resolved (${tracks.length}).`,
      tracks: tracks.length,
    };
  }
  return { run: runPath, sound: false, sources, problems };
}

export type ReconstructionCheckInput = {
  readonly run: string;
  readonly reference_id?: string;
  /** Runtime Profile used to resolve accepted Build Records in a pinned Run. */
  readonly runtime?: string;
};

/**
 * Which route wrote the Source, and therefore what "this element was looked at" means.
 *
 * `reconstruction` credits a comparison against the reference video, logged under that reference.
 * `description` credits a review of the element against what the author asked for, logged under the
 * project — there is no reference to compare to, so the question is conformance rather than
 * difference. Everything else the check does is the same on both: which elements draw, which words
 * nothing covers, which Frames reach past the Canvas, and which timed pictures empty their windows
 * are all read from the Source and know nothing about where the Source came from.
 */
export type AuthoringCheckMode = "reconstruction" | "description";

export type AuthoringCheckInput = ReconstructionCheckInput & {
  readonly mode?: AuthoringCheckMode;
};

export type MechanicalAuthoringCheckInput = { readonly run: string };

/**
 * Where a description-authored project's reviews are logged.
 *
 * Beside the per-render directories rather than inside them: `render_element` empties its own
 * `.hypit/compare/<key>` on the way in, and a log kept under there would be deleted by the next
 * render of the element it is the evidence for.
 *
 * Under the project rather than under a reference, because a review is about one project. That is
 * also what spares this log the cross-project filter the comparison log needs: a reference is shared
 * between every reconstruction of one video, and a project's `.hypit` is not shared with anyone.
 */
export function reviewLogPath(runPath: string): string {
  return join(dirname(runPath), ".hypit", "reviews.jsonl");
}

/**
 * Which timing basis the preview sidecar recorded for an element comparison.
 * Native preview realization records `estimate`; older or external pictures may be `not recorded`.
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

type FrameEdgeName = "left" | "top" | "right" | "bottom";
type FrameDeclaration ={ readonly within: string; readonly edges: Readonly<Record<FrameEdgeName, string>> };
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
 * The remaining Source-level checks use this only to determine which declared placements cover the
 * Canvas and whether the Canvas has the reference's aspect ratio. Layout quality is measured later
 * from the realized Composition DOM.
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
    const written = (name: FrameEdgeName): string | undefined => new RegExp(`\\b${name}="([^"]+)"`, "u").exec(attributes)?.[1];
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
 * Report what a route can still settle after the Source is written and before a Build runs: which
 * drawing elements nobody has looked at, which words of the Script nothing draws a full-frame
 * picture over, and which timed pictures are configured to stop before their window ends.
 *
 * Both routes end here, and `mode` is the only thing that differs. A reconstruction is looked at by
 * comparing each element against the reference; a description-authored program has no reference, so
 * each element is reviewed against what the author asked for. What counts as evidence and where it
 * is logged follow from that; everything else below is read from the Source and does not care.
 *
 * `preview_check` proves the graph is wired. It proves nothing about whether what the graph draws is
 * what was wanted, and a Source can pass every structural check while a component draws something
 * nobody asked for. Closing that gap is `references/element-review.md` and the route file beside it,
 * which is prose, and prose is what a route skips silently. This is the same requirement as a command
 * that answers whether it was met.
 *
 * What it checks is **participation, not convergence**. The round is deliberately bounded and may
 * stop with visible differences remaining, so requiring convergence here would contradict it. An
 * element that was compared once and stopped at its ceiling passes; an element nobody ever looked
 * at does not.
 *
 * Every element that draws is required, whichever package draws it. A Track from installed
 * vocabulary carries authored values exactly as a project-local one does — a caption Style's size,
 * colour and placement are as unverified as a new package's — and `render_element` stands in for the
 * speech, so it renders before a Build like any other.
 *
 * A look counts once it has been answered: in band (`complete`, the gemini observer) or handed out
 * and closed by whoever answered it (`pending` until then). Only `failed` is not a look. The gate
 * cannot judge whether the stretch an element was looked at over actually showed it, so the stretches
 * are reported for a reader, and a lone look is called out rather than assumed meaningful.
 *
 * Each element also carries what timed the stand-ins it was compared over, read from the sidecar
 * `render_element` writes beside its output and carried into the log by `compare_reconstruction`.
 * That is reported rather than required: participation is the rule here, and an estimate-timed
 * comparison is a comparison. What it says is which elements have had their behaviour over their
 * window looked at and which have only had their layout looked at.
 *
 * Frame coverage is decided from the Source alone and is required: a word is either drawn over by
 * something bound to the whole picture or it is not. What covers is read from an element's own
 * opening tag — a full-bleed `frame=`, the `canvas=`, or a speech Track's full-frame `visual-frame=`
 * over the Segments whose Takes carry a picture — so a Track never inherits its children's `during=`
 * bindings.
 *
 * A project that places no drawing element passes with nothing to require.
 */
export async function authoringCheck(
  input: AuthoringCheckInput,
  roots: { readonly packageRoot: string },
): Promise<Record<string, unknown>> {
  const mode: AuthoringCheckMode = input.mode ?? "reconstruction";
  // What looking at an element is called on this route. A reconstruction compares it against the
  // reference; a description-authored program has nothing to compare to and is read against what the
  // author asked for. The arithmetic is the same either way, so only the word differs — and the keys
  // do not, so one shape describes both reports.
  const looked = mode === "reconstruction" ? "compared" : "reviewed";
  const looking = mode === "reconstruction" ? "comparison" : "review";
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  // Where the Source's imports resolve from. A project's own packages are installed against the
  // project, so the Run names its own root: the nearest directory at or above it holding a
  // `package.json`, which is the same walk `hypit check` makes. Taking it from the working directory
  // instead meant a Run named by a path resolved its packages somewhere else entirely, and the
  // project's own elements read as packages that do not exist.
  const packageRoot = nearestPackageRoot(dirname(runPath)) ?? roots.packageRoot;
  const distributionPackageRoot = videoCliDistribution.packageRoot;

  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${input.run} declares no <author source="…"/>`);
  const svmlPath = resolve(dirname(runPath), author);
  const svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  // Every package this Source imports. The scope is whatever the Source wrote: a project that declares
  // a vocabulary gap and fills it publishes under its own scope, and those elements draw exactly as an
  // installed one does.
  // Attribute order is not significant in this markup, and a pattern that fixed it read a Source
  // written the other way round as importing nothing at all — then passed it, because nothing to
  // compare and nothing found look alike from here.
  const imports = [...svml.matchAll(/<import\b([^>]*?)\/?>/gsu)]
    .map((match) => ({
      alias: /\bas="([^"]+)"/u.exec(match[1] ?? "")?.[1] ?? "",
      specifier: /\bfrom="(@[^"@/]+\/[^"@]+)@\d+"/u.exec(match[1] ?? "")?.[1] ?? "",
    }))
    .filter((item) => item.alias.length > 0 && item.specifier.length > 0);
  if (imports.length === 0) {
    return {
      run: runPath,
      // Not one aliased package import could be read. Whether the Source truly imports nothing or
      // this failed to read it, what follows knows nothing about what the Source draws — and a
      // reading that came back empty is not a reconstruction that is covered.
      passed: false,
      summary: [`no aliased package import could be read from ${svmlPath}, so nothing is known about what this Source draws.`],
      elements: [],
      playback: [],
      uncovered: [],
    };
  }

  // Which of their Surfaces draw a Track. A Style Surface publishes a Style and draws nothing, so
  // requiring a comparison of it would be asking for a picture that does not exist.
  const specifiers = [...new Set(imports.map((item) => item.specifier))];
  // Logical submodules (for example @hypit/gpt-image/clean) are aliases owned by the
  // physical package (@hypit/gpt-image). Load the physical owner, but retain the logical
  // spelling for Source diagnostics and map drawing tags back to that owner.
  const physicalByLogical = new Map(specifiers.map((specifier) => [specifier, physicalPackageName(specifier)] as const));
  const physicalSpecifiers = [...new Set(specifiers.map((specifier) => physicalByLogical.get(specifier)!))];
  // One unresolvable package used to take the rest with it: the whole selection loads or none of it
  // does, and a swallowed failure left `drawingTags` empty, so every element in the Source read as
  // drawing nothing and the check passed on an empty answer. Fall back to loading them one at a time so
  // the ones that resolve still count, and keep the names of the ones that did not.
  const unresolved: string[] = [];
  // A project installs its own packages against itself, and `@hypit/*` comes from the Distribution
  // this command was launched from. Loading against the project root alone leaves the second kind
  // with nowhere to resolve from, so a project whose Source imports the standard vocabulary reports
  // every one of those imports as a package that does not exist.
  const loading = { ...(distributionPackageRoot === undefined ? {} : { fallbackRoots: [distributionPackageRoot] }) };
  const loaded = await loadNodePackageSelection(physicalSpecifiers, packageRoot, loading).catch(async () => {
    const each = await Promise.all(physicalSpecifiers.map(async (specifier) =>
      await loadNodePackageSelection([specifier], packageRoot, loading).catch(() => {
        unresolved.push(...specifiers.filter((logical) => physicalByLogical.get(logical) === specifier));
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
    const physical = physicalByLogical.get(specifier) ?? specifier;
    const pattern = new RegExp(`<${alias}:([A-Za-z][A-Za-z0-9]*)\\b[^>]*?\\bid="([^"]+)"`, "gu");
    for (const match of svml.matchAll(pattern)) {
      const tag = match[1] ?? "";
      const id = match[2] ?? "";
      if (!drawingTags.has(`${physical}#${tag}`)) continue;
      if (!drawn.some((item) => item.id === id)) drawn.push({ id, tag, alias, specifier });
    }
  }

  // Recipe attributes are part of the authored declaration just like inline attributes. Keep a
  // small source-side index so coverage does not mistake a generated video declared by
  // `recipe={recipes.media.aroll}` for a voice merely because there is no `video=` attribute.
  const recipeSheets = new Map<string, Map<string, string>>();
  for (const match of svml.matchAll(/<import\s+as="([^"]+)"\s+source="([^"]+\.svs)"/gu)) {
    const alias = match[1] ?? "";
    const source = match[2] ?? "";
    const text = await readFile(resolve(dirname(svmlPath), source), "utf8").catch(() => undefined);
    if (text === undefined) continue;
    const recipes = new Map<string, string>();
    for (const recipe of text.matchAll(/([A-Za-z0-9_.-]+)\s*\{([^}]*)\}/gu)) recipes.set(recipe[1] ?? "", recipe[2] ?? "");
    recipeSheets.set(alias, recipes);
  }

  // Which Normalize ids carry a picture. A take normalized with `video="none"` is a voice: it has no
  // window to fill, and nothing it feeds puts anything on the Canvas.
  const moving = new Set<string>();
  const pipeline = aliasPattern(svml, "@hypit/media-pipeline", "pipeline");
  for (const match of svml.matchAll(new RegExp(`<(?:${pipeline}):Normalize\\b([^>]*?)/?>`, "gsu"))) {
    const attributes = match[1] ?? "";
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const video = /\bvideo="([^"]+)"/u.exec(attributes)?.[1];
    const recipe = /\brecipe=\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+)\}/u.exec(attributes);
    const recipeVideo = recipe === null ? undefined
      : /\bvideo\s*:\s*([^;\s]+)/u.exec(recipeSheets.get(recipe[1] ?? "")?.get(recipe[2] ?? "") ?? "")?.[1];
    if (id !== undefined && ((video !== undefined && video !== "none") || (video === undefined && recipeVideo !== undefined && recipeVideo !== "none"))) {
      moving.add(id);
    }
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
      const body = appearance === null ? undefined : recipeSheets.get(appearance[1] ?? "")?.get(appearance[2] ?? "");
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
    // Nothing placed and nothing seen are the same answer from here, and only one of them is a pass.
    // A project whose vocabulary resolved and placed no drawing element has nothing to require; one
    // whose packages did not resolve, or none of whose packages publishes a Surface that draws, has
    // been read by something that could not see — and the names of what it could not see were being
    // dropped on the way out.
    const blind = unresolved.length > 0 || drawingTags.size === 0;
    return {
      run: runPath,
      passed: !blind,
      summary: [unresolved.length > 0
        ? `${unresolved.length} imported package${unresolved.length === 1 ? "" : "s"} could not be resolved from ${packageRoot}, so nothing is known about what the Source draws.`
        : drawingTags.size === 0
          ? `no package the Source imports publishes a Surface that draws, so nothing is known about what the Source draws.`
          : "no drawing element is placed in the Source; nothing to require."],
      elements: [],
      playback: [],
      uncovered: [],
      ...(unresolved.length === 0 ? {} : {
        unresolved_packages: {
          names: unresolved,
          package_root: packageRoot,
          note: "A project that publishes its own packages resolves them from the project root, where "
            + "`packages/<name>/package.json` carries the scoped name. Run the command from that directory, "
            + "or pass --package-root <project directory>.",
        },
      }),
    };
  }

  // What a round has to look at, decided from the Source rather than left to whoever runs it.
  // Where each stretch's picture goes, named here rather than by whoever reads this.
  //
  // A round is three commands — this one, `render_element --batch`, `compare_reconstruction --batch` —
  // and the middle one writes exactly what the last one reads. A path invented at the call site has to
  // survive being written down twice and stay identical; a path named here survives by never being
  // written down at all. `renders/` beside the Run is where a project already keeps them.
  //
  // Named for the range and not for `named`: the range is what identifies an entry, so two entries of
  // one element always differ in it, while `named` is a sentence written to be read.
  const plan = reviewPlan({ svml, svmlPath, scriptBody: scriptBody(svml), drawn })
    .map((entry) => ({
      ...entry,
      out: join(dirname(runPath), "renders", `${entry.element}-${entry.tokens[0]}-${entry.tokens[1]}.mp4`),
    }));
  // The same parse the plan was built from, so a look recorded against a Segment can be resolved to
  // the words that Segment marks and compared with a plan entry on one axis.
  const plannedBody = scriptBody(svml);
  const plannedScript = parseScript(svmlPath, plannedBody.text, plannedBody.offset);

  const coverage = coverageReport();
  const uncoveredWords = coverage.gaps.reduce((sum, gap) => sum + gap.word_count, 0);

  // The Source does not name the reference it reconstructs, so a single prepared reference is used
  // when there is exactly one and named explicitly when there is more than one.
  //
  // Only on the route that has a reference. A description-authored project has none, and resolving
  // one here is what used to stop this command before it reached the checks that have nothing to do
  // with a reference — the `playback` refusal and frame coverage are read from
  // the Source alone, and were unreachable to that route for no reason but this block.
  const preparedRoot = referenceRoot();
  let reference: string | undefined;
  if (mode === "reconstruction") {
    const prepared = (await readdir(preparedRoot, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    reference = input.reference_id;
    if (reference === undefined) {
      assert(prepared.length > 0, `no prepared reference under ${preparedRoot}; run prepare_reference first`);
      assert(prepared.length === 1, `${prepared.length} prepared references; pass --reference-id (${prepared.join(", ")})`);
      reference = prepared[0]!;
    }
    assert(prepared.includes(reference), `reference ${reference} is not prepared under ${preparedRoot}`);
  }

  // The reference's shape against the Canvas's.
  //
  // The reference's own pixel dimensions size nothing on this route — a render is drawn at the
  // Canvas's size — but their proportion has to agree. A Canvas of another shape puts two
  // differently-proportioned pictures in front of the observer, and the differences it reports are
  // the ones the Canvas made rather than the ones the element made. It is the precondition that
  // fails quietly: every comparison in the round succeeds, and every one of them is about the wrong
  // thing, which is why it is a refusal here rather than a note.
  const aspect: { readonly canvas: string; readonly canvas_size: string; readonly reference_size: string }[] = [];
  if (mode === "reconstruction" && reference !== undefined) {
    const video = (await readJson<ReferenceState>(join(preparedRoot, reference, "state.json")))?.video;
    if (video !== undefined && video.width > 0 && video.height > 0) {
      const wanted = video.width / video.height;
      for (const [id, box] of frameGeometry(svml).canvases) {
        const width = box.right - box.left;
        const height = box.bottom - box.top;
        if (!(width > 0 && height > 0)) continue;
        // One percent, so a Canvas that is the reference's shape at another size agrees: 1440x2560 and
        // 1080x1920 are both 9:16, and a reference whose own dimensions are odd is within it. Nothing
        // wider — 1080x1920 against 1080x1440 is the case this exists to catch.
        if (Math.abs(width / height - wanted) <= wanted * 0.01) continue;
        aspect.push({
          canvas: id,
          canvas_size: `${width}x${height}`,
          reference_size: `${video.width}x${video.height}`,
        });
      }
    }
  }

  type LoggedComparison = {
    readonly run?: string;
    readonly element?: string;
    readonly shot_id?: string;
    readonly range?: { readonly segment?: string; readonly selection?: string; readonly tokens?: readonly [number, number] };
    readonly status: string;
    readonly id?: string;
    readonly image_path?: string;
    readonly stand_in?: { readonly timing?: { readonly basis?: string } };
  };
  // What the comparison was made against, as a reader would name it: a shot, or the words a Segment
  // or Selection marks.
  const against = (entry: LoggedComparison): string =>
    entry.shot_id
    ?? (entry.range?.segment === undefined ? undefined : `segment ${entry.range.segment}`)
    ?? (entry.range?.selection === undefined ? undefined : `selection ${entry.range.selection}`)
    ?? "an unnamed stretch";
  const legacyComparisonPath = mode === "reconstruction"
    ? join(preparedRoot, reference!, "comparisons.jsonl")
    : undefined;
  const logPath = mode === "reconstruction"
    ? join(dirname(runPath), ".hypit", "comparisons.jsonl")
    : reviewLogPath(runPath);
  // A reference is keyed by the video, and rightly: its observations are about that video and cost
  // real money, so two reconstructions of one file share them. Its comparisons are not about the
  // video — they are about one reconstruction — and they were being kept in the same place, so a
  // second project reconstructing the same file was credited with the first one's looking, over
  // Segments its own Script does not contain.
  //
  // What separates them is already on every row: the render it compared. A render belongs to the
  // project that produced it, so a row whose picture is not under this project is not this project's
  // evidence. Nothing has to move and no earlier log has to be migrated.
  //
  // A review log needs none of this: it is already the project's own, so every row in it is this
  // project's evidence and there is nothing to separate.
  const inThisProject = (entry: LoggedComparison): boolean => {
    if (mode === "description") return true;
    if (entry.run !== undefined) return resolve(entry.run) === runPath;
    if (entry.image_path === undefined) return false;
    const at = resolve(entry.image_path);
    return at === packageRoot || at.startsWith(`${packageRoot}${sep}`);
  };
  const logPaths = [logPath, legacyComparisonPath].filter((path, index, all): path is string => path !== undefined && all.indexOf(path) === index);
  const everything = (await Promise.all(logPaths.map(async (path) => (await readFile(path, "utf8").catch(() => ""))
    .split("\n").filter((line) => line.trim().length > 0)
    .flatMap((line) => { try { return [JSON.parse(line) as LoggedComparison]; } catch { return []; } }))))
    .flat();
  const elsewhere = everything.length - everything.filter(inThisProject).length;
  const logged = everything.filter(inThisProject);
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
  // What timing basis each comparison recorded. Native preview realization is deterministic estimate
  // timing; a missing sidecar is the only unknown case.
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
  // `mixed` for compatibility with historical logs.
  const timingBasis = (id: string): TimingBasis => {
    const recorded = new Set(bases.get(id) ?? []);
    if (recorded.size === 0) return "not recorded";
    return recorded.size === 1 ? [...recorded][0]! : "mixed";
  };

  // Which of the plan's entries have been answered.
  //
  // A logged look and a planned one are compared as word ranges, because that is the one form both
  // can always be put in: a look recorded against a Segment resolves to the words that Segment marks,
  // and a look recorded against a Cue was never anything else. Comparing the names instead would let
  // a Cue in the middle of a Segment match the Segment, and the coverage this gate claims would be
  // wider than the coverage it has.
  const asTokens = (entry: LoggedComparison): string | undefined => {
    if (entry.range?.tokens !== undefined) return `${entry.range.tokens[0]}-${entry.range.tokens[1]}`;
    const segment = entry.range?.segment === undefined
      ? undefined
      : plannedScript.segments.find((item) => item.id === entry.range!.segment);
    if (segment !== undefined) return `${segment.tokenStart}-${segment.tokenEndExclusive}`;
    const selection = entry.range?.selection === undefined
      ? undefined
      : plannedScript.selections.find((item) => item.id === entry.range!.selection);
    if (selection !== undefined) return `${selection.open.boundary.tokenIndex}-${selection.close.boundary.tokenIndex}`;
    // A shot names a cut in the reference's picture rather than a range of the Script's words, so it
    // answers no plan entry. It still counts as having looked, which `rounds` already records.
    return undefined;
  };
  const answered = new Set(log.flatMap((entry) => {
    const tokens = asTokens(entry);
    return entry.element === undefined || tokens === undefined ? [] : [`${entry.element} ${tokens}`];
  }));
  const owed = plan.filter((entry) => !answered.has(`${entry.element} ${entry.tokens[0]}-${entry.tokens[1]}`));

  const never = drawn.filter((element) => (rounds.get(element.id) ?? []).length === 0);
  const unlabelled = log.filter((entry) => entry.element === undefined).length;
  // A misspelled --element is otherwise silent: the comparison happens, the log grows, and the element
  // it was meant for stays at zero for ever.
  const known = new Set(drawn.map((item) => item.id));
  const unknown = [...new Set([...rounds.keys()].filter((id) => !known.has(id)))];

  const elements: ElementReport[] = drawn.map((element) => {
    const stretches = rounds.get(element.id) ?? [];
    const state = stretches.length === 0
      ? `never ${looked}`
      : `${stretches.length} ${looking}${stretches.length === 1 ? "" : "s"} against ${[...new Set(stretches)].join(", ")}`;
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
      ...(stretches.length === 1 ? { note: `single ${looking} — confirm this stretch shows the element, not a look-alike` } : {}),
    };
  });

  // Elements whose comparisons say nothing about how they behave over their window: every recorded
  // comparison was drawn at the estimator's pace, or its picture carried no record of what timed it.
  const untimed = elements.filter((element) => element.comparisons > 0 && element.timing_basis === "not recorded");

  const summary: string[] = [];
  if (never.length === 0 && running.length === 0) {
    summary.push(`every drawing element has been ${looked} (${elements.length}), and every timed picture fills its window.`);
  }
  if (never.length > 0) summary.push(`${never.length} of ${elements.length} elements have never been ${looked}.`);
  if (owed.length > 0) {
    summary.push(`${owed.length} of ${plan.length} stretch${plan.length === 1 ? "" : "es"} the Source asks for `
      + `${owed.length === 1 ? "has" : "have"} not been ${looked}.`);
  }
  if (running.length > 0) {
    summary.push(`${running.length} window${running.length === 1 ? "" : "s"} will empty before ${running.length === 1 ? "it ends" : "they end"}.`);
  }
  summary.push(uncoveredWords === 0
    ? `every word of the Script is drawn over by something that fills the frame (${coverage.words}).`
    : `${uncoveredWords} of ${coverage.words} words are drawn over by nothing that fills the frame.`);
  const compared = elements.filter((element) => element.comparisons > 0).length;
  if (compared > 0 && mode === "reconstruction") {
    summary.push(untimed.length === 0
      ? `every compared element was looked at over the deterministic estimate-timed preview (${compared}).`
      : `${untimed.length} of ${compared} compared elements have no recorded preview timing basis.`);
  }
  // On the description route every stand-in is estimate-timed, because `estimate:Speech` is the only
  // clock there is until the Build synthesizes the speech. Reporting that as a shortfall would name
  // every element every time and ask for a re-render against a reference that does not exist, so it
  // is stated once as what it is.
  if (compared > 0 && mode === "description") {
    summary.push(`every ${looking} was made over a stand-in timed by estimate:Speech (${compared}); how each element `
      + "sits against the speech the Build synthesizes is settled once that speech exists.");
  }
  if (unresolved.length > 0) {
    summary.push(`${unresolved.length} imported package${unresolved.length === 1 ? "" : "s"} could not be resolved, `
      + "so nothing is known about what they draw.");
  }
  if (elsewhere > 0) {
    summary.push(`${elsewhere} comparison${elsewhere === 1 ? "" : "s"} in this reference's log compared a render `
      + "outside this project and are not counted here.");
  }
  if (awaiting.length > 0) {
    summary.push(`${awaiting.length} ${looking}${awaiting.length === 1 ? " is" : "s are"} still waiting for `
      + `${mode === "reconstruction" ? "the differences" : "the findings"} to be recorded.`);
  }

  return {
    run: runPath,
    ...(reference === undefined ? {} : { reference_id: reference }),
    plan,
    // The round as the two commands that run it already take it. `render_element --batch` reads
    // `renders` out of the file it is given and `compare_reconstruction --batch` reads `comparisons`,
    // so this command's own output is a batch file for both and the round is three commands with
    // nothing written by hand in between. Both are the stretches still owed rather than the whole
    // plan: what has already been looked at does not want rendering again.
    ...(owed.length === 0 ? {} : {
      renders: owed.map((entry) => ({ element: entry.element, tokens: entry.tokens, out: entry.out })),
    }),
    // Only where there is a reference to compare against. The description route's second command is
    // `review_element`, whose entries carry an `intent_file` saying what the element was asked to be,
    // and that is written rather than derived.
    ...(owed.length === 0 || mode !== "reconstruction" ? {} : {
      comparisons: owed.map((entry) => ({
        run: runPath,
        tokens: entry.tokens,
        video_path: entry.out,
        element: entry.element,
        question: "Ignore flat preview-mock regions standing in for declared-but-unbuilt media; compare authored layout, typography, motion and timing only.",
      })),
    }),
    // Where this command actually read and resolved from. Said here, no document has to describe it
    // from the outside and go stale when it moves.
    roots: mode === "reconstruction"
      ? { reference: preparedRoot, packages: packageRoot }
      : { reviews: logPath, packages: packageRoot },
    passed: owed.length === 0 && never.length === 0 && running.length === 0 && coverage.gaps.length === 0
      && unresolved.length === 0 && aspect.length === 0,
    summary,
    elements,
    ...(aspect.length === 0 ? {} : {
      canvas_aspect: {
        entries: aspect,
        note: "The reference and the Canvas are different shapes. Every comparison in a round puts the "
          + "reference clip beside a render drawn at the Canvas's proportions, so the observer reads the "
          + "difference between the two shapes and reports it as the element's — a caption that is the "
          + "right size looks wrong, and a repair made against that reading moves it away from the "
          + "reference. Change the Canvas to the reference's shape before comparing anything. The "
          + "reference's own pixel dimensions are not the requirement; its proportion is.",
      },
    }),
    ...(owed.length === 0 ? {} : {
      owed: {
        entries: owed,
        note: `${owed.length} stretch${owed.length === 1 ? "" : "es"} the Source asks for ${owed.length === 1 ? "has" : "have"} `
          + "not been looked at. Each one is an element over a range of the Script's own words, and the reason it is "
          + "here is beside it — the first appearance of a distinct visual declaration nobody has seen.",
        commands: owed.map((entry) => mode === "reconstruction"
          ? `hypit-reference-video-tools compare_reconstruction --reference-id ${reference} --run ${runPath} `
            + `--tokens ${entry.tokens[0]}:${entry.tokens[1]} --video ${entry.out} --element ${entry.element}`
          : `hypit-reference-video-tools review_element --run ${runPath} `
            + `--tokens ${entry.tokens[0]}:${entry.tokens[1]} --video ${entry.out} --element ${entry.element} `
            + `--intent-file <what ${entry.element} was asked to be>`),
      },
    }),
    ...(never.length === 0 ? {} : {
      never_compared: {
        ids: never.map((element) => element.id),
        next: mode === "reconstruction"
          ? "Read skills/hypit/references/element-review.md and "
            + "skills/hypit/references/reconstruction/comparison-round.md, then for each: "
            + "render the element as the Source configures it, mock the layers a Build has not made, "
            + "and compare the whole stretch blind — one comparison per Segment or Selection it is drawn over."
          : "Read skills/hypit/references/element-review.md and "
            + "skills/hypit/references/original-authoring/conformance-round.md, then for each: "
            + "render the element as the Source configures it, mock the layers a Build has not made, "
            + "and have it read against what this element was asked to be — one review per Segment or "
            + "Selection it is drawn over.",
        // One command per stretch the plan gives this element, rather than one per element naming the
        // Segments it is drawn over. The plan already decided which stretches this element earns and
        // named a picture for each, so both of the things a reader used to fill in are here.
        commands: never.flatMap((element) => plan.filter((entry) => entry.element === element.id)
          .map((entry) => mode === "reconstruction"
            ? `hypit-reference-video-tools compare_reconstruction --reference-id ${reference} --run ${runPath} `
              + `--tokens ${entry.tokens[0]}:${entry.tokens[1]} --video ${entry.out} --element ${element.id}`
            : `hypit-reference-video-tools review_element --run ${runPath} `
              + `--tokens ${entry.tokens[0]}:${entry.tokens[1]} --video ${entry.out} --element ${element.id} `
              + `--intent-file <what ${element.id} was asked to be>`)),
      },
    }),
    ...(awaiting.length === 0 ? {} : {
      awaiting_answer: {
        ids: awaiting.map((entry) => entry.id).filter((id) => id !== undefined),
        elements: [...new Set(awaiting.map((entry) => entry.element).filter((id) => id !== undefined))],
        note: mode === "reconstruction"
          ? `${awaiting.length} comparison${awaiting.length === 1 ? " was" : "s were"} performed and handed to an `
            + "observer that answers out of band, and the differences have not come back. Until they do, the pair has "
            + "been drawn and cut but nobody has said what it shows, so it credits nothing here.\n\n"
            + "Close each one with its id:\n"
            + "  hypit-reference-video-tools record_observation --reference-id "
            + `${reference} --key comparison:<id> --text-file <the differences>`
          : `${awaiting.length} review${awaiting.length === 1 ? " was" : "s were"} handed out and the findings have `
            + "not come back. Until they do, the picture has been drawn but nobody has said what it shows, so it "
            + "credits nothing here.\n\n"
            + "Close each one with its id:\n"
            + `  hypit-reference-video-tools record_review --run ${runPath} --review-id <id> --text-file <the findings>`,
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
        note: "This comparison has no timing sidecar. Re-render it with render_element so the deterministic "
          + "estimate basis is recorded. Reference timing is not used to construct mock SemanticTakes; final "
          + "alignment against synthesized speech is settled after the Build.",
        commands: untimed.flatMap((element) => plan.filter((entry) => entry.element === element.id)
          .map((entry) =>
            `hypit-reference-video-tools render_element ${runPath} --element ${element.id} `
            + `--reference-id ${reference} --tokens ${entry.tokens[0]}:${entry.tokens[1]} --out ${entry.out}`)),
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
    playback: running,
    ...(running.length === 0 ? {} : {
      playback_next: "Only moving/generated media with a duration-bearing timeline needs playback. Still images have no timeline and must not be given playback. For a generated take, the take is ordered in whole seconds and its window is measured from speech the "
        + "Build has yet to synthesize, so the material is shorter than the window it fills more "
        + "often than not. Under a full-frame picture the remainder is the Film background, which "
        + "reads as a black gap; under a cutaway it is the layer beneath blinking through.\n\n"
        + "Give each Recipe listed here a playback: hold-start to pin the last frame for the rest of the "
        + "window, loop-start to repeat, or stretch to retime. Read playbooks/craft/frame-coverage.md "
        + "on inherited edges before choosing — lengthening the material instead leaves the same edge.",
    }),
  };
}

/**
 * Source-only delivery gate for variant expansion.
 *
 * It reuses the authoring check's graph-independent analysis but deliberately does not require a
 * render, comparison, review log or VLM judgement. Only deterministic failures (unresolved vocabulary,
 * uncovered Script words and timed
 * pictures that empty their windows) decide `passed` here.
 */
export async function mechanicalAuthoringCheck(
  input: MechanicalAuthoringCheckInput,
  roots: { readonly packageRoot: string },
): Promise<Record<string, unknown>> {
  const result = await authoringCheck({ run: input.run, mode: "description" }, roots);
  const playback = Array.isArray(result.playback) ? result.playback : [];
  const uncovered = Array.isArray(result.uncovered) ? result.uncovered : [];
  const unresolved = result.unresolved_packages;
  const summary = Array.isArray(result.summary) ? result.summary.map(String) : [];
  const unreadable = summary.some((line) => line.startsWith("no aliased package import could be read")
    || line.startsWith("no package the Source imports publishes a Surface that draws"));
  const passed = playback.length === 0 && uncovered.length === 0 && unresolved === undefined && !unreadable;
  return {
    run: result.run,
    passed,
    summary,
    playback,
    uncovered,
    ...(unresolved === undefined ? {} : { unresolved_packages: unresolved }),
    note: "Mechanical variant gate only; no render, VLM comparison or visual review was performed.",
  };
}

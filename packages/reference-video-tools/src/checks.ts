import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { markupSurfaceHostFacetAbi } from "@hypit/markup";
import type { RegisteredSurface } from "@hypit/markup";
import { loadNodePackageSelection } from "@hypit/package-loader-node";
import { openStudioArchive } from "@hypit/studio/src/archive.js";
import { loadStudioDomain } from "@hypit/studio/src/domain.js";
import { loadStudioRun } from "@hypit/studio/src/run.js";
import { readStudioSession } from "@hypit/studio/src/session.js";
import type { StudioSession } from "@hypit/studio/src/session.js";
import { inspectStudioRun } from "@hypit/studio/src/studio-preflight.js";

import { invokedFrom } from "./authoring.js";
import { assert } from "./media.js";

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
  const packageRoot = roots.packageRoot;
  const workspaceRoot = dirname(runPath);

  const domain = await loadStudioDomain({ run: runPath, workspaceRoot, packageRoot });
  const archive = await openStudioArchive(runtimePath, packageRoot);

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
    inspectStudioRun(run.source, run);
    session = await readStudioSession({
      domain,
      run,
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

/**
 * Report what the route can still settle after the Source is written and before a Build runs: which
 * reconstructed elements have never been compared against the reference, and which timed pictures are
 * configured to stop before their window ends.
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
 * A project that places no drawing element passes with nothing to require.
 */
export async function reconstructionCheck(
  input: ReconstructionCheckInput,
  roots: { readonly workspaceRoot: string; readonly packageRoot: string },
): Promise<Record<string, unknown>> {
  const cwd = invokedFrom();
  const runPath = resolve(cwd, input.run);
  const packageRoot = roots.packageRoot;

  const runSource = await readFile(runPath, "utf8").catch(() => undefined);
  assert(runSource !== undefined, `cannot read ${runPath}`);
  const author = /<author\s+source="([^"]+)"/u.exec(runSource)?.[1];
  assert(author !== undefined, `${input.run} declares no <author source="…"/>`);
  const svmlPath = resolve(dirname(runPath), author);
  const svml = await readFile(svmlPath, "utf8").catch(() => undefined);
  assert(svml !== undefined, `cannot read ${svmlPath}`);

  // Every package this Source imports.
  const imports = [...svml.matchAll(/<import\s+as="([^"]+)"\s+from="(@hypit\/[^"@]+)@\d+"/gu)]
    .map((match) => ({ alias: match[1] ?? "", specifier: match[2] ?? "" }));
  if (imports.length === 0) {
    return {
      run: runPath,
      passed: true,
      summary: ["the Source imports no package; nothing to compare."],
      elements: [],
      playback: [],
    };
  }

  // Which of their Surfaces draw a Track. A Style Surface publishes a Style and draws nothing, so
  // requiring a comparison of it would be asking for a picture that does not exist.
  const specifiers = [...new Set(imports.map((item) => item.specifier))];
  const loaded = await loadNodePackageSelection(specifiers, packageRoot).catch(() => []);
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

    // Which Normalize ids carry a picture. A take normalized with `video="none"` is a voice and has no
    // window to fill.
    const moving = new Set<string>();
    for (const match of svml.matchAll(/<pipeline:Normalize\b([^>]*?)\/?>/gsu)) {
      const attributes = match[1] ?? "";
      const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
      const video = /\bvideo="([^"]+)"/u.exec(attributes)?.[1];
      if (id !== undefined && video !== undefined && video !== "none") moving.add(id);
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

  const running = await playbackReport();

  if (drawn.length === 0 && running.length === 0) {
    return {
      run: runPath,
      passed: true,
      summary: ["no drawing element is placed in the Source; nothing to require."],
      elements: [],
      playback: [],
    };
  }

  // The Source does not name the reference it reconstructs, so a single prepared reference is used
  // when there is exactly one and named explicitly when there is more than one.
  const referenceRoot = join(roots.workspaceRoot, ".hypit", "reference-video-tools");
  const prepared = (await readdir(referenceRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  let reference = input.reference_id;
  if (reference === undefined) {
    assert(prepared.length > 0, `no prepared reference under ${referenceRoot}; run prepare_reference first`);
    assert(prepared.length === 1, `${prepared.length} prepared references; pass --reference-id (${prepared.join(", ")})`);
    reference = prepared[0]!;
  }
  assert(prepared.includes(reference), `reference ${reference} is not prepared under ${referenceRoot}`);

  type LoggedComparison = {
    readonly element?: string;
    readonly shot_id?: string;
    readonly range?: { readonly segment?: string; readonly selection?: string };
    readonly status: string;
    readonly stand_in?: { readonly timing?: { readonly basis?: string } };
  };
  // What the comparison was made against, as a reader would name it: a shot, or the words a Segment
  // or Selection marks.
  const against = (entry: LoggedComparison): string =>
    entry.shot_id
    ?? (entry.range?.segment === undefined ? undefined : `segment ${entry.range.segment}`)
    ?? (entry.range?.selection === undefined ? undefined : `selection ${entry.range.selection}`)
    ?? "an unnamed stretch";
  const logPath = join(referenceRoot, reference, "comparisons.jsonl");
  const log = (await readFile(logPath, "utf8").catch(() => ""))
    .split("\n").filter((line) => line.trim().length > 0)
    .flatMap((line) => { try { return [JSON.parse(line) as LoggedComparison]; } catch { return []; } })
    // A comparison counts when it was performed. On the gemini observer the answer comes back in-band
    // as `complete`; on the agent observer it is handed out as `pending` and answered by looking at the
    // images, which is participation too. Only `failed` means nothing was compared.
    .filter((entry) => entry.status === "complete" || entry.status === "pending");

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
  const compared = elements.filter((element) => element.comparisons > 0).length;
  if (compared > 0) {
    summary.push(untimed.length === 0
      ? `every compared element was looked at over a reference-timed stand-in (${compared}).`
      : `${untimed.length} of ${compared} compared elements have comparisons over a stand-in that was not reference-timed.`);
  }

  return {
    run: runPath,
    reference_id: reference,
    passed: never.length === 0 && running.length === 0,
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
    ...(unknown.length === 0 ? {} : {
      unknown_elements: {
        names: unknown,
        note: `${unknown.length} logged element name${unknown.length === 1 ? " does" : "s do"} not exist in the Source. `
          + "A misspelled --element credits nothing; the element it was meant for is still at zero.",
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

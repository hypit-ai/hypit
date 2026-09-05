#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import { createReferenceVideoTools } from "./tools.js";
import type { CompareReconstructionInput, ObserveReferenceInput, RecordObservationInput, RenderElementInput, ReviewElementInput, RouteStateCommandInput, RevisionStateCommandInput, VariantStateCommandInput } from "./tools.js";

/**
 * A word range written on the command line as `from:to`, half-open.
 *
 * The planner emits ranges because the finest thing worth looking at is not always a thing the
 * Script named. `--segment` and `--selection` remain for the ones that are.
 */
function tokenRange(value: string | undefined): readonly [number, number] | undefined {
  if (value === undefined) return undefined;
  const parts = /^(\d+):(\d+)$/u.exec(value.trim());
  if (parts === null) throw new Error(`--tokens takes a half-open word range written from:to, like 118:131; got ${value}`);
  const from = Number(parts[1]);
  const to = Number(parts[2]);
  if (to <= from) throw new Error(`--tokens ${value} ends at or before it starts`);
  return [from, to];
}

type Flags = ReadonlyMap<string, string | readonly string[] | boolean>;

function usage(): string {
  return [
    "Usage:",
    "  hypit-reference-video-tools list_svml_packages",
    "  hypit-reference-video-tools route_state --action start|read|checkpoint|reconcile --project-root <dir> [options]",
    "  hypit-reference-video-tools revision_state --action start|read|checkpoint|reconcile --project-root <dir> [options]",
    "  hypit-reference-video-tools variant_state --action discover|start|read|checkpoint|reconcile --project-root <dir> [options]",
    "  hypit-reference-video-tools variant_init --project-root <base> --output-root <batch> --slate <slate.json>",
    "  hypit-reference-video-tools variant_check --run <variant>/build.svrun [--runtime <hypit.runtime.json>]",
    "    route_state start: --route reconstruction|description|variant|variant-package [--run <run>] [--reference-id <id>]",
    "    revision_state start: [--run <run>] [--parent-route reconstruction|description|variant] [--request <text>]",
    "    checkpoint: --route <route> (--state <stage> | --step <n>) [--status in_progress|complete|blocked] [--next-action <text>] [--artifacts <json>]",
    "    read/reconcile: --project-root <dir>",
    "  hypit-reference-video-tools prepare_reference --video-path <path or link> [--observer gemini|agent] [--redo media|transcript|people|voices|systems|places|all]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> [--shot-id <id> ...] [--reobserve]",
    "  hypit-reference-video-tools observe_reference --reference-id <id> --shot-id <id> --question <text>",
    "  hypit-reference-video-tools observe_reference --reference-id <id> --batch <questions.json>",
    "  hypit-reference-video-tools record_observation --reference-id <id> [--run <build.svrun>] --key <key> --text <text>|--text-file <path>",
    "  hypit-reference-video-tools record_observation --reference-id <id> [--run <build.svrun>] --batch <answers.json>",
    "  hypit-reference-video-tools inspect_svml_vocabulary --package <name> [--package <name> ...] [--tag <tag> ...] [--without-previews] [--run <build.svrun>]",
    "  hypit-reference-video-tools validate_local_author_packages --run <build.svrun> [--runtime <hypit.runtime.json>] [--expected-package <name> ...]",
    "  hypit-reference-video-tools validate_script_cues --run <build.svrun>",
    "  hypit-reference-video-tools inspect_visual_contract [--shape visual-track|visual-element|box|mask|text|image|video|surface|text-flow|text-typography|text-paint|text-document|path-command] [--producers-of <package> ...]",
    "  hypit-reference-video-tools paths",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --run <build.svrun> --segment <id>|--selection <id>|--tokens <from:to> --video <path>|--image <path> [--question <scope>] [--element <id>] [--tolerance-frames <n>]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --shot-id <id> --video <path>|--image <path> [--question <scope>] [--element <id>] [--tolerance-frames <n>]",
    "  hypit-reference-video-tools compare_reconstruction --reference-id <id> --batch <comparisons.json>",
    "  hypit-reference-video-tools review_element --run <build.svrun> --element <id> --segment <id>|--selection <id>|--tokens <from:to> --video <path>|--image <path> --intent-file <path> [--question <scope>]",
    "  hypit-reference-video-tools review_element --run <build.svrun> --batch <reviews.json>",
    "  hypit-reference-video-tools record_review --run <build.svrun> --review-id <id> --text <text>|--text-file <path>",
    "  hypit-reference-video-tools render_element <build.svrun> --element <id> --out <path.png|path.mp4> [--segment <id>] [--selection <id>] [--tokens <from:to>] [--reference-id <id>] [--runtime <hypit.runtime.json>]",
    "  hypit-reference-video-tools render_element <build.svrun> --batch <renders.json> [--reference-id <id>] [--runtime <hypit.runtime.json>]",
    "  hypit-reference-video-tools render_previews <package-dir> [...]",
    "  hypit-reference-video-tools preview_check <build.svrun> [<hypit.runtime.json>]",
    "  hypit-reference-video-tools layout_check --run <build.svrun> [--runtime <hypit.runtime.json>]",
    "  hypit-reference-video-tools layout_accept --run <build.svrun> --finding <id> --reason <text>",
    "  hypit-reference-video-tools layout_accept --run <build.svrun> --batch <acceptances.json>",
    "  hypit-reference-video-tools reconstruction_check <build.svrun> [--reference-id <id>] [--runtime <hypit.runtime.json>]",
    "  hypit-reference-video-tools authoring_check <build.svrun> [--runtime <hypit.runtime.json>]",
    "",
    "preview_check opens the Run the way Studio does and reports whether the graph traces. `sound` is",
    "true when every Track resolved, and also when the only thing missing is capabilities a Provider has",
    "still to serve — those are listed under `awaiting`. It takes the Run Source, not the Author SVML:",
    "Studio's unit of work is the Run, and it reads the .svml back out of it.",
    "",
    "reconstruction_check reports what the route can settle before a Build: which drawing elements have",
    "never been compared against the reference, which words of the Script nothing draws a full-frame",
    "picture over, and which timed pictures are configured to stop before their window ends. Comparison",
    "asks for participation rather than convergence, so an element compared once passes. With one",
    "prepared reference it uses that one; with several it requires --reference-id.",
    "Each element records the preview timing basis — native estimate or not recorded — so the gate knows",
    "not recorded — which says whether anything that changes with elapsed time inside its window has",
    "been looked at, or only its layout.",
    "",
    "layout_check performs a realized Composition/DOM stable-state pass without writing media or calling",
    "paid Providers. Every result is candidate evidence only: the Agent decides whether it is a genuine",
    "problem, repairs it, or records an intentional exception with layout_accept and a reason.",
    "",
    "render_element draws one element of a Source the way that Source configures it, without a Build.",
    "The Canvas, frame rate, Recipe values and bindings come from the compiled Graph; missing media is",
    "realized through @hypit/preview-mock and its local mock-media Provider.",
    "Name the stretch in words — --segment or --selection — so no reference timestamp is ever read",
    "across; without either, the whole program is drawn. An --out ending .mp4, .mov or .webm writes the",
    "stretch as a clip, and any other extension writes one still from the middle of it.",
    "",
    "Preview timing is always the Source-owned estimate:Speech policy. `--reference-id` only selects",
    "reference evidence and comparison windows; it never drives a synthetic SemanticTake clock. The",
    "result's `timing_basis` is `estimate`, and the same object is written to <out>.stand-in.json for",
    "compare_reconstruction to carry into the comparison log.",
    "",
    "render_previews draws a package's catalogue pictures from the package's own preview Source in",
    "preview/preview.svml, preview/recipes.svs and preview/build.svrun. Which element draws which file",
    "comes from the Manifest's own naming: a Surface tagged Track declares preview/Track.png, so",
    "Track.png is drawn from whichever element in the preview Source carries that tag. An .svg the",
    "Manifest promises is drawn by hand and left alone.",
    "",
    "--element names the reconstructed element the image draws. It is written to the reference's",
    "comparison log and never sent to the observer, so the comparison stays blind while a later gate can",
    "still tell which elements have been compared.",
    "",
    "compare_reconstruction takes the stretch of the reference two ways. --segment and --selection name",
    "a word range: the words come from the Author SVML of the Run given as --run, they are aligned",
    "against the reference's transcript, and the reference is cut from its own analysis video at the",
    "seconds it speaks them. That is the stretch a render covers, since a render is drawn over those",
    "same words, and one Segment routinely runs across several shots. Each end moves onto a shot",
    "boundary when one lies inside its own end word, so the pair opens and closes where the picture",
    "changes while still covering exactly the words asked for, and the rendered clip is trimmed by the",
    "seconds each end moved so both sides show the same word at the same offset. An end with no boundary",
    "inside its word leaves the pair part-way through a shot, and the prompt says how many seconds of it",
    "to read as an incomplete shot. --shot-id names a cut in the picture and compares that whole shot.",
    "",
    "--batch runs a whole round at once. The file holds a JSON array — or an object with a `comparisons`",
    "array — of the same objects a single call takes, minus reference_id, which comes from the flag:",
    "`[{\"run\": \"main.svrun\", \"segment\": \"pro\", \"video_path\": \"renders/board-pro.mp4\", \"element\": \"board\"}, …]`.",
    "Every render is finished before any comparison starts, so a round has no order to it; they are",
    "staged serially from one shared preview frame cache; observer comparisons still use their normal",
    "pacing and each one's derived cuts are kept apart, so nothing in the round reads a file another is still writing. One comparison that fails takes only itself down and",
    "arrives under `failures` with the input that produced it; the rest are under `comparisons`.",
    "",
    "--video compares the whole stretch instead of one frame of it, which is what removes the problem of",
    "choosing a characteristic frame for an element that animates in, leaves, or is replaced without a",
    "cut. The `gemini` observer receives the two clips; the `agent` observer receives two frame tiles,",
    "both tiled against the compared stretch's own duration so the grids sample alike. Use --image only",
    "when the reference's own visual observation states the element is completely still.",
    "",
    "Both sides of a --video pair are measured once they are cut to the same stretch, and a pair that is",
    "completely still on both sides is compared as one frame from each: `compared` reads `still` and",
    "`both_sides_still` says why. Both sides have to be still, because the preview-mock base is a flat",
    "fill and is therefore still whatever the reference does.",
    "",
    "Mock media is materialized by the local mock Provider and cached by @hypit/preview-mock; it never",
    "enters Author Source and is ignored by coverage gates. Timing uses estimate:Speech, while reference",
    "WhisperX is reserved for comparison evidence and window selection.",
    "",
    "record_observation takes the keys the agent observer is handed: the four whole-reference keys, a",
    "shot key such as visual:shot-003 or boundary:shot-004, a narrow question keyed by the shots it was",
    "asked over and by the question itself (question:shot-003+shot-004:<digest>), and a comparison keyed",
    "by the `comparison_id` compare_reconstruction returned (comparison:<id>). Pass the key back exactly",
    "as it was handed out. A comparison's answer is written back onto its own line of the log, which is",
    "what makes it count toward coverage; until then reconstruction_check lists it under",
    "`awaiting_answer`.",
    "",
    "--batch records a whole sweep's answers at once. The file holds a JSON array — or an object with an",
    "`answers` array — of `{key, text}`, or `{key, text_file}` where the answer was written to a file:",
    "`[{\"key\": \"visual:shot-003\", \"text_file\": \"answers/shot-003.md\"}, …]`. Paths are read against the",
    "working directory. They are applied in the order they are written, and one that fails takes only",
    "itself down and arrives under `failures`; the rest are under `records`.",
    "",
    "review_element is the counterpart on the route with no reference: it reads one rendered element",
    "against what that element was asked to be, rather than against a video to copy. --intent-file",
    "carries the author's own words and is required; --element is required too, so a review credits an",
    "element by construction. A clip becomes a grid of its own frames, and the task comes back to be",
    "answered — nobody is billed to look at a local render — with record_review closing it. Reviews are",
    "logged under the project, at <project>/.hypit/reviews.jsonl, and authoring_check reads them.",
    "",
    "authoring_check is reconstruction_check for a program authored from a description. It resolves no",
    "reference and credits an element from the review log, and it applies every check the Source alone",
    "decides — an uncovered stretch, a Frame reaching past the Canvas, a `playback` left at its default.",
    "Pick the command that matches the route; neither infers which one you meant.",
    "",
    "--video-path takes a link as readily as a path. A TikTok, YouTube, Instagram or Bilibili URL is",
    "fetched with yt-dlp before anything else runs, cached by the link so a restarted route reaches the",
    "same bytes and therefore the same reference, and reported back as `source_url`. Everything after",
    "the download reads the file without knowing it was ever a link.",
    "",
    "--observer picks who reads the reference, once per reference. `gemini` uploads video to the configured Gemini backend.",
    "With HYPIT_GEMINI_PROVIDER=auto it uses HYPIHUB_API_KEY when present, otherwise GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS_JSON for Vertex.",
    "If no usable credential is available, sign in to HypiHub with `hypit auth login` at https://hypit.ai or use `agent`. `agent` needs no credentials: it",
    "returns each observation as a task carrying its prompt and one tiled picture per shot, which the",
    "calling agent answers with record_observation. A task whose question needs sound also carries the",
    "words WhisperX measured — `transcript_words` for its own stretch, `transcript_ref` for the whole",
    "file — since that observer reads pictures and the words are the only record of when speech happens.",
    "",
    "inspect_visual_contract answers what a Producer that draws may return: the element kinds, the style",
    "names admitted on them, which take an enum, the only local styles allowed in keyframes",
    "(clip-path, filter, opacity and transform), and how few keyframes an animation carries. Every line is",
    "generated from the Composition schema, so it says what the seal will accept rather than what one",
    "package happened to do. inspect_svml_vocabulary answers the other half — what a Source may write.",
    "",
    "paths reports where this command reads reference state and resolves packages from, and which",
    "references are prepared. Use it when a check reports something it cannot see.",
    "",
    "--package-root <dir> is where the project packages a Source imports are resolved from, and it is",
    "accepted by every command. It defaults to the working directory and never replaces the active",
    "Hypit Distribution root, which remains an independent fallback for @hypit/* packages. A project that declares a vocabulary gap and",
    "fills it publishes those packages under its own scope and installs them against the project root, so",
    "run these commands from the project directory or name it here: resolved from anywhere else, the",
    "project's own packages are not found, and reconstruction_check reports them under",
    "`unresolved_packages` rather than asking for a comparison of what they draw.",
    "",
    "Every command prints one JSON result to stdout. Use --input <json> instead of flags when a complete input object is easier to pass.",
  ].join("\n");
}

function routeStateUsage(): string {
  return [
    "Usage:",
    "  hypit-reference-video-tools route_state --action start --project-root <dir> --route reconstruction|description|variant|variant-package [--run <run>] [--reference-id <id>]",
    "  hypit-reference-video-tools route_state --action read|reconcile --project-root <dir>",
    "  hypit-reference-video-tools route_state --action checkpoint --project-root <dir> --route reconstruction|description|variant|variant-package (--state <stage> | --step <n>) [options]",
    "",
    "Use exactly one of --state and --step. --state is the durable stage name; --step is retained for compatibility.",
    "",
    "Stages depend on the selected route. Read route.md for the ordered stage list.",
  ].join("\n");
}

// The authoring and check commands name what they act on positionally — a Run for `render_element`,
// `preview_check` and `reconstruction_check`, one or more package directories for `render_previews` —
// so a token that is not a flag is collected rather than refused. Every other command still refuses
// one, which is why the check is made per command rather than dropped here.
const COMMANDS_WITH_OPERANDS = new Set(["render_element", "render_previews", "preview_check", "reconstruction_check", "authoring_check"]);

function parse(argv: readonly string[]): { readonly command: string; readonly operands: readonly string[]; readonly flags: Flags } {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h") throw new Error(usage());
  const values = new Map<string, string | string[] | boolean>();
  const operands: string[] = [];
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      if (!COMMANDS_WITH_OPERANDS.has(command)) throw new Error(`unexpected argument ${token}\n\n${usage()}`);
      operands.push(token);
      continue;
    }
    const name = token.slice(2);
    if (name.length === 0) throw new Error("empty option name");
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      values.set(name, true);
      continue;
    }
    index += 1;
    const current = values.get(name);
    if (current === undefined) values.set(name, next);
    else values.set(name, [...(Array.isArray(current) ? current : [String(current)]), next]);
  }
  return { command, operands, flags: values };
}

function one(flags: Flags, name: string): string | undefined {
  const value = flags.get(name);
  if (value === undefined || typeof value === "boolean") return undefined;
  return Array.isArray(value) ? value.at(-1) : typeof value === "string" ? value : undefined;
}

function many(flags: Flags, name: string): readonly string[] {
  const value = flags.get(name);
  if (value === undefined || typeof value === "boolean") return [];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function required(flags: Flags, name: string): string {
  const value = one(flags, name);
  if (value === undefined || value.trim().length === 0) throw new Error(`--${name} is required`);
  return value;
}

function inputObject(flags: Flags): Record<string, unknown> | undefined {
  const raw = one(flags, "input");
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch (error) { throw new Error(`--input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--input must contain a JSON object");
  return parsed as Record<string, unknown>;
}

// stdout carries exactly one JSON result. Dependencies that announce themselves on stdout would
// corrupt it, so everything they write is moved to stderr and only `report` reaches stdout.
const report = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: string | Uint8Array, ...rest: readonly unknown[]): boolean =>
  (process.stderr.write as (...args: readonly unknown[]) => boolean)(chunk, ...rest)) as typeof process.stdout.write;

async function main(): Promise<void> {
  const { command, operands, flags } = parse(process.argv.slice(2));
  if (flags.has("rebuild") || flags.has("refresh")) {
    throw new Error("--rebuild and --refresh were removed; use --redo on prepare_reference or --reobserve on observe_reference");
  }
  // Where the Source's imports are resolved from. A project publishing its own packages installs them
  // against the project root, so a root taken from anywhere else resolves none of them: --package-root
  // is how a command run from elsewhere reaches them. HYPIT_DISTRIBUTION_ROOT names an installed
  // Distribution and is the fallback for the installed packages a project does not carry.
  // --package-root selects only the project/source package root.  The active Distribution root is
  // discovered independently by video-cli and is always supplied as a loader fallback.
  const resolveFrom = one(flags, "package-root");
  const tools = createReferenceVideoTools({
    ...(resolveFrom === undefined ? {} : { packageRoot: resolveFrom }),
  });
  const supplied = inputObject(flags);
  let result: unknown;
  if (command === "list_svml_packages") {
    result = await tools.list_svml_packages();
  } else if (command === "route_state") {
    if (flags.has("help") || flags.has("h")) {
      report(`${routeStateUsage()}\n`);
      return;
    }
    const routeStateFlags = new Set(["action", "project-root", "route", "run", "reference-id", "step", "state", "status", "next-action", "artifacts", "decision", "command", "error", "package-root", "input"]);
    for (const name of flags.keys()) if (!routeStateFlags.has(name)) throw new Error(`unknown route_state option --${name}\n\n${routeStateUsage()}`);
    const action = typeof supplied?.action === "string" ? supplied.action : one(flags, "action");
    if (action !== "start" && action !== "read" && action !== "checkpoint" && action !== "reconcile") {
      throw new Error("--action must be start, read, checkpoint or reconcile\n\n" + routeStateUsage());
    }
    const projectRoot = typeof supplied?.project_root === "string" ? supplied.project_root : one(flags, "project-root");
    if (projectRoot === undefined || projectRoot.trim().length === 0) throw new Error("--project-root is required\n\n" + routeStateUsage());
    if (supplied !== undefined) {
      result = await tools.route_state(supplied as RouteStateCommandInput);
    } else if (action === "start") {
      const route = one(flags, "route");
      if (route !== "reconstruction" && route !== "description" && route !== "variant" && route !== "variant-package") throw new Error("--route must be reconstruction, description, variant or variant-package");
      result = await tools.route_state({ action, project_root: projectRoot, route,
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }) } as RouteStateCommandInput);
    } else if (action === "read" || action === "reconcile") {
      result = await tools.route_state({ action, project_root: projectRoot });
    } else {
      const route = one(flags, "route");
      if (route !== "reconstruction" && route !== "description" && route !== "variant" && route !== "variant-package") throw new Error("--route must be reconstruction, description, variant or variant-package");
      const stepFlag = one(flags, "step");
      const stateFlag = one(flags, "state");
      if ((stepFlag === undefined) === (stateFlag === undefined)) throw new Error("checkpoint requires exactly one of --state <stage> or --step <n>\n\n" + routeStateUsage());
      const numericStep = stepFlag === undefined ? undefined : Number(stepFlag);
      if (stepFlag !== undefined && (!Number.isSafeInteger(numericStep) || numericStep! < 1)) throw new Error("--step must be a positive integer");
      const step: number | string = stateFlag ?? numericStep!;
      // A checkpoint names a completed stage unless the caller explicitly marks it in progress or blocked.
      // This keeps the concise `--state <stage>` form useful while preserving the API's explicit statuses.
      const status = one(flags, "status") ?? "complete";
      if (status !== undefined && status !== "in_progress" && status !== "complete" && status !== "blocked") throw new Error("--status must be in_progress, complete or blocked");
      const artifacts = one(flags, "artifacts");
      let parsedArtifacts: Readonly<Record<string, string>> | undefined;
      if (artifacts !== undefined) {
        try { parsedArtifacts = JSON.parse(artifacts) as Readonly<Record<string, string>>; } catch (error) { throw new Error(`--artifacts is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
      }
      result = await tools.route_state({ action, project_root: projectRoot, route, step,
        ...(status === undefined ? {} : { status }),
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
        ...(one(flags, "next-action") === undefined ? {} : { next_action: one(flags, "next-action") }),
        ...(parsedArtifacts === undefined ? {} : { artifacts: parsedArtifacts }),
        ...(one(flags, "decision") === undefined ? {} : { decision: one(flags, "decision") }),
        ...(one(flags, "command") === undefined ? {} : { command: one(flags, "command") }),
        ...(one(flags, "error") === undefined ? {} : { error: one(flags, "error") }),
      } as RouteStateCommandInput);
    }
  } else if (command === "revision_state") {
    const action = typeof supplied?.action === "string" ? supplied.action : one(flags, "action");
    if (action !== "start" && action !== "read" && action !== "checkpoint" && action !== "reconcile") {
      throw new Error("--action must be start, read, checkpoint or reconcile");
    }
    const projectRoot = typeof supplied?.project_root === "string" ? supplied.project_root : required(flags, "project-root");
    if (supplied !== undefined) {
      result = await tools.revision_state(supplied as RevisionStateCommandInput);
    } else if (action === "start") {
      const parentRoute = one(flags, "parent-route");
      if (parentRoute !== undefined && parentRoute !== "reconstruction" && parentRoute !== "description" && parentRoute !== "variant") throw new Error("--parent-route must be reconstruction, description or variant");
      result = await tools.revision_state({ action, project_root: projectRoot,
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
        ...(one(flags, "parent-state-digest") === undefined ? {} : { parent_state_digest: one(flags, "parent-state-digest") }),
        ...(one(flags, "request") === undefined ? {} : { request: one(flags, "request") }),
      } as RevisionStateCommandInput);
    } else if (action === "read" || action === "reconcile") {
      result = await tools.revision_state({ action, project_root: projectRoot });
    } else {
      const stepRaw = required(flags, "step");
      const numericStep = Number(stepRaw);
      const step: number | string = Number.isSafeInteger(numericStep) && numericStep >= 1 ? numericStep : stepRaw;
      const status = one(flags, "status");
      if (status !== undefined && status !== "in_progress" && status !== "complete" && status !== "blocked") throw new Error("--status must be in_progress, complete or blocked");
      const parentRoute = one(flags, "parent-route");
      if (parentRoute !== undefined && parentRoute !== "reconstruction" && parentRoute !== "description" && parentRoute !== "variant") throw new Error("--parent-route must be reconstruction, description or variant");
      let artifacts: Readonly<Record<string, string>> | undefined;
      const artifactRaw = one(flags, "artifacts");
      if (artifactRaw !== undefined) {
        try { artifacts = JSON.parse(artifactRaw) as Readonly<Record<string, string>>; } catch (error) { throw new Error(`--artifacts is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
      }
      result = await tools.revision_state({ action, project_root: projectRoot, step,
        ...(status === undefined ? {} : { status }),
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
        ...(one(flags, "parent-state-digest") === undefined ? {} : { parent_state_digest: one(flags, "parent-state-digest") }),
        ...(one(flags, "request") === undefined ? {} : { request: one(flags, "request") }),
        ...(one(flags, "next-action") === undefined ? {} : { next_action: one(flags, "next-action") }),
        ...(artifacts === undefined ? {} : { artifacts }),
        ...(one(flags, "decision") === undefined ? {} : { decision: one(flags, "decision") }),
        ...(one(flags, "command") === undefined ? {} : { command: one(flags, "command") }),
        ...(one(flags, "error") === undefined ? {} : { error: one(flags, "error") }),
        ...(many(flags, "impact").length === 0 ? {} : { impact: many(flags, "impact") }),
        ...(many(flags, "affected-source").length === 0 ? {} : { affected_source: many(flags, "affected-source") }),
      } as RevisionStateCommandInput);
    }
  } else if (command === "variant_state") {
    const action = typeof supplied?.action === "string" ? supplied.action : one(flags, "action");
    if (action !== "discover" && action !== "start" && action !== "read" && action !== "checkpoint" && action !== "reconcile") {
      throw new Error("--action must be discover, start, read, checkpoint or reconcile");
    }
    const projectRoot = typeof supplied?.project_root === "string" ? supplied.project_root : required(flags, "project-root");
    if (supplied !== undefined) {
      result = await tools.variant_state(supplied as VariantStateCommandInput);
    } else if (action === "discover") {
      result = await tools.variant_state({ action, project_root: projectRoot });
    } else if (action === "start") {
      const deliveryMode = one(flags, "delivery-mode");
      if (deliveryMode !== undefined && deliveryMode !== "source" && deliveryMode !== "build") throw new Error("--delivery-mode must be source or build");
      const countRaw = one(flags, "count");
      const count = countRaw === undefined ? undefined : Number(countRaw);
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) throw new Error("--count must be a positive integer");
      const parentRoute = one(flags, "parent-route");
      if (parentRoute !== undefined && parentRoute !== "reconstruction" && parentRoute !== "description" && parentRoute !== "variant") throw new Error("--parent-route must be reconstruction, description or variant");
      result = await tools.variant_state({
        action, project_root: projectRoot, output_root: required(flags, "output-root"),
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        ...(one(flags, "request") === undefined ? {} : { request: one(flags, "request") }),
        ...(count === undefined ? {} : { count }),
        ...(deliveryMode === undefined ? {} : { delivery_mode: deliveryMode }),
        ...(parentRoute === undefined ? {} : { parent_route: parentRoute }),
        ...(one(flags, "parent-state-digest") === undefined ? {} : { parent_state_digest: one(flags, "parent-state-digest") }),
        ...(one(flags, "revision-state-digest") === undefined ? {} : { revision_state_digest: one(flags, "revision-state-digest") }),
      } as VariantStateCommandInput);
    } else if (action === "read" || action === "reconcile") {
      const outputRoot = one(flags, "output-root");
      const batchId = one(flags, "batch-id");
      result = await tools.variant_state({
        action, project_root: projectRoot,
        ...(outputRoot === undefined ? {} : { output_root: outputRoot }),
        ...(batchId === undefined ? {} : { batch_id: batchId }),
      });
    } else {
      const stepRaw = required(flags, "step");
      const numericStep = Number(stepRaw);
      const step: number | string = Number.isSafeInteger(numericStep) && numericStep >= 1 ? numericStep : stepRaw;
      const status = one(flags, "status") ?? "complete";
      if (status !== "in_progress" && status !== "complete" && status !== "blocked") throw new Error("--status must be in_progress, complete or blocked");
      const parseObject = <T>(name: string): T | undefined => {
        const raw = one(flags, name);
        if (raw === undefined) return undefined;
        try { return JSON.parse(raw) as T; } catch (error) { throw new Error(`--${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
      };
      result = await tools.variant_state({
        action, project_root: projectRoot, step, status,
        ...(one(flags, "output-root") === undefined ? {} : { output_root: one(flags, "output-root") }),
        ...(one(flags, "batch-id") === undefined ? {} : { batch_id: one(flags, "batch-id") }),
        ...(one(flags, "next-action") === undefined ? {} : { next_action: one(flags, "next-action") }),
        ...(parseObject<Record<string, string>>("artifacts") === undefined ? {} : { artifacts: parseObject<Record<string, string>>("artifacts") }),
        ...(parseObject<VariantStateCommandInput & object>("workload-disclosure") === undefined ? {} : { workload_disclosure: parseObject("workload-disclosure") }),
        ...(parseObject<readonly unknown[]>("packages") === undefined ? {} : { packages: parseObject("packages") }),
        ...(parseObject<readonly unknown[]>("variants") === undefined ? {} : { variants: parseObject("variants") }),
        ...(one(flags, "decision") === undefined ? {} : { decision: one(flags, "decision") }),
        ...(one(flags, "conflict") === undefined ? {} : { conflict: one(flags, "conflict") }),
        ...(one(flags, "resolve-conflict") === undefined ? {} : { resolve_conflict: one(flags, "resolve-conflict") }),
        ...(one(flags, "command") === undefined ? {} : { command: one(flags, "command") }),
        ...(one(flags, "error") === undefined ? {} : { error: one(flags, "error") }),
      } as VariantStateCommandInput);
    }
  } else if (command === "variant_init") {
    result = await tools.variant_init((supplied ?? {
      project_root: required(flags, "project-root"), output_root: required(flags, "output-root"), slate: required(flags, "slate"),
    }) as { project_root: string; output_root: string; slate: string });
  } else if (command === "variant_check") {
    result = await tools.variant_check((supplied ?? {
      run: required(flags, "run"), ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
    }) as { run: string; runtime?: string });
  } else if (command === "prepare_reference") {
    const observer = one(flags, "observer");
    if (observer !== undefined && observer !== "gemini" && observer !== "agent") throw new Error("--observer must be gemini or agent");
    const input = supplied ?? {
      video_path: required(flags, "video-path"),
      ...(observer === undefined ? {} : { observer }),
      ...(one(flags, "redo") === undefined ? {} : { redo: one(flags, "redo") }),
    };
    result = await tools.prepare_reference(input as { video_path: string; observer?: "gemini" | "agent"; redo?: "media" | "transcript" | "people" | "voices" | "systems" | "places" | "all" });
  } else if (command === "observe_reference") {
    // A round of narrow questions is a list, and a list is too long for flags.
    const askFile = one(flags, "batch");
    if (askFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(askFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
      if (!Array.isArray(list)) throw new Error(`${askFile} must hold a JSON array of {shot_ids, question}, or an object with a "questions" array`);
      result = await tools.observe_reference({
        reference_id: required(flags, "reference-id"),
        questions: list as ObserveReferenceInput["questions"] & object,
      });
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      ...(many(flags, "shot-id").length === 0 ? {} : { shot_ids: many(flags, "shot-id") }),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
      ...(flags.get("reobserve") === true ? { reobserve: true } : {}),
    };
    result = await tools.observe_reference(input as { reference_id: string; shot_ids?: readonly string[]; question?: string; reobserve?: boolean });
  } else if (command === "record_observation") {
    // A whole sweep's answers at once. Each entry carries its own text, either inline or as a file the
    // answer was written to, which is read here the way --text-file is.
    const answerFile = one(flags, "batch");
    if (answerFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(answerFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { answers?: unknown }).answers;
      if (!Array.isArray(list)) throw new Error(`${answerFile} must hold a JSON array of answers, or an object with an "answers" array`);
      const answers = await Promise.all((list as { key?: unknown; text?: unknown; text_file?: unknown }[]).map(async (entry) => {
        if (typeof entry.key !== "string") throw new Error(`every answer needs a "key"; received ${JSON.stringify(entry)}`);
        const file = entry.text_file;
        // Against the working directory, the way every other batch entry's paths are.
        if (typeof file === "string") return { key: entry.key, text: await readFile(file, "utf8") };
        if (typeof entry.text !== "string") throw new Error(`answer ${entry.key} needs a "text" or a "text_file"`);
        return { key: entry.key, text: entry.text };
      }));
      result = await tools.record_observation({ reference_id: required(flags, "reference-id"), ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }), answers } as RecordObservationInput);
    } else {
      // An observation is paragraphs of prose. --text keeps a short one on the command line; --text-file
      // is how a long one arrives without the shell deciding where it ends.
      const textFile = one(flags, "text-file");
      const input = supplied ?? {
        reference_id: required(flags, "reference-id"),
        ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
        key: required(flags, "key"),
        text: textFile === undefined ? required(flags, "text") : await readFile(textFile, "utf8"),
      };
      result = await tools.record_observation(input as { reference_id: string; run?: string; key: string; text: string });
    }
  } else if (command === "review_element") {
    const reviewFile = one(flags, "batch");
    if (reviewFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(reviewFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { reviews?: unknown }).reviews;
      if (!Array.isArray(list)) throw new Error(`${reviewFile} must hold a JSON array of reviews, or an object with a "reviews" array`);
      result = await tools.review_element({ run: required(flags, "run"), reviews: list } as ReviewElementInput);
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const input = supplied ?? {
      run: required(flags, "run"),
      element: required(flags, "element"),
      ...(one(flags, "segment") === undefined ? {} : { segment: one(flags, "segment") }),
      ...(one(flags, "selection") === undefined ? {} : { selection: one(flags, "selection") }),
      ...(tokenRange(one(flags, "tokens")) === undefined ? {} : { tokens: tokenRange(one(flags, "tokens")) }),
      ...(one(flags, "image") === undefined ? {} : { image_path: one(flags, "image") }),
      ...(one(flags, "video") === undefined ? {} : { video_path: one(flags, "video") }),
      ...(one(flags, "intent-file") === undefined ? {} : { intent_file: one(flags, "intent-file") }),
      ...(one(flags, "intent") === undefined ? {} : { intent: one(flags, "intent") }),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
    };
    result = await tools.review_element(input as ReviewElementInput);
  } else if (command === "record_review") {
    // Findings are paragraphs of prose, so they arrive the way an observation's do.
    const textFile = one(flags, "text-file");
    const input = supplied ?? {
      run: required(flags, "run"),
      review_id: required(flags, "review-id"),
      text: textFile === undefined ? required(flags, "text") : await readFile(textFile, "utf8"),
    };
    result = await tools.record_review(input as { run: string; review_id: string; text: string });
  } else if (command === "compare_reconstruction") {
    // A round is a list of comparisons, and a list is too long for flags. --batch names a JSON file
    // holding it, which is also how it survives being written by one step and read by another.
    const batchFile = one(flags, "batch");
    if (batchFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(batchFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { comparisons?: unknown }).comparisons;
      if (!Array.isArray(list)) throw new Error(`${batchFile} must hold a JSON array of comparisons, or an object with a "comparisons" array`);
      result = await tools.compare_reconstruction({
        reference_id: required(flags, "reference-id"),
        comparisons: list as CompareReconstructionInput["comparisons"] & object,
      });
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const video = one(flags, "video");
    const segment = one(flags, "segment");
    const selection = one(flags, "selection");
    const tokens = tokenRange(one(flags, "tokens"));
    const range = segment !== undefined || selection !== undefined || tokens !== undefined;
    const input = supplied ?? {
      reference_id: required(flags, "reference-id"),
      ...(range
        ? {
          run: required(flags, "run"),
          ...(tokens === undefined ? {} : { tokens }),
          ...(segment === undefined ? {} : { segment }),
          ...(selection === undefined ? {} : { selection }),
        }
        : { shot_id: required(flags, "shot-id") }),
      ...(video === undefined ? { image_path: required(flags, "image") } : { video_path: video }),
      ...(one(flags, "question") === undefined ? {} : { question: one(flags, "question") }),
      ...(one(flags, "element") === undefined ? {} : { element: one(flags, "element") }),
      ...(one(flags, "tolerance-frames") === undefined ? {} : { tolerance_frames: Number(one(flags, "tolerance-frames")) }),
    };
    result = await tools.compare_reconstruction(input as CompareReconstructionInput);
  } else if (command === "inspect_visual_contract") {
    result = await tools.inspect_visual_contract({
      ...(one(flags, "shape") === undefined ? {} : { shape: one(flags, "shape")! }),
      ...(many(flags, "producers-of").length === 0 ? {} : { producers: many(flags, "producers-of") }),
    });
  } else if (command === "paths") {
    result = await tools.paths();
  } else if (command === "inspect_svml_vocabulary") {
    const packages = many(flags, "package");
    const input = supplied ?? {
      package_names: packages.length > 0 ? packages : [required(flags, "package-name")],
      ...(many(flags, "tag").length === 0 ? {} : { tags: many(flags, "tag") }),
      ...(flags.get("without-previews") === true ? { include_previews: false } : {}),
      ...(one(flags, "run") === undefined ? {} : { run: one(flags, "run") }),
    };
    result = await tools.inspect_svml_vocabulary(input as { package_names: readonly string[]; tags?: readonly string[]; include_previews?: boolean; run?: string });
  } else if (command === "validate_local_author_packages") {
    const runtime = one(flags, "runtime");
    result = await tools.validate_local_author_packages({
      run: required(flags, "run"),
      ...(runtime === undefined ? {} : { runtime }),
      ...(many(flags, "expected-package").length === 0 ? {} : { expected_packages: many(flags, "expected-package") }),
    });
  } else if (command === "validate_script_cues") {
    result = await tools.validate_script_cues({ run: required(flags, "run") });
  } else if (command === "render_element") {
    const renderFile = one(flags, "batch");
    if (renderFile !== undefined) {
      const parsed: unknown = JSON.parse(await readFile(renderFile, "utf8"));
      const list = Array.isArray(parsed) ? parsed : (parsed as { renders?: unknown }).renders;
      if (!Array.isArray(list)) throw new Error(`${renderFile} must hold a JSON array of renders, or an object with a "renders" array`);
      result = await tools.render_element({
        ...(operands[0] === undefined ? {} : { run: operands[0] }),
        ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
        ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
        renders: list,
      } as RenderElementInput);
      report(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      element: required(flags, "element"),
      out: required(flags, "out"),
      ...(one(flags, "segment") === undefined ? {} : { segment: one(flags, "segment") }),
      ...(one(flags, "selection") === undefined ? {} : { selection: one(flags, "selection") }),
      ...(tokenRange(one(flags, "tokens")) === undefined ? {} : { tokens: tokenRange(one(flags, "tokens")) }),
      ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
      ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
    };
    result = await tools.render_element(input as RenderElementInput);
  } else if (command === "render_previews") {
    if (supplied === undefined && operands.length === 0) throw new Error(`a <package-dir> is required\n\n${usage()}`);
    const input = supplied ?? { package_dirs: operands };
    result = await tools.render_previews(input as { package_dirs: readonly string[] });
  } else if (command === "preview_check") {
    // The runtime archive is the second operand rather than a flag, the way the Run itself is: both
    // name a file this command opens, and the pair reads as one argument list.
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      ...(operands[1] === undefined ? {} : { runtime: operands[1] }),
    };
    result = await tools.preview_check(input as { run: string; runtime?: string });
  } else if (command === "layout_check") {
    result = await tools.layout_check((supplied ?? {
      run: required(flags, "run"),
      ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
    }) as { run: string; runtime?: string });
  } else if (command === "layout_accept") {
    if (supplied !== undefined) result = await tools.layout_accept(supplied as never);
    else {
      const batch = one(flags, "batch");
      if (batch === undefined) {
        result = await tools.layout_accept({ run: required(flags, "run"), finding: required(flags, "finding"), reason: required(flags, "reason") });
      } else {
        const decoded = JSON.parse(await readFile(batch, "utf8")) as unknown;
        const findings = Array.isArray(decoded) ? decoded : decoded !== null && typeof decoded === "object"
          ? (decoded as { findings?: unknown }).findings
          : undefined;
        if (!Array.isArray(findings)) throw new Error("layout_accept --batch expects a JSON array or an object with a findings array");
        result = await tools.layout_accept({ run: required(flags, "run"), findings });
      }
    }
  } else if (command === "reconstruction_check") {
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    const input = supplied ?? {
      run,
      ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
      ...(one(flags, "reference-id") === undefined ? {} : { reference_id: one(flags, "reference-id") }),
    };
    result = await tools.reconstruction_check(input as { run: string; reference_id?: string; runtime?: string });
  } else if (command === "authoring_check") {
    const run = operands[0];
    if (supplied === undefined && run === undefined) throw new Error(`a <build.svrun> is required\n\n${usage()}`);
    result = await tools.authoring_check((supplied ?? {
      run,
      ...(one(flags, "runtime") === undefined ? {} : { runtime: one(flags, "runtime") }),
    }) as { run: string; runtime?: string });
  } else {
    throw new Error(`unknown command ${command}\n\n${usage()}`);
  }
  report(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

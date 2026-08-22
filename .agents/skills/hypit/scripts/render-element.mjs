#!/usr/bin/env node
/**
 * Render one element of a Source the way that Source configures it, without a Build and without a
 * Provider.
 *
 * `reconstruction-loop.md` compares a reconstructed element against the reference. What it must
 * compare is the element as this video places it — the Recipe values the Source passes, the Script
 * text it feeds, the windows it binds — because a Source can fill those with values that collide
 * while a package's catalogue preview, drawn from sample values, stays perfect. Producing that
 * picture by hand means transcribing values into a per-package harness, one line at a time, which is
 * how a caption system gets compared as a single line that has nothing to collide with.
 *
 * So this reads the values instead. Everything it needs is already written down:
 *
 *   Canvas and Frames, Recipe values, bindings   the Source
 *   which elements share a window, in what order  the Script's words, through their Selections
 *   how long each Segment runs                    the Source's own `estimate:Speech`
 *   the layers a Build has not made               `make-placeholder`, sized from the Canvas
 *
 * The one thing missing before a Build is real speech, and `stand-in-takes.mjs` supplies a Segment
 * skeleton from the estimator the Source already trusts — the same numbers it ordered its takes
 * with, not a second clock. Those takes enter through `<value>` and `<satisfy>`, the mechanism
 * `examples/all-components-preview` uses to open in Studio without spending anything, so nothing
 * here is a private back door into the graph.
 *
 * What this settles: which elements are on screen together, where each sits, at what size, weight and
 * colour. What it does not: real timing, which waits for `playbooks/craft/production-gates.md` Gate 3.
 *
 * Usage:
 *   node --import tsx .agents/skills/hypit/scripts/render-element.mjs <build.svrun> \
 *     --element <id> --out <path.png|path.mp4> [--segment <id>] [--base <mock.mp4>]
 *
 * Exit: 0 having written --out. 1 when the element cannot be projected, naming what is unresolved.
 *       2 on a usage or discovery error.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studio = (name) => new URL(`../../../../packages/studio/src/${name}`, import.meta.url).href;
const { openStudioArchive } = await import(studio("archive.js"));
const { loadStudioDomain } = await import(studio("domain.js"));
const { loadStudioRun } = await import(studio("run.js"));
const { preview } = await import(studio("programme.js"));
const { inspectStudioRun } = await import(studio("studio-preflight.js"));
const { compileHyperframesDocument, materializeHyperframesHtml } = await import(new URL("../../../../packages/hyperframes/src/document.ts", import.meta.url).href);
const { standInTakes } = await import(new URL("./stand-in-takes.mjs", import.meta.url).href);

function fail(message, code = 2) {
  console.error(`render-element: ${message}`);
  process.exit(code);
}

function blobRef(bytes, mediaType) {
  return { kind: "blob", digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, size: bytes.byteLength, mediaType };
}

/** 48 kHz mono PCM silence, written by hand so the mock needs no encoder and lands on exact bytes. */
function silentWav(sampleFrames) {
  const data = Math.max(2, sampleFrames * 2);
  const buffer = Buffer.alloc(44 + data);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + data, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48_000, 24);
  buffer.writeUInt32LE(48_000 * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(data, 40);
  return buffer;
}

const argv = process.argv.slice(2);
const runArgument = argv[0];
if (runArgument === undefined || runArgument.startsWith("--")) {
  fail("usage: render-element.mjs <build.svrun> --element <id> --out <path> [--segment <id>] [--base <mock.mp4>]");
}
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
};
const element = flag("element") ?? fail("--element is required");
const out = flag("out") ?? fail("--out is required");

const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const runPath = resolve(invokedFrom, runArgument);
// The repository, found from this file rather than from wherever it was called. Deriving it from the
// working directory means the command works from the root and crashes anywhere else, on a missing
// module rather than on anything a reader could act on.
const packageRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const projectRoot = dirname(runPath);
const outPath = resolve(invokedFrom, out);

const runSource = await readFile(runPath, "utf8").catch(() => fail(`cannot read ${runPath}`));
const authorMatch = /<author\s+source="([^"]+)"/u.exec(runSource);
if (authorMatch === null) fail(`${runArgument} declares no <author source="…"/>`);
const svmlPath = resolve(projectRoot, authorMatch[1]);
const svml = await readFile(svmlPath, "utf8").catch(() => fail(`cannot read ${svmlPath}`));

// The Program's frame rate and the Canvas the render composes at, both read rather than assumed. A
// harness that hard-codes either produces a picture at a geometry the reference never had.
const clock = /<[a-z-]*:?Clock\b[^>]*?\bframe-rate="(\d+)"/su.exec(svml)?.[1]
  ?? /<time:Clock\b[^>]*?\bfps="(\d+)"/su.exec(svml)?.[1];
const frameRate = Number(clock ?? 30);
const canvasMatch = /<space:Canvas\b[^>]*?\bwidth="(\d+)"[^>]*?\bheight="(\d+)"/su.exec(svml);
if (canvasMatch === null) fail("the Source declares no <space:Canvas width= height=/>");
const canvas = { width: Number(canvasMatch[1]), height: Number(canvasMatch[2]) };

// Which SemanticTake output belongs to which Segment, so each stand-in lands on the right one.
const takeOutputs = new Map();
for (const [, attributes] of svml.matchAll(/<whisperx:SemanticTake\b([^>]*?)\/?>/gsu)) {
  const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
  const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
  if (id !== undefined && segment !== undefined) takeOutputs.set(segment, id);
}
if (takeOutputs.size === 0) fail("the Source declares no whisperx:SemanticTake to stand in for");

// What the Run already brings. A project Run declares nothing and everything is mocked; a package's
// preview Run ships its own sample pictures, and those are carried across untouched so the catalogue
// picture shows the component holding something rather than a placeholder.
const alreadySatisfied = new Set([...runSource.matchAll(/<satisfy\s+output="([^"]+)"/gu)].map(([, output]) => output));
const carried = [...runSource.matchAll(/^[ \t]*<(?:file|value|satisfy)\b[^>]*\/>[ \t]*$/gmu)].map(([line]) => line.trim());

const { takes, selections, frameCount: programFrames } = await standInTakes(svmlPath, frameRate);
const framesBySegment = new Map(takes.map((item) => [item.segmentId, item.take.segment.endFrameExclusive]));
// A Selection's window in frames, summed over the stand-in tokens it covers. This is the same word
// span the Source binds to, carried into frames by the same estimate that sized the Segment.
const framesBySelection = new Map();
for (const { segmentId, take } of takes) {
  for (const token of take.tokens) framesBySelection.set(token.tokenId, token.endFrameExclusive - token.startFrame);
  framesBySelection.set(`segment:${segmentId}`, take.segment.endFrameExclusive);
}

/**
 * Every media a Build would have produced, and how long its window is. A speech take carries no
 * picture and a base take fills a Segment; a cutaway fills whatever its `during=` binds. Each becomes
 * a placeholder of the Canvas's own size, so the composite has the geometry the Source declares.
 */
function mockedMedia() {
  const windows = new Map();
  for (const [, attributes] of svml.matchAll(/<whisperx:SemanticTake\b([^>]*?)\/?>/gsu)) {
    const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
    const segment = /\bsegment=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
    if (media !== undefined && segment !== undefined) windows.set(media, framesBySegment.get(segment) ?? frameRate);
  }
  for (const [, attributes] of svml.matchAll(/<[a-z][a-z0-9-]*:[A-Za-z][A-Za-z0-9]*\b([^>]*?)\/?>/gsu)) {
    const media = /\bmedia=\{([A-Za-z0-9_-]+)\.media\}/u.exec(attributes)?.[1];
    if (media === undefined || windows.has(media)) continue;
    const segment = /\bduring=\{story\.segment\.([A-Za-z0-9_-]+)\}/u.exec(attributes)?.[1];
    if (segment !== undefined) { windows.set(media, framesBySegment.get(segment) ?? frameRate); continue; }
    windows.set(media, frameRate * 2);
  }
  const carries = new Map();
  for (const [, attributes] of svml.matchAll(/<pipeline:Normalize\b([^>]*?)\/?>/gsu)) {
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    const video = /\bvideo="([^"]+)"/u.exec(attributes)?.[1];
    if (id === undefined || !windows.has(id)) continue;
    // A Run that already satisfies this output brought its own material — a package's preview Source
    // supplies sample pictures this way — and a mock over the top would hide what it came to show.
    if (alreadySatisfied.has(`${id}.media`)) continue;
    carries.set(id, { frames: windows.get(id), picture: video !== "none" });
  }
  return carries;
}

// A derived Run lives beside the project so the original's relative sources still resolve, and under
// `.hypit/` so it is never mistaken for something the author wrote. It is rewritten every run.
const compareRoot = join(projectRoot, ".hypit", "compare");
await rm(compareRoot, { recursive: true, force: true });
await mkdir(compareRoot, { recursive: true });
const declarations = [];
const satisfactions = [];
for (const { segmentId, take } of takes) {
  const output = takeOutputs.get(segmentId);
  if (output === undefined) continue;
  // The take's own audio has to be servable, not a digest stub: Studio resolves every Artifact a
  // projection references, and a preview that cannot serve one stops there.
  const sampleFrames = Math.round(take.segment.endFrameExclusive / frameRate * 48_000);
  const silence = silentWav(sampleFrames);
  await writeFile(join(compareRoot, `${segmentId}-take.wav`), silence);
  const spoken = { ...take, media: { ...take.media, audio: { artifact: blobRef(silence, "audio/wav"), sampleFrames } } };
  const fixture = join(compareRoot, `${segmentId}.json`);
  await writeFile(fixture, `${JSON.stringify({ kind: "inline", value: spoken }, null, 2)}\n`, "utf8");
  declarations.push(`  <file id="stand-in-${segmentId}-audio" type="@hypit/artifact@1#BlobArtifact" from="./${segmentId}-take.wav" media-type="audio/wav"/>`);
  declarations.push(`  <value id="stand-in-${segmentId}" type="@hypit/speech@1#SemanticTake" from="./${segmentId}.json"/>`);
  satisfactions.push(`  <satisfy output="${output}.take" candidate="stand-in-${segmentId}"/>`);
}
// The layers a Build has not made, as placeholders of the Canvas's own size. `make-placeholder` is
// the route's one tool for this: deterministic, Provider-free, and the same mock the comparison is
// told to bypass. A mock never enters the project's own Source — it is declared in the derived Run
// and nowhere else.
const placeholderCli = new URL("../../../../packages/reference-video-tools/src/cli.ts", import.meta.url);
for (const [id, { frames, picture }] of mockedMedia()) {
  const seconds = Math.max(0.1, frames / frameRate);
  const file = join(compareRoot, `${id}.mp4`);
  if (picture) {
    const made = spawnSync(process.execPath, [
      "--import", "tsx", fileURLToPath(placeholderCli), "make-placeholder",
      "--out", file, "--width", String(canvas.width), "--height", String(canvas.height),
      "--video", "--seconds", seconds.toFixed(3), "--color", "mid",
    ], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
    if (made.status !== 0) fail(`make-placeholder failed for ${id}: ${made.stderr?.trim()}`);
  }
  // Every SynchronizedMedia carries audio, and it is validated as WAV, so the silence is written as
  // one rather than pointed at the video. Both are declared: the picture is what gets drawn, the
  // silence is what makes the value legal.
  const wavPath = join(compareRoot, `${id}.wav`);
  const wav = silentWav(Math.round(frames / frameRate * 48_000));
  await writeFile(wavPath, wav);
  const audioBlob = blobRef(wav, "audio/wav");
  const media = {
    timeline: { frameRate: { numerator: frameRate, denominator: 1 }, frameCount: frames },
    audio: { artifact: audioBlob },
  };
  declarations.push(`  <file id="mock-${id}-audio" type="@hypit/artifact@1#BlobArtifact" from="./${id}.wav" media-type="audio/wav"/>`);
  if (picture) {
    const bytes = await readFile(file);
    media.visual = { artifact: blobRef(bytes, "video/mp4"), width: canvas.width, height: canvas.height };
    declarations.push(`  <file id="mock-${id}" type="@hypit/artifact@1#BlobArtifact" from="./${id}.mp4" media-type="video/mp4"/>`);
  }
  await writeFile(join(compareRoot, `${id}.media.json`), `${JSON.stringify({ kind: "inline", value: media }, null, 2)}\n`, "utf8");
  declarations.push(`  <value id="media-${id}" type="@hypit/media@1#SynchronizedMedia" from="./${id}.media.json"/>`);
  satisfactions.push(`  <satisfy output="${id}.media" candidate="media-${id}"/>`);
}

// Still images the Source declares as generations. Same treatment, same tool, at the Canvas's size:
// a picture slot that is empty in the render is black, and black is not what will be there.
const imageIds = [...new Set([...svml.matchAll(/\{([a-z0-9-]+)\.image\}/gu)].map(([, id]) => id))]
  .filter((id) => !alreadySatisfied.has(`${id}.image`));
for (const id of imageIds) {
  const file = join(compareRoot, `${id}.png`);
  const made = spawnSync(process.execPath, [
    "--import", "tsx", fileURLToPath(placeholderCli), "make-placeholder",
    "--out", file, "--width", String(canvas.width), "--height", String(canvas.height), "--color", "mid",
  ], { encoding: "utf8", windowsHide: true, timeout: 120_000 });
  if (made.status !== 0) fail(`make-placeholder failed for ${id}: ${made.stderr?.trim()}`);
  declarations.push(`  <file id="mock-${id}" type="@hypit/artifact@1#BlobArtifact" from="./${id}.png" media-type="image/png"/>`);
  satisfactions.push(`  <satisfy output="${id}.image" candidate="mock-${id}"/>`);
}

const derivedRun = join(compareRoot, "compare.svrun");
await writeFile(derivedRun, [
  `<?svml using="@hypit/run-markup@1"?>`,
  ``,
  `<svrun version="1">`,
  `  <author source="../../${authorMatch[1].replace(/^\.\//u, "")}"/>`,
  // Whatever the Run brought, repointed: the derived Run sits two directories deeper than the one
  // that declared these paths.
  ...carried.map((line) => `  ${line.replace(/from="\.\//gu, 'from="../../')}`),
  // Targeting the element's own output rather than the Film prunes the closure to what this one
  // Track needs. Asking for the whole delivery would pull in every generation the Source declares
  // and report each as unresolved, which is true and useless: none of them is what is being looked at.
  `  <target output="final.video"/>`,
  ``,
  ...declarations,
  ``,
  ...satisfactions,
  `</svrun>`,
  ``,
].join("\n"), "utf8");

const domain = await loadStudioDomain({ run: derivedRun, workspaceRoot: projectRoot, packageRoot });
const archive = await openStudioArchive(undefined, packageRoot);
let built;
try {
  const run = await loadStudioRun({ run: derivedRun, domain, ...(archive === undefined ? {} : { archive }) });
  const inspection = inspectStudioRun(run.source, run);
  // Every Track, not only the one being looked at: the element is compared where it sits, over the
  // mocked base rather than on its own, because text that is legible on black may not be on a picture.
  built = await preview({
    source: run.source,
    run,
    domain,
    outputRefs: [inspection.filmComposition, ...inspection.projections.map((item) => item.ref)],
    compositionRef: inspection.filmComposition,
    projections: inspection.projections,
    ...(archive === undefined ? {} : { archive }),
  });
} catch (error) {
  const issues = error?.issues;
  if (Array.isArray(issues)) {
    console.error("render-element: the Source does not project yet.");
    for (const issue of issues.slice(0, 12)) console.error(`  ${issue}`);
    process.exit(1);
  }
  fail(error instanceof Error ? error.message : String(error), 1);
}

const placed = built.tracks.find((track) => String(track.outputRef ?? "").endsWith(`::output::${element}.track`)
  || String(track.outputRef ?? "").includes(`::output::${element}.`));
if (placed === undefined) {
  console.error(`render-element: the Source places no element named ${element}. It places:`);
  for (const track of built.tracks) console.error(`  ${String(track.outputRef ?? "").split("::output::")[1] ?? track.name}`);
  process.exit(1);
}

// The window to render, named in words. A shot of the reference is found by the words spoken over it
// and those words are a Segment or a Selection here, so no reference timestamp is ever read across.
const segmentArgument = flag("segment");
const selectionArgument = flag("selection");
let window = { startFrame: 0, endFrameExclusive: programFrames };
if (selectionArgument !== undefined) {
  window = selections.get(selectionArgument)
    ?? fail(`the Script marks no Selection ${selectionArgument}`);
} else if (segmentArgument !== undefined) {
  let cursor = 0;
  const take = takes.find((item) => { const hit = item.segmentId === segmentArgument; if (!hit) cursor += item.take.segment.endFrameExclusive; return hit; });
  if (take === undefined) fail(`the Script has no Segment ${segmentArgument}`);
  window = { startFrame: cursor, endFrameExclusive: cursor + take.take.segment.endFrameExclusive };
}

// Compile once, materialize with the artifact bytes written beside the document, and let the
// HyperFrames runtime draw it. This is the path packages/hyperframes/test/browser-visual.test.ts
// takes; nothing here is a private renderer.
const document = compileHyperframesDocument(built.composition, built.space);
const stage = join(compareRoot, "stage");
await mkdir(stage, { recursive: true });
const names = new Map();
for (const [digest, file] of built.served) {
  const name = `${digest.replace(/[^a-z0-9]/giu, "")}`;
  await writeFile(join(stage, name), file.bytes);
  names.set(digest, name);
}
await writeFile(join(stage, "index.html"), materializeHyperframesHtml(document, (artifact) => {
  const name = names.get(artifact.digest);
  if (name === undefined) fail(`the projection references Artifact ${artifact.digest}, which was not served`, 1);
  return `./${name}`;
}), "utf8");

const clip = /\.(mp4|mov|webm)$/iu.test(outPath);
const frames = join(compareRoot, "frames");
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
const hyperframesCli = createRequire(join(packageRoot, "packages/provider-hyperframes-local/package.json"))
  .resolve("hyperframes/bin/hyperframes.mjs");
const drawn = spawnSync(process.execPath, [
  hyperframesCli, "render", stage,
  "--format", "png-sequence", "--output", frames, "--fps", String(frameRate),
  "--workers", "1", "--no-browser-gpu", "--no-best-effort", "--quiet",
], { encoding: "utf8", windowsHide: true, timeout: 600_000 });
if (drawn.status !== 0) fail(`the HyperFrames runtime refused: ${(drawn.stderr ?? "").trim().slice(-2000)}`, 1);

const written = (await readdir(frames)).filter((name) => name.endsWith(".png")).sort();
if (written.length === 0) fail("the HyperFrames runtime wrote no frames", 1);
const first = Math.min(window.startFrame, written.length - 1);
const last = Math.min(window.endFrameExclusive, written.length);
// The runtime draws with an alpha channel and leaves unpainted area transparent. What a viewer is
// under is the Film's own clear colour, so it is composited in here rather than left to whatever
// opens the file: a reference clip is opaque, and an observer handed a transparent counterpart reads
// the difference as design when it came from the encoding.
const clear = built.canvas?.clearColor ?? "#000000";
const background = `color=c=${clear.replace("#", "0x")}:s=${canvas.width}x${canvas.height}:r=${frameRate}`;
const count = Math.max(1, clip ? last - first : 1);
const encoded = spawnSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", background,
  "-framerate", String(frameRate), "-start_number", String(clip ? first : Math.min(first + Math.floor((last - first) / 2), written.length - 1)),
  "-i", join(frames, "frame_%06d.png"),
  "-filter_complex", "[0][1]overlay=shortest=1[v]", "-map", "[v]",
  "-frames:v", String(count),
  ...(clip ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20"] : []),
  outPath,
], { encoding: "utf8", windowsHide: true, timeout: 600_000 });
if (encoded.status !== 0) fail(`ffmpeg refused: ${(encoded.stderr ?? "").trim().slice(-2000)}`, 1);

console.log(JSON.stringify({
  element,
  out: outPath,
  compared: clip ? "clip" : "still",
  canvas,
  frame_rate: frameRate,
  window,
  program_frames: programFrames,
  mocked: { media: mockedMedia().size, images: imageIds.length },
}, null, 2));

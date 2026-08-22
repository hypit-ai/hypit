#!/usr/bin/env node
/**
 * Report which reconstructed elements have never been compared against the reference.
 *
 * `preview-check` proves the graph is wired. It proves nothing about whether what the graph draws
 * resembles the reference video, and a Source can pass every structural check while a
 * project-local component draws something the reference never contained. Closing that gap is
 * `references/reconstruction/reconstruction-loop.md`, which is prose, and prose is what a route
 * skips silently. This is the same requirement as a command with an exit code.
 *
 * Usage:  node --import tsx .agents/skills/hypit/scripts/reconstruction-check.mjs <build.svrun> [--reference-id <id>]
 * Exit:   0 when every locally-drawn element has at least one recorded comparison.
 *         1 when one or more have none, naming each and the command that compares it.
 *         2 on a usage or discovery error.
 *
 * What it checks is **participation, not convergence**. The loop is deliberately bounded and may
 * stop with visible differences remaining, so requiring convergence here would contradict it. An
 * element that was compared once and stopped at its ceiling passes; an element nobody ever looked
 * at does not.
 *
 * Only elements drawn by a `@hypit/local-*` package are required. Installed vocabulary is already
 * reviewed; a package written for this one video is the thing with no other reader.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const packageLoader = new URL("../../../../packages/package-loader-node/src/index.ts", import.meta.url).href;
const { loadNodePackageSelection } = await import(packageLoader);

const runArgument = process.argv[2];
if (runArgument === undefined || runArgument.startsWith("--")) {
  console.error("usage: reconstruction-check.mjs <build.svrun> [--reference-id <id>]");
  process.exit(2);
}
const flagIndex = process.argv.indexOf("--reference-id");
const suppliedReference = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];

const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const runPath = resolve(invokedFrom, runArgument);
const packageRoot = resolve(invokedFrom);

function fail(message) {
  console.error(`reconstruction-check: ${message}`);
  process.exit(2);
}

const runSource = await readFile(runPath, "utf8").catch(() => fail(`cannot read ${runPath}`));
const authorMatch = /<author\s+source="([^"]+)"/u.exec(runSource);
if (authorMatch === null) fail(`${runArgument} declares no <author source="…"/>`);
const svmlPath = resolve(dirname(runPath), authorMatch[1]);
const svml = await readFile(svmlPath, "utf8").catch(() => fail(`cannot read ${svmlPath}`));

// Every package this Source imports, and which of them were written for this project.
const imports = [...svml.matchAll(/<import\s+as="([^"]+)"\s+from="(@hypit\/[^"@]+)@\d+"/gu)]
  .map(([, alias, specifier]) => ({ alias, specifier, local: specifier.startsWith("@hypit/local-") }));
if (imports.length === 0) {
  console.log("reconstruction-check: the Source imports no package; nothing to compare.");
  process.exit(0);
}

// Which of their Surfaces draw a Track. A Style Surface publishes a Style and draws nothing, so
// requiring a comparison of it would be asking for a picture that does not exist.
const specifiers = [...new Set(imports.map((item) => item.specifier))];
const loaded = await loadNodePackageSelection(specifiers, packageRoot).catch(() => []);
const drawingTags = new Map();
for (const pack of loaded) {
  for (const facet of pack.contribution.hostFacets ?? []) {
    const surface = facet.implementation;
    const draws = (surface.outputs ?? []).some((output) =>
      output.module?.name === "@hypit/composition" && (output.name === "VisualTrack" || output.name === "AudioTrack"));
    if (draws) drawingTags.set(`${pack.specifier}#${surface.tag}`, true);
  }
}

// Every use of one of those tags, by the id the Source gave it.
const drawn = [];
for (const { alias, specifier, local } of imports) {
  const pattern = new RegExp(`<${alias}:([A-Za-z][A-Za-z0-9]*)\\b[^>]*?\\bid="([^"]+)"`, "gu");
  for (const [, tag, id] of svml.matchAll(pattern)) {
    if (!drawingTags.has(`${specifier}#${tag}`)) continue;
    if (!drawn.some((item) => item.id === id)) drawn.push({ id, tag, alias, specifier, local });
  }
}

// A project-local package is required here: it was written for this one video and nothing else has
// read it. A Track from installed vocabulary carries authored values too — a caption Style's size,
// colour and placement are as unverified as a new package's — but it cannot be rendered before a
// Build without a fixture SemanticTrack, so it is reported rather than demanded.
const elements = drawn.filter((item) => item.local);
const deferred = drawn.filter((item) => !item.local);
if (elements.length === 0) {
  console.log("reconstruction-check: no locally-drawn element is placed in the Source; nothing to require.");
  if (deferred.length > 0) reportDeferred();
  process.exit(0);
}

// The Source does not name the reference it reconstructs, so a single prepared reference is used
// when there is exactly one and named explicitly when there is more than one.
const referenceRoot = join(packageRoot, ".hypit", "reference-video-tools");
const prepared = (await readdir(referenceRoot, { withFileTypes: true }).catch(() => []))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
let reference = suppliedReference;
if (reference === undefined) {
  if (prepared.length === 1) reference = prepared[0];
  else if (prepared.length === 0) fail(`no prepared reference under ${referenceRoot}; run prepare_reference first`);
  else fail(`${prepared.length} prepared references; pass --reference-id (${prepared.join(", ")})`);
}
if (!prepared.includes(reference)) fail(`reference ${reference} is not prepared under ${referenceRoot}`);

const logPath = join(referenceRoot, reference, "comparisons.jsonl");
const log = (await readFile(logPath, "utf8").catch(() => ""))
  .split("\n").filter((line) => line.trim().length > 0)
  .map((line) => { try { return JSON.parse(line); } catch { return undefined; } })
  .filter((entry) => entry !== undefined && entry.status === "complete");

// Which shots each element was compared against, in order. The gate cannot judge whether a shot was
// the right one to compare against — it does not know what the element draws — so it prints them and
// lets a reader notice a component compared against a shot that never showed it.
const rounds = new Map();
for (const entry of log) {
  if (entry.element === undefined) continue;
  const seen = rounds.get(entry.element) ?? [];
  seen.push(entry.shot_id);
  rounds.set(entry.element, seen);
}

const never = elements.filter((element) => (rounds.get(element.id) ?? []).length === 0);
const unlabelled = log.filter((entry) => entry.element === undefined).length;
// A misspelled --element is otherwise silent: the comparison happens, the log grows, and the element
// it was meant for stays at zero for ever.
const known = new Set(drawn.map((item) => item.id));
const unknown = [...new Set([...rounds.keys()].filter((id) => !known.has(id)))];

for (const element of elements) {
  const shots = rounds.get(element.id) ?? [];
  const state = shots.length === 0
    ? "never compared"
    : `${shots.length} comparison${shots.length === 1 ? "" : "s"} against ${[...new Set(shots)].join(", ")}`;
  console.log(`  ${element.alias}:${element.tag} id=${element.id}\n      ${state}`);
}

function reportDeferred() {
  console.log("");
  console.log(`  ${deferred.length} Track${deferred.length === 1 ? "" : "s"} from installed vocabulary carry authored values this gate does not require:`);
  for (const item of deferred) console.log(`      ${item.alias}:${item.tag} id=${item.id}`);
  console.log("  Their Styles, placements and windows are as unauthored-until-checked as a new package's,");
  console.log("  and none of them renders before a Build without a fixture SemanticTrack. They are checked");
  console.log("  against the delivery under playbooks/craft/production-gates.md Gate 3 and Gate 4.");
}

if (unknown.length > 0) {
  console.log("");
  console.log(`  ${unknown.length} logged element name${unknown.length === 1 ? " does" : "s do"} not exist in the Source: ${unknown.join(", ")}`);
  console.log("  A misspelled --element credits nothing; the element it was meant for is still at zero.");
}
if (unlabelled > 0) {
  console.log("");
  console.log(`  ${unlabelled} comparison${unlabelled === 1 ? " was" : "s were"} recorded without --element and cannot be credited to one.`);
}
if (deferred.length > 0) reportDeferred();

if (never.length === 0) {
  console.log("");
  console.log(`reconstruction-check: every locally-drawn element has been compared (${elements.length}).`);
  process.exit(0);
}

console.log("");
console.log(`reconstruction-check: ${never.length} of ${elements.length} elements have never been compared.`);
console.log("");
console.log("Read .claude/skills/hypit/references/reconstruction/reconstruction-loop.md, then for each:");
console.log("render the element to a still in the state the reference shot shows, and compare it blind.");
console.log("");
for (const element of never) {
  console.log(`  hypit-reference-video-tools compare_reconstruction --reference-id ${reference} \\`);
  console.log(`    --shot-id <the shot that shows ${element.id} most clearly> \\`);
  console.log(`    --image <rendered still>.png --element ${element.id}`);
}
process.exit(1);

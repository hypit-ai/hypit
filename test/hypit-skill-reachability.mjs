/**
 * What a reader of the hypit skill can still reach, as a set of sentences.
 *
 * Editing the skill means moving prose between files: a passage two routes both need is written
 * once and linked from both, and a passage filed under one route is moved to a shared file. Every
 * one of those edits is supposed to be invisible to a reader — they follow a link instead of
 * reading on, and arrive at the same words. Checking that the links resolve does not check that.
 * A link resolves perfectly to a file that lost a clause on the way in.
 *
 * So the unit here is the sentence, not the file and not the link. Two runs of `--route` are
 * comparable with `comm`, and a sentence that was reachable before and is not reachable now is a
 * loss wherever it used to live. Which file a sentence sits in is deliberately not part of the
 * key: a move is meant to score as a no-op.
 *
 * One detail decides whether any of this works. The skill's prose is hard-wrapped at about 100
 * columns, so a sentence is routinely split across two lines and any line-based comparison sees
 * two halves rather than one sentence. `grep -rn "never inspected is a system"` finds three files;
 * there are four. That is the failure this tool exists to make impossible, and it is why
 * normalization collapses a paragraph's newlines before it splits on sentence ends.
 *
 *   node test/hypit-skill-reachability.mjs --route reconstruction
 *   node test/hypit-skill-reachability.mjs --at HEAD --route description
 *   node test/hypit-skill-reachability.mjs --links
 *   node test/hypit-skill-reachability.mjs --orphans
 *   node test/hypit-skill-reachability.mjs --restatements [--threshold 0.45]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = ".agents/skills/hypit";

/** A path in one of these is written from the repository root; anything else is relative to its file. */
const rootRelativePrefixes = ["docs/", "examples/", "packages/", "services/", "test/"];

/**
 * Where each route starts reading, and where it stops.
 *
 * Both begin at `SKILL.md`, because that is what routes the task. But `SKILL.md` names both route
 * files, so a traversal that followed every link from it would reach the whole skill twice and the
 * two routes would come back identical — which is exactly the question this tool is asked. Each
 * route therefore refuses to enter the other's directory, and that refusal is the property under
 * test: a passage filed under `reconstruction/` is a passage the description route cannot read,
 * which is the defect the moves in this change are for.
 */
const routes = {
  reconstruction: {
    roots: [`${skillRoot}/SKILL.md`, `${skillRoot}/references/reconstruction/route.md`],
    closed: `${skillRoot}/references/original-authoring/`,
  },
  description: {
    roots: [`${skillRoot}/SKILL.md`, `${skillRoot}/references/original-authoring/route.md`],
    closed: `${skillRoot}/references/reconstruction/`,
  },
};

/**
 * Reads a file as of a commit, or from the working tree when `at` is undefined.
 *
 * Reading the baseline through `git show` rather than from a copy on disk is what keeps the
 * baseline from drifting: there is no second tree to forget to refresh, and the comparison is
 * always against a named commit rather than against whatever was captured at some earlier moment.
 */
function read(path, at) {
  try {
    if (at === undefined) return readFileSync(join(repositoryRoot, path), "utf8");
    // A path that does not exist at that commit is an answer, not an error: `--links` asks exactly
    // that question. `git show` says so on stderr, which would otherwise interleave with the report.
    return execFileSync("git", ["show", `${at}:${path}`], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  } catch {
    return null;
  }
}

/** Every `.md` under the skill, as repository-relative paths. */
function everySkillFile(at) {
  if (at === undefined) {
    const found = [];
    const visit = (directory) => {
      for (const entry of readdirSync(join(repositoryRoot, directory), { withFileTypes: true })) {
        const child = posix.join(directory, entry.name);
        if (entry.isDirectory()) visit(child);
        else if (entry.name.endsWith(".md")) found.push(child);
      }
    };
    visit(skillRoot);
    return found.sort();
  }
  const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", at, "--", skillRoot], { cwd: repositoryRoot, encoding: "utf8", windowsHide: true });
  return listed.split("\n").filter((line) => line.endsWith(".md")).sort();
}

/**
 * Where a backticked path in `from` points.
 *
 * Two conventions are in use and telling them apart is not cosmetic. A path under `docs/`,
 * `packages/`, `services/`, `examples/` or `test/` names a place in the repository; everything else
 * names a file beside the one doing the linking. Resolving both the same way produces a dozen
 * reports of which most are the scanner misreading the convention, and the two real breaks are
 * lost among them.
 */
function resolveLink(from, target) {
  if (rootRelativePrefixes.some((prefix) => target.startsWith(prefix))) return target;
  return posix.normalize(posix.join(posix.dirname(from), target));
}

const linkPattern = /`([^`\n]+\.md)`/g;

/** `packages/<name>/README.md` names the shape of a path, not a path. Angle brackets mark the difference. */
const isTemplate = (target) => target.includes("<");

function linksIn(text, from) {
  const found = new Set();
  for (const match of text.matchAll(linkPattern)) {
    if (isTemplate(match[1])) continue;
    found.add(resolveLink(from, match[1]));
  }
  return [...found];
}

/**
 * The files one route can reach.
 *
 * `playbooks/` is added wholesale rather than followed link by link. `playbooks/index.md` routes to
 * a format by name and a route reads whichever one fits, so which craft files a given run reaches
 * depends on the video rather than on the route. Treating them all as reachable from both routes
 * keeps that choice from showing up as a difference between two runs of this tool.
 */
function reachable(route, at) {
  const { roots, closed } = routes[route];
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const path = queue.shift();
    if (seen.has(path) || path.startsWith(closed)) continue;
    const text = read(path, at);
    if (text === null) continue;
    seen.add(path);
    for (const link of linksIn(text, path)) if (!seen.has(link)) queue.push(link);
  }
  for (const path of everySkillFile(at)) if (path.startsWith(`${skillRoot}/references/playbooks/`)) seen.add(path);
  return [...seen].sort();
}

const fence = /^```/;

/**
 * A fenced block as one comparable unit.
 *
 * The content is kept whole rather than split into sentences — a command is not prose, and a flag
 * that changed is a different command. Only whitespace is collapsed, so a block reflowed across
 * different lines still matches: where the line breaks fall in a shell invocation is layout, and
 * reporting that as a loss would bury the changes that are not.
 */
function flattenBlock(lines) {
  return `code:${lines.join(" ").replace(/\s+/gu, " ").trim()}`;
}

/**
 * A file's comparable units: its fenced blocks whole, and its prose as sentences.
 *
 * A fenced block is compared byte for byte because a command is not prose — a flag that changed is
 * a different command, and splitting one into sentences would compare it on the wrong axis. The
 * prose either side of it is unwrapped first, so a sentence the file broke across two lines is one
 * unit again.
 *
 * Short units are dropped. Below about forty characters the population is headings, table cells and
 * fragments like "One line is enough", which collide across files that have nothing to do with each
 * other and would report a loss every time an unrelated heading was reworded.
 */
function unitsIn(text) {
  const units = [];
  const lines = text.split("\n");
  const prose = [];
  let block = null;

  for (const line of lines) {
    if (fence.test(line)) {
      if (block === null) block = [];
      else { units.push(flattenBlock(block)); block = null; }
      continue;
    }
    if (block !== null) block.push(line);
    else prose.push(line);
  }
  if (block !== null) units.push(flattenBlock(block));

  for (const paragraph of prose.join("\n").split(/\n\s*\n/)) {
    const flat = paragraph
      // A list marker is layout, not content, and it has to come off every line rather than only the
      // first: a bullet list is one paragraph, so after the unwrap the second bullet onward would keep
      // its dash inline and stop matching the same sentence written as prose. Moving a rule out of a
      // list and into a paragraph is exactly the edit this file exists to prove safe.
      .replace(/^[\s>]*(?:[-*+]|#+)\s+/gmu, "")
      .replace(/\s+/gu, " ")                       // the unwrap: a hard-wrapped sentence becomes one string
      .replace(/[`*_]/gu, "")
      .trim();
    if (flat.length === 0) continue;
    for (const sentence of flat.split(/(?<=[.!?])\s+/u)) {
      const unit = sentence.trim().toLowerCase();
      if (unit.length >= 40) units.push(unit);
    }
  }
  return units;
}

function unitsForRoute(route, at) {
  const lines = [];
  for (const path of reachable(route, at)) {
    const text = read(path, at);
    if (text === null) continue;
    // Tab-separated so `cut -f1` isolates the unit. A pipe would not: the prose uses it in tables.
    for (const unit of unitsIn(text)) lines.push(`${unit}\t${path}`);
  }
  return lines;
}

/** Word trigrams, for asking whether two units say the same thing in different words. */
function trigrams(unit) {
  const words = unit.split(/\s+/u).filter((word) => word.length > 0);
  const grams = new Set();
  for (let index = 0; index + 2 < words.length; index += 1) grams.add(words.slice(index, index + 3).join(" "));
  return grams;
}

function jaccard(left, right) {
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Where the same thing is said in more than one place.
 *
 * Identical units are grouped rather than paired. One sentence repeated across nine format files is
 * one thing to look at, not the thirty-six pairs the cross product produces — and at that volume the
 * rewordings, which are the ones worth finding, are buried under the exact repeats.
 *
 * This is a review list and never a gate. Some repetition is deliberate: each format file closes
 * with the same footer pointing back at the always-read craft, and that is the footer doing its job.
 * The output says where to look; whether a given entry should survive is a judgement.
 */
function restatements(at, threshold) {
  const entries = [];
  for (const path of everySkillFile(at)) {
    const text = read(path, at);
    if (text === null) continue;
    for (const unit of unitsIn(text)) {
      if (unit.startsWith("code:")) continue;
      const grams = trigrams(unit);
      if (grams.size >= 4) entries.push({ path, unit, grams });
    }
  }

  const identical = new Map();
  for (const entry of entries) {
    const holders = identical.get(entry.unit) ?? new Set();
    holders.add(entry.path);
    identical.set(entry.unit, holders);
  }
  const repeats = [...identical].filter(([, holders]) => holders.size > 1)
    .map(([unit, holders]) => ({ unit, files: [...holders].sort() }))
    .sort((one, other) => other.files.length - one.files.length);

  // One representative per distinct unit, so a sentence in nine files does not pair with itself.
  const distinct = [...identical.keys()].map((unit) => entries.find((entry) => entry.unit === unit));
  const pairs = [];
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      const score = jaccard(distinct[i].grams, distinct[j].grams);
      if (score >= threshold) pairs.push({ score, a: distinct[i], b: distinct[j] });
    }
  }
  return { repeats, pairs: pairs.sort((one, other) => other.score - one.score) };
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const argv = process.argv.slice(2);
const at = flagValue(argv, "--at");
const route = flagValue(argv, "--route");

if (route !== undefined) {
  if (routes[route] === undefined) throw new Error(`--route must be one of ${Object.keys(routes).join(", ")}`);
  process.stdout.write(`${unitsForRoute(route, at).join("\n")}\n`);
} else if (argv.includes("--links")) {
  // Only a path that resolves to nothing is reported. A path this scanner reads the wrong way round
  // would be reported too, which is what the root-relative rule above is for.
  let broken = 0;
  for (const path of everySkillFile(at)) {
    const text = read(path, at);
    if (text === null) continue;
    for (const match of text.matchAll(linkPattern)) {
      if (isTemplate(match[1])) continue;
      const target = resolveLink(path, match[1]);
      if (read(target, at) === null) { process.stdout.write(`${path}: \`${match[1]}\` -> ${target} does not exist\n`); broken += 1; }
    }
  }
  process.stdout.write(`${broken} broken\n`);
} else if (argv.includes("--orphans")) {
  // A file no route reaches is a file nobody reads. It is the failure a sentence-level diff cannot
  // see: create a new shared file, link it from one route, and the other route silently loses it.
  const reached = new Set([...reachable("reconstruction", at), ...reachable("description", at)]);
  let orphans = 0;
  for (const path of everySkillFile(at)) if (!reached.has(path)) { process.stdout.write(`${path}\n`); orphans += 1; }
  process.stdout.write(`${orphans} orphaned\n`);
} else if (argv.includes("--restatements")) {
  const threshold = Number(flagValue(argv, "--threshold") ?? 0.45);
  const { repeats, pairs } = restatements(at, threshold);
  process.stdout.write("== said identically in more than one file ==\n");
  for (const repeat of repeats) {
    process.stdout.write(`${repeat.files.length} files: ${repeat.unit}\n`);
    for (const file of repeat.files) process.stdout.write(`    ${file}\n`);
  }
  process.stdout.write(`\n== said differently in more than one file (>= ${threshold}) ==\n`);
  for (const pair of pairs) {
    process.stdout.write(`${pair.score.toFixed(2)}\n  ${pair.a.path}: ${pair.a.unit}\n  ${pair.b.path}: ${pair.b.unit}\n`);
  }
  process.stdout.write(`\n${repeats.length} repeated, ${pairs.length} reworded\n`);
} else {
  process.stdout.write("usage: --route <reconstruction|description> | --links | --orphans | --restatements [--threshold N] [--at <commit>]\n");
  process.exit(1);
}

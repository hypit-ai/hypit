import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import puppeteer from "puppeteer-core";

import { authorSource, invokedFrom, realizeAuthoringPreview, repositoryRoot, stageAuthoringPreview } from "./authoring.js";
import { atomicJson } from "./state-files.js";

export type LayoutCheckInput = {
  readonly run: string;
  readonly runtime?: string;
  readonly package_root?: string;
};
export type LayoutAcceptance = { readonly finding: string; readonly reason: string };
export type LayoutAcceptInput = {
  readonly run: string;
  readonly finding?: string;
  readonly reason?: string;
  readonly findings?: readonly LayoutAcceptance[];
};
const LAYOUT_CHECKER_VERSION = 3 as const;

type Bounds = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; readonly width: number; readonly height: number };
type RawFinding = {
  readonly kind: "vertical-offset" | "parent-overflow" | "canvas-overflow" | "peer-overlap";
  readonly layer: "realized_layout";
  readonly track?: string;
  readonly present?: string;
  readonly element: string;
  readonly related?: string;
  readonly frame?: number;
  readonly pixels: number;
  readonly ratio: number;
  readonly bounds?: Bounds;
  readonly related_bounds?: Bounds;
  readonly message: string;
};

type LayoutDecision = {
  readonly finding: string;
  readonly layout_digest: string;
  readonly reason: string;
  readonly accepted_at: string;
};

type LayoutDecisions = { readonly version: 1; readonly decisions: readonly LayoutDecision[] };

function projectRoot(runPath: string): string { return dirname(runPath); }
export function layoutCheckPath(runPath: string): string { return join(projectRoot(runPath), ".hypit", "layout-check.json"); }
export function layoutDecisionsPath(runPath: string): string { return join(projectRoot(runPath), ".hypit", "layout-decisions.json"); }

function hash(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

async function inputDigests(runPath: string, sourcePath: string): Promise<Readonly<Record<string, string>>> {
  const files = new Set<string>([runPath]);
  const queue = [sourcePath];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (files.has(path)) continue;
    files.add(path);
    const source = await readFile(path, "utf8").catch(() => undefined);
    if (source === undefined) continue;
    for (const match of source.matchAll(/<import\s+[^>]*\bsource="([^"]+)"[^>]*\/?\s*>/gu)) {
      queue.push(resolve(dirname(path), match[1]!));
    }
  }
  const root = dirname(runPath);
  for (const name of ["package.json", "pnpm-lock.yaml", "hypit.runtime.json"]) {
    const path = join(root, name);
    if (await stat(path).then((value) => value.isFile(), () => false)) files.add(path);
  }
  const localPackages = join(root, "packages");
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".hypit") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.add(path);
    }
  };
  await visit(localPackages);
  const result: Record<string, string> = {};
  for (const path of [...files].sort()) {
    const bytes = await readFile(path).catch(() => undefined);
    if (bytes !== undefined) result[path] = hash(bytes);
  }
  return result;
}

function round(value: number): number { return Math.round(value * 1000) / 1000; }

async function readDecisions(path: string): Promise<LayoutDecisions> {
  const source = await readFile(path, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (source === undefined) return { version: 1, decisions: [] };
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { throw new Error(`layout decisions at ${path} are invalid JSON; original file was preserved: ${error instanceof Error ? error.message : String(error)}`); }
  const decisions = value as Partial<LayoutDecisions>;
  if (decisions.version !== 1 || !Array.isArray(decisions.decisions)) throw new Error(`layout decisions at ${path} have an unsupported shape`);
  return decisions as LayoutDecisions;
}

function contentType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

export async function serve(directory: string, mediaTypes: ReadonlyMap<string, string>): Promise<{ readonly url: string; close(): Promise<void> }> {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const path = resolve(root, normalize(relative));
    if (path !== root && !path.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
    const info = await stat(path).catch(() => undefined);
    if (info === undefined || !info.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "content-type": mediaTypes.get(relative) ?? contentType(path), "cache-control": "no-store" });
    createReadStream(path).pipe(response);
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => accept());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("layout browser server did not bind a local port");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => await new Promise<void>((accept, reject) => server.close((error) => error === undefined ? accept() : reject(error))),
  };
}

export function browserPath(): string {
  const cli = createRequire(join(repositoryRoot(), "packages/provider-hyperframes-local/package.json"))
    .resolve("hyperframes/bin/hyperframes.mjs");
  const result = spawnSync(process.execPath, [cli, "browser", "path"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  if (result.status !== 0) throw new Error(`cannot resolve the fixed HyperFrames browser: ${(result.stderr ?? "").trim()}`);
  const path = (result.stdout ?? "").trim().split("\n").at(-1)?.trim();
  if (path === undefined || path.length === 0) throw new Error("HyperFrames returned no browser path");
  return path;
}

export type StableSample = {
  readonly frame: number;
  readonly subjects: readonly { readonly track: string; readonly present: string }[];
  readonly overlap_subjects: readonly { readonly track: string; readonly present: string }[];
};

type StableInterval = { readonly track: string; readonly present: string; readonly startFrame: number; readonly endFrameExclusive: number; readonly frame: number };

function stableIntervals(composition: Awaited<ReturnType<typeof realizeAuthoringPreview>>["built"]["composition"]): readonly StableInterval[] {
  const intervals: StableInterval[] = [];
  for (const track of composition.tracks) {
    if (track.kind !== "visual") continue;
    for (const present of track.presents) {
      const duration = present.span.endFrameExclusive - present.span.startFrame;
      const changing = Array.from({ length: duration }, () => false);
      const mark = (start: number, endExclusive: number): void => {
        for (let frame = Math.max(0, Math.floor(start)); frame < Math.min(duration, Math.ceil(endExclusive)); frame += 1) changing[frame] = true;
      };
      const signature = (style: readonly { readonly name: string; readonly value: unknown }[]): string => JSON.stringify(
        [...style].map((item) => [item.name, item.value]).sort(([left], [right]) => String(left).localeCompare(String(right))),
      );
      for (const element of present.elements) {
        const keyframes = element.animation?.keyframes ?? [];
        for (let index = 0; index + 1 < keyframes.length; index += 1) {
          const left = keyframes[index]!;
          const right = keyframes[index + 1]!;
          if (signature(left.style) !== signature(right.style)) mark(left.atFrame, right.atFrame);
        }
        if (element.kind === "text-flow" || element.kind === "path-text") {
          for (const sequence of element.sequences) {
            const units = Math.max(1, sequence.range.endExclusive - sequence.range.start);
            const lastStart = sequence.startFrame + (units - 1) * sequence.staggerFrames;
            const start = Math.min(sequence.startFrame, lastStart);
            const end = Math.max(sequence.startFrame, lastStart) + sequence.unitDurationFrames * sequence.cycles;
            mark(start, end);
          }
        }
        if (element.kind === "path-text" && element.marginAnimation !== undefined) {
          const keyframes = element.marginAnimation.keyframes;
          for (let index = 0; index + 1 < keyframes.length; index += 1) {
            const left = keyframes[index]!;
            const right = keyframes[index + 1]!;
            if (left.startMarginPx !== right.startMarginPx) mark(left.atFrame, right.atFrame);
          }
        }
      }
      let best: { readonly start: number; readonly endExclusive: number } | undefined;
      let start = 0;
      while (start < duration) {
        while (start < duration && changing[start]) start += 1;
        if (start >= duration) break;
        let end = start + 1;
        while (end < duration && !changing[end]) end += 1;
        if (end - start >= 2 && (best === undefined || end - start > best.endExclusive - best.start)) {
          best = { start, endExclusive: end };
        }
        start = end;
      }
      if (best !== undefined) intervals.push({
        track: track.id,
        present: present.id,
        startFrame: present.span.startFrame + best.start,
        endFrameExclusive: present.span.startFrame + best.endExclusive,
        frame: present.span.startFrame + Math.floor((best.start + best.endExclusive - 1) / 2),
      });
    }
  }
  return intervals;
}

/** The middle frame of one Track's longest stable Present interval, with earliest interval winning ties. */
export function stableFrameForTrack(
  composition: Awaited<ReturnType<typeof realizeAuthoringPreview>>["built"]["composition"],
  trackId: string,
): number | undefined {
  return stableIntervals(composition)
    .filter((interval) => interval.track === trackId)
    .sort((left, right) => (right.endFrameExclusive - right.startFrame) - (left.endFrameExclusive - left.startFrame)
      || left.startFrame - right.startFrame || left.present.localeCompare(right.present))[0]?.frame;
}

export function framePlan(composition: Awaited<ReturnType<typeof realizeAuthoringPreview>>["built"]["composition"]): readonly StableSample[] {
  const intervals = stableIntervals(composition);
  const byFrame = new Map<number, { readonly frame: number; readonly subjects: { track: string; present: string }[] }>();
  for (const interval of intervals) {
    const subject = { track: interval.track, present: interval.present };
    const existing = byFrame.get(interval.frame);
    if (existing === undefined) byFrame.set(interval.frame, { frame: interval.frame, subjects: [subject] });
    else existing.subjects.push(subject);
  }
  return [...byFrame.values()]
    .map((sample) => ({
      frame: sample.frame,
      subjects: sample.subjects.sort((left, right) => `${left.track}/${left.present}`.localeCompare(`${right.track}/${right.present}`)),
      overlap_subjects: intervals
        .filter((interval) => sample.frame >= interval.startFrame && sample.frame < interval.endFrameExclusive)
        .map((interval) => ({ track: interval.track, present: interval.present }))
        .sort((left, right) => `${left.track}/${left.present}`.localeCompare(`${right.track}/${right.present}`)),
    }))
    .sort((left, right) => left.frame - right.frame);
}

function packageByTrack(realized: Awaited<ReturnType<typeof realizeAuthoringPreview>>): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const item of realized.built.tracks) {
    const id = (item.value as { readonly id?: unknown } | null)?.id;
    if (typeof id !== "string") continue;
    const packageName = item.trace.module?.name ?? item.typeRef.module.name;
    if (packageName !== undefined) result.set(id, packageName);
  }
  return result;
}

async function realizedFindings(
  realized: Awaited<ReturnType<typeof realizeAuthoringPreview>>,
  stage: string,
  mediaTypes: ReadonlyMap<string, string>,
  samples: readonly StableSample[],
): Promise<RawFinding[]> {
  const local = await serve(stage, mediaTypes);
  const browser = await puppeteer.launch({ executablePath: browserPath(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const findings: RawFinding[] = [];
  try {
    await page.setViewport({ width: realized.built.canvas.width, height: realized.built.canvas.height, deviceScaleFactor: 1 });
    await page.goto(local.url, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate("window.__name = window.__name || ((target) => target)");
    await page.evaluate(() => {
      for (const root of Array.from(document.querySelectorAll("[data-composition-id][data-width][data-height]"))) {
        const width = Number(root.getAttribute("data-width"));
        const height = Number(root.getAttribute("data-height"));
        if (root instanceof HTMLElement && Number.isFinite(width) && Number.isFinite(height)) {
          root.style.width = `${width}px`;
          root.style.height = `${height}px`;
        }
      }
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    const fps = realized.built.frameRate.numerator / realized.built.frameRate.denominator;
    for (const sample of samples) {
      const frame = sample.frame;
      const measured = await page.evaluate(async ({ frame: at, fps: rate, subjects: subjectKeys, overlapSubjects: overlapKeys }: { frame: number; fps: number; subjects: readonly string[]; overlapSubjects: readonly string[] }) => {
        type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
        type Finding = RawFinding;
        const runtime = window as unknown as { __hf?: { seek?: (seconds: number) => unknown }; __player?: { renderSeek?: (seconds: number) => unknown } };
        const seconds = at / rate;
        const seek = runtime.__player?.renderSeek ?? runtime.__hf?.seek;
        if (typeof seek === "function") await seek.call(runtime.__player ?? runtime.__hf, seconds);
        else window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: seconds } }));
        for (const clip of Array.from(document.querySelectorAll(".hypit-visual-present[data-start][data-duration]"))) {
          const start = Number(clip.getAttribute("data-start"));
          const duration = Number(clip.getAttribute("data-duration"));
          (clip as HTMLElement).style.display = seconds >= start && seconds < start + duration ? "" : "none";
        }
        await new Promise<void>((accept) => requestAnimationFrame(() => requestAnimationFrame(() => accept())));
        const box = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
        const visible = (element: Element): element is HTMLElement | SVGElement => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.001 && rect.width > 0 && rect.height > 0;
        };
        const over = (child: Box, parent: Box) => Math.max(parent.left - child.left, parent.top - child.top, child.right - parent.right, child.bottom - parent.bottom, 0);
        const contains = (outer: Box, inner: Box) => outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom;
        const intersection = (a: Box, b: Box): Box | undefined => {
          const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top), right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
          return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : undefined;
        };
        const root = document.querySelector("[data-composition-id]") ?? document.body;
        const canvas = box(root.getBoundingClientRect());
        const result: Finding[] = [];
        const subjects = new Set(subjectKeys);
        const overlapSubjects = new Set(overlapKeys);
        const activePresents = Array.from(document.querySelectorAll("[data-hypit-track-id][data-hypit-present-id]")).filter(visible);
        const keyOf = (present: Element): string => `${present.getAttribute("data-hypit-track-id") ?? "unknown-track"}/${present.getAttribute("data-hypit-present-id") ?? "unknown-present"}`;
        const presents = activePresents.filter((present) => {
          if (!visible(present)) return false;
          return subjects.has(keyOf(present));
        });
        for (const present of presents) {
          const track = present.getAttribute("data-hypit-track-id") ?? "unknown-track";
          const presentId = present.getAttribute("data-hypit-present-id") ?? "unknown-present";
          const elements = Array.from(present.querySelectorAll("[data-hypit-element-id]")).filter(visible);
          for (const element of elements) {
            const id = element.getAttribute("data-hypit-element-id") ?? "unknown-element";
            const elementBox = box(element.getBoundingClientRect());
            const parentElement = element.parentElement?.closest("[data-hypit-element-id]") ?? null;
            const parent: Element = parentElement !== null && parentElement !== element ? parentElement : present;
            const parentBox = box(parent.getBoundingClientRect());
            const overflow = over(elementBox, parentBox);
            if (overflow > 1) result.push({
              kind: "parent-overflow", layer: "realized_layout", track, present: presentId, element: id,
              related: parent.getAttribute("data-hypit-element-id") ?? "present", frame: at,
              pixels: overflow, ratio: overflow / Math.max(1, parentBox.height), bounds: elementBox, related_bounds: parentBox,
              message: "Rendered content extends beyond its direct parent. This is a measured candidate; clipping or motion may be intentional.",
            });
            const canvasOverflow = over(elementBox, canvas);
            if (canvasOverflow > 1) result.push({
              kind: "canvas-overflow", layer: "realized_layout", track, present: presentId, element: id,
              related: "canvas", frame: at, pixels: canvasOverflow, ratio: canvasOverflow / Math.max(1, canvas.height),
              bounds: elementBox, related_bounds: canvas,
              message: "Rendered content extends beyond the Canvas. This is a measured candidate; cropping or off-screen motion may be intentional.",
            });
            let contentBox: Box | undefined;
            let container: Element | undefined;
            let verticalRelated: string | undefined;
            if (element.matches("[data-hypit-text-flow], [data-hypit-text-clock]") || Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) {
              const range = document.createRange();
              range.selectNodeContents(element);
              const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
              if (rects.length > 0) {
                const left = Math.min(...rects.map((rect) => rect.left)), top = Math.min(...rects.map((rect) => rect.top));
                const right = Math.max(...rects.map((rect) => rect.right)), bottom = Math.max(...rects.map((rect) => rect.bottom));
                contentBox = { left, top, right, bottom, width: right - left, height: bottom - top };
                container = element;
                verticalRelated = `${id}:content-box`;
              }
            } else if (parent !== present) {
              contentBox = elementBox;
              container = parent;
              verticalRelated = parent.getAttribute("data-hypit-element-id") ?? "parent";
            }
            if (contentBox !== undefined && container !== undefined) {
              const containerBox = box(container.getBoundingClientRect());
              const style = getComputedStyle(container);
              const contentParent = {
                left: containerBox.left + Number.parseFloat(style.paddingLeft || "0"),
                top: containerBox.top + Number.parseFloat(style.paddingTop || "0"),
                right: containerBox.right - Number.parseFloat(style.paddingRight || "0"),
                bottom: containerBox.bottom - Number.parseFloat(style.paddingBottom || "0"),
                width: 0, height: 0,
              };
              contentParent.width = contentParent.right - contentParent.left;
              contentParent.height = contentParent.bottom - contentParent.top;
              const offset = (contentBox.top + contentBox.bottom - contentParent.top - contentParent.bottom) / 2;
              if (Math.abs(offset) > 1) result.push({
                kind: "vertical-offset", layer: "realized_layout", track, present: presentId, element: id,
                ...(verticalRelated === undefined ? {} : { related: verticalRelated }), frame: at,
                pixels: Math.abs(offset), ratio: Math.abs(offset) / Math.max(1, contentParent.height),
                bounds: contentBox, related_bounds: contentParent,
                message: "Rendered inner content is vertically offset within its measured box. This is a candidate, not proof of a layout error.",
              });
            }
          }
        }
        const roots = activePresents.filter((present) => overlapSubjects.has(keyOf(present))).flatMap((present) => {
          const rootElement = Array.from(present.querySelectorAll("[data-hypit-element-id]")).find((element) => visible(element) && element.parentElement?.closest("[data-hypit-element-id]") === null);
          return rootElement === undefined ? [] : [{
            track: present.getAttribute("data-hypit-track-id") ?? "unknown-track",
            present: present.getAttribute("data-hypit-present-id") ?? "unknown-present",
            element: rootElement.getAttribute("data-hypit-element-id") ?? "unknown-element",
            bounds: box(rootElement.getBoundingClientRect()),
          }];
        });
        for (let first = 0; first < roots.length; first += 1) for (let second = first + 1; second < roots.length; second += 1) {
          const left = roots[first]!, right = roots[second]!;
          if (left.track === right.track || contains(left.bounds, right.bounds) || contains(right.bounds, left.bounds)) continue;
          const shared = intersection(left.bounds, right.bounds);
          if (shared === undefined || shared.width <= 1 || shared.height <= 1) continue;
          const area = shared.width * shared.height;
          result.push({
            kind: "peer-overlap", layer: "realized_layout", track: left.track, present: left.present,
            element: left.element, related: `${right.track}/${right.present}/${right.element}`, frame: at,
            pixels: Math.max(shared.width, shared.height),
            ratio: area / Math.max(1, Math.min(left.bounds.width * left.bounds.height, right.bounds.width * right.bounds.height)),
            bounds: left.bounds, related_bounds: right.bounds,
            message: "Rendered top-level content from independent tracks partially overlaps. This is a candidate; intentional layering remains valid.",
          });
        }
        return result;
      }, {
        frame,
        fps,
        subjects: sample.subjects.map((subject) => `${subject.track}/${subject.present}`),
        overlapSubjects: sample.overlap_subjects.map((subject) => `${subject.track}/${subject.present}`),
      });
      findings.push(...measured);
    }
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    await local.close().catch(() => undefined);
  }
  return findings;
}

function aggregate(findings: readonly RawFinding[]): RawFinding[] {
  const grouped = new Map<string, RawFinding>();
  for (const finding of findings) {
    const key = JSON.stringify([finding.layer, finding.kind, finding.track ?? "", finding.present ?? "", finding.element, finding.related ?? ""]);
    const current = grouped.get(key);
    if (current === undefined || finding.pixels > current.pixels) grouped.set(key, finding);
  }
  return [...grouped.values()].map((finding) => ({ ...finding, pixels: round(finding.pixels), ratio: round(finding.ratio) }));
}

function withIdentity(findings: readonly RawFinding[], digest: string, packages: ReadonlyMap<string, string>, decisions: LayoutDecisions): readonly Record<string, unknown>[] {
  const accepted = new Map(decisions.decisions.filter((item) => item.layout_digest === digest).map((item) => [item.finding, item] as const));
  return findings.map((finding) => {
    const packageName = finding.track === undefined ? undefined : packages.get(finding.track);
    const id = hash([finding.kind, finding.layer, packageName ?? "", finding.track ?? "", finding.present ?? "", finding.element, finding.related ?? "", digest]);
    const decision = accepted.get(id);
    return {
      id, ...finding, ...(packageName === undefined ? {} : { package: packageName }),
      disposition: decision === undefined ? "agent-review-required" : "accepted-intentional",
      ...(decision === undefined ? {} : { acceptance_reason: decision.reason, accepted_at: decision.accepted_at }),
    };
  });
}

export async function layoutCheck(input: LayoutCheckInput): Promise<Record<string, unknown>> {
  const runPath = resolve(invokedFrom(), input.run);
  const source = await authorSource(runPath);
  const inputs = await inputDigests(runPath, source.path);
  const realized = await realizeAuthoringPreview(input);
  const { stage, document, mediaTypes } = await stageAuthoringPreview(realized);
  const digest = hash({
    checker: LAYOUT_CHECKER_VERSION,
    inputs,
    graph: realized.built.source.compiled.graph,
    program: realized.built.source.compiled.program.records,
    composition: realized.built.composition,
    served: [...realized.built.served.keys()].sort(),
  });
  const decisionsPath = layoutDecisionsPath(runPath);
  const decisions = await readDecisions(decisionsPath);
  await atomicJson(decisionsPath, decisions);
  const currentPath = layoutCheckPath(runPath);
  const cached = await readFile(currentPath, "utf8").then((text) => JSON.parse(text) as Record<string, unknown>, () => undefined);
  let raw: RawFinding[];
  let samples: readonly StableSample[];
  if (cached?.layout_digest === digest && Array.isArray(cached.raw_findings) && Array.isArray(cached.samples)) {
    raw = cached.raw_findings as RawFinding[];
    samples = cached.samples as StableSample[];
  } else {
    samples = framePlan(realized.built.composition).filter((sample) => sample.frame < document.frameCount);
    raw = aggregate(await realizedFindings(realized, stage, mediaTypes, samples));
  }
  const findings = withIdentity(raw, digest, packageByTrack(realized), decisions);
  const pending = findings.filter((finding) => finding.disposition === "agent-review-required");
  const result = {
    version: LAYOUT_CHECKER_VERSION,
    run: runPath,
    source: source.path,
    input_digests: inputs,
    layout_digest: digest,
    executed: true,
    settled: pending.length === 0,
    semantics: "candidate-evidence-only",
    note: "Mechanical measurements assist the Agent; they are not findings of fault and never override design intent. Repair a genuine issue or use layout_accept with a reason for intentional geometry.",
    samples,
    raw_findings: raw,
    findings,
    pending_count: pending.length,
    accepted_count: findings.length - pending.length,
    checked_at: new Date().toISOString(),
  };
  await atomicJson(currentPath, result);
  return { ...result, evidence: currentPath, decisions: decisionsPath };
}

export async function layoutAccept(input: LayoutAcceptInput): Promise<Record<string, unknown>> {
  const runPath = resolve(invokedFrom(), input.run);
  const acceptances = input.findings ?? (input.finding === undefined || input.reason === undefined
    ? []
    : [{ finding: input.finding, reason: input.reason }]);
  if (acceptances.length === 0) throw new Error("layout_accept requires --finding/--reason or a non-empty findings batch");
  const reportPath = layoutCheckPath(runPath);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { layout_digest?: unknown; findings?: unknown };
  if (typeof report.layout_digest !== "string" || !Array.isArray(report.findings)) throw new Error(`run layout_check first; ${reportPath} has no usable report`);
  const path = layoutDecisionsPath(runPath);
  const existing = await readDecisions(path);
  const decisions = [...existing.decisions];
  for (const acceptance of acceptances) {
    const reason = acceptance.reason.trim();
    if (reason.length === 0) throw new Error(`layout_accept requires a non-empty reason for ${acceptance.finding}`);
    const finding = report.findings.find((item) => item !== null && typeof item === "object" && (item as { id?: unknown }).id === acceptance.finding);
    if (finding === undefined) throw new Error(`layout report contains no finding ${acceptance.finding}`);
    const decision: LayoutDecision = { finding: acceptance.finding, layout_digest: report.layout_digest, reason, accepted_at: new Date().toISOString() };
    const index = decisions.findIndex((item) => item.finding === decision.finding && item.layout_digest === decision.layout_digest);
    if (index >= 0) decisions.splice(index, 1);
    decisions.push(decision);
  }
  await atomicJson(path, { version: 1, decisions });
  return {
    accepted: true,
    findings: acceptances.map((item) => item.finding),
    layout_digest: report.layout_digest,
    decisions: path,
    next_action: `rerun layout_check --run ${runPath}`,
  };
}

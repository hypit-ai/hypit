import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ArtifactAttachment } from "@hypit/workspace";
import type { CompiledGraph, TypedRecord } from "@hypit/protocol";
import { findMockTargets } from "./graph.js";
import { deriveGeometry } from "./geometry.js";
import { previewRunSource } from "./run-source.js";
import { materializeMockNeed } from "./materialize.js";
import { mockMediaCapabilities } from "@hypit/mock-media";

export type PreviewMockTiming = "estimate";
export type PreviewMockRequest = { readonly run: string; readonly targets?: readonly string[]; readonly timing?: PreviewMockTiming; readonly cacheRoot?: string; readonly graph?: CompiledGraph; readonly records?: readonly TypedRecord[]; readonly author?: string; readonly aliases?: ReadonlyMap<string, string> };
export type PreviewMockResult = { readonly run: string; readonly root: string; readonly previewRun: string; readonly attachments: readonly ArtifactAttachment[]; readonly mocked: readonly { output: string; candidate: string; kind: "image" | "video" | "audio" | "semantic-take" }[]; readonly timingBasis: "estimate" };

export async function realizePreviewMock(input: PreviewMockRequest): Promise<PreviewMockResult> {
  const run = resolve(input.run);
  const source = await readFile(run, "utf8");
  const author = input.author ?? /<author\s+source="([^"]+)"/u.exec(source)?.[1];
  if (author === undefined) throw new Error(`${input.run} declares no author source`);
  if (input.graph === undefined) {
  const root = input.cacheRoot ?? join(dirname(run), ".hypit", "preview", createHash("sha256").update(source).digest("hex").slice(0, 16));
    await mkdir(root, { recursive: true });
    const previewRun = join(root, "preview.svrun");
    await writeFile(previewRun, source, "utf8");
    return { run, root, previewRun, attachments: [], mocked: [], timingBasis: "estimate" };
  }
  const alias = (ref: string): string => input.aliases?.get(ref) ?? ref;
  const rawTargets = findMockTargets(input.graph, input.targets, input.records);
  const targets = rawTargets.map((target) => ({
    ...target,
    output: alias(target.output),
    inputs: Object.fromEntries(Object.entries(target.inputs).map(([name, ref]) => [name, alias(ref)])),
  }));
  const selectedTargets = (input.targets ?? input.graph.outputs.map((item) => item.id)).map(alias);
  const geometry = deriveGeometry(input.graph, rawTargets.map((item) => item.output));
  const authorPath = resolve(dirname(run), author);
  const authorSource = await readFile(authorPath, "utf8");
  const root = input.cacheRoot ?? join(dirname(run), ".hypit", "preview", createHash("sha256")
    .update(JSON.stringify({
      authorDigest: createHash("sha256").update(authorSource).digest("hex"),
      runDigest: createHash("sha256").update(source).digest("hex"),
      targets: rawTargets.map((item) => item.output).sort(),
      geometry,
      timing: input.timing ?? "estimate",
    })).digest("hex").slice(0, 16));
  await mkdir(root, { recursive: true });
  const previewRun = join(root, "preview.svrun");
  const preserved = [...source.matchAll(/^\s*<(?:file|value|build-record)\b[^>]*\/?>\s*$/gmu)]
    .map((match) => (match[0] ?? "").trim())
    .filter((line) => !/from="\//u.test(line));
  const generated = previewRunSource(resolve(dirname(run), author), previewRun, selectedTargets, geometry, targets);
  const mockedOutputs = new Set(targets.map((item) => item.output));
  const carriedSatisfactions = [...source.matchAll(/^\s*<satisfy\s+output="([^"]+)"[^>]*\/?>\s*$/gmu)]
    .filter((match) => !mockedOutputs.has(match[1] ?? ""))
    .map((match) => `  ${(match[0] ?? "").trim()}`);
  const withCarried = generated.replace("</svrun>", `${carriedSatisfactions.join("\n")}\n</svrun>`);
  const carried = preserved.map((line) => `  ${line}`).join("\n");
  await writeFile(previewRun, withCarried.replace("  <target", `${carried}${carried.length === 0 ? "" : "\n"}  <target`), "utf8");
  const attachments: ArtifactAttachment[] = [];
  const attached = new Set<string>();
  for (const target of targets) {
    if (target.kind === "semantic-take") continue;
    const capability = target.kind === "image" ? mockMediaCapabilities.image
      : target.kind === "video" ? mockMediaCapabilities.video : mockMediaCapabilities.silence;
    const constraints = target.kind === "image"
      ? { width: geometry.width, height: geometry.height, color: "#9AA0A6" }
      : target.kind === "video"
        ? { width: geometry.width, height: geometry.height, frameRate: { numerator: 30, denominator: 1 }, frameCount: 30, color: "#9AA0A6", audio: "silence" }
        : { sampleRate: 48_000, channels: 2, sampleFrames: 48_000 };
    const materialized = await materializeMockNeed({ capability, constraints });
    if (!attached.has(materialized.artifact.digest)) {
      attached.add(materialized.artifact.digest);
      attachments.push(materialized.attachment);
    }
  }
  return { run, root, previewRun, attachments, mocked: targets.map((item, index) => ({ output: item.output, candidate: `mock-${index}.${item.kind === "audio" ? "audio" : item.kind}`, kind: item.kind })), timingBasis: "estimate" };
}

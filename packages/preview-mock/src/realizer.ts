import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ArtifactAttachment } from "@hypit/workspace";
import type { CompiledGraph, TypedRecord } from "@hypit/protocol";
import { findMockTargets } from "./graph.js";
import { deriveGeometry } from "./geometry.js";
import { previewRunSource } from "./run-source.js";
import { materializeMockNeed } from "./materialize.js";
import { mockMediaCapabilities } from "@hypit/mock-media";
import { FileArtifactStore } from "@hypit/artifact-store-fs";

export type PreviewMockTiming = "estimate";
export type PreviewMockRequest = { readonly run: string; readonly targets?: readonly string[]; readonly timing?: PreviewMockTiming; readonly cacheRoot?: string; readonly graph?: CompiledGraph; readonly records?: readonly TypedRecord[]; readonly author?: string; readonly aliases?: ReadonlyMap<string, string> };
export type PreviewMockResult = {
  readonly run: string;
  readonly root: string;
  /** The persisted Run containing the native mock fragments. */
  readonly mockRun: string;
  /** The persisted Run consumed by Studio; its mock outputs are file Candidates. */
  readonly previewRun: string;
  readonly attachments: readonly ArtifactAttachment[];
  readonly mocked: readonly { output: string; candidate: string; kind: "image" | "video" | "audio" | "semantic-take" }[];
  readonly timingBasis: "estimate";
};

function artifactRelativePath(root: string, digest: string): string {
  return `./artifacts/sha256/${digest.split(":")[1]!.slice(0, 2)}/${digest.split(":")[1]!}`;
}

export async function realizePreviewMock(input: PreviewMockRequest): Promise<PreviewMockResult> {
  const run = resolve(input.run);
  const source = await readFile(run, "utf8");
  const author = input.author ?? /<author\s+source="([^"]+)"/u.exec(source)?.[1];
  if (author === undefined) throw new Error(`${input.run} declares no author source`);
  if (input.graph === undefined) {
  const root = input.cacheRoot ?? join(dirname(run), ".hypit", "preview", createHash("sha256").update(source).digest("hex").slice(0, 16));
    await mkdir(root, { recursive: true });
    const previewRun = join(root, "preview.svrun");
    const mockRun = join(root, "mock.svrun");
    await writeFile(previewRun, source, "utf8");
    await writeFile(mockRun, source, "utf8");
    return { run, root, mockRun, previewRun, attachments: [], mocked: [], timingBasis: "estimate" };
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
  const mockRun = join(root, "mock.svrun");
  const artifactStore = new FileArtifactStore(join(root, "artifacts"));
  const preserved = [...source.matchAll(/^\s*<(?:file|value|build-record)\b[^>]*\/?>(?:\s*)$/gmu)]
    .map((match) => (match[0] ?? "").trim())
    .map((line) => line.replace(/\bfrom="([^"]+)"/u, (_whole, from: string) => {
      // Rebase carried Run assets against the temporary Run directory.  The
      // generated source never contains an absolute Candidate path, even when
      // the original Run used one.
      const absolute = resolve(dirname(run), from);
      const relativePath = relative(root, absolute).replaceAll("\\", "/");
      return `from="${relativePath.startsWith(".") ? relativePath : `./${relativePath}`}"`;
    }));
  // Keep the native mock Run as a durable audit/debug artifact.  Its Needs are
  // fulfilled by the local mock Provider below; Studio then opens the second
  // Run, whose relative file Candidates point at those content-addressed
  // results and therefore require no Provider endpoint.
  const generatedMock = previewRunSource(resolve(dirname(run), author), mockRun, selectedTargets, geometry, targets);
  await writeFile(mockRun, generatedMock, "utf8");
  const mockedOutputs = new Set(targets.map((item) => item.output));
  const carriedSatisfactions = [...source.matchAll(/^\s*<satisfy\s+output="([^"]+)"[^>]*\/?>\s*$/gmu)]
    .filter((match) => !mockedOutputs.has(match[1] ?? ""))
    .map((match) => `  ${(match[0] ?? "").trim()}`);
  const attachments: ArtifactAttachment[] = [];
  const attached = new Set<string>();
  const files = new Map<string, { readonly id: string; readonly from: string; readonly mediaType: string }>();
  for (const target of targets) {
    if (target.kind === "semantic-take") continue;
    const capability = target.kind === "image" ? mockMediaCapabilities.image
      : target.kind === "video" ? mockMediaCapabilities.video : mockMediaCapabilities.silence;
    const constraints = target.kind === "image"
      ? { width: geometry.width, height: geometry.height, color: "#9AA0A6" }
      : target.kind === "video"
        // A mock video needs enough frames for the estimate-timed SemanticTake
        // to place every token.  The real duration remains owned by the graph;
        // this conservative preview domain avoids squeezing long Scripts into
        // the old 30-frame placeholder.
        ? { width: geometry.width, height: geometry.height, frameRate: { numerator: 30, denominator: 1 }, frameCount: 300, color: "#9AA0A6", audio: "silence" }
        : { sampleRate: 48_000, channels: 2, sampleFrames: 48_000 };
    const materialized = await materializeMockNeed({ capability, constraints, artifacts: artifactStore });
    if (!attached.has(materialized.artifact.digest)) {
      attached.add(materialized.artifact.digest);
      attachments.push(materialized.attachment);
    }
    const candidateId = `mock-file-${files.size}`;
    files.set(target.output, {
      id: candidateId,
      from: artifactRelativePath(root, materialized.artifact.digest),
      mediaType: materialized.artifact.mediaType,
    });
  }
  const generated = previewRunSource(resolve(dirname(run), author), previewRun, selectedTargets, geometry, targets, files);
  const withCarried = generated.replace("</svrun>", `${carriedSatisfactions.join("\n")}\n</svrun>`);
  const carried = preserved.map((line) => `  ${line}`).join("\n");
  await writeFile(previewRun, withCarried.replace("  <target", `${carried}${carried.length === 0 ? "" : "\n"}  <target`), "utf8");
  return {
    run, root, mockRun, previewRun, attachments,
    mocked: targets.map((item, index) => ({
      output: item.output,
      candidate: files.get(item.output)?.id ?? `mock-${index}.${item.kind === "audio" ? "audio" : item.kind}`,
      kind: item.kind,
    })),
    timingBasis: "estimate",
  };
}

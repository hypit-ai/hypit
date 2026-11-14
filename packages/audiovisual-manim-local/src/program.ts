import { assertSignalOperatorProgram, type SignalOperatorProgram } from "@hypit/audiovisual";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";

export const manimSceneFormat = "hypit.manim-scene@1";

export type ManimSceneFile = {
  readonly path: string;
  readonly artifact: BlobRef;
};

export type ManimSceneProgram = {
  readonly scene: string;
  readonly entry: string;
  readonly files: readonly ManimSceneFile[];
};

export type ManimPictureSource = {
  readonly source: string;
  readonly output: string;
  readonly program: SignalOperatorProgram;
};

export type ManimPictureSourceSet = {
  readonly sources: readonly ManimPictureSource[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function relativePath(value: unknown, label: string): string {
  assert(typeof value === "string" && value.length > 0 && !value.includes("\\") && !value.startsWith("/")
    && value.split("/").every((part) => part.length > 0 && part !== "." && part !== ".."),
  `${label} is not a portable relative path.`);
  return value;
}

export function manimSceneProgram(value: ManimSceneProgram): SignalOperatorProgram {
  assert(/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value.scene), "Manim Scene class is invalid.");
  const paths = new Set<string>();
  const files = value.files.map((file, index) => {
    const path = relativePath(file.path, `Manim Scene file ${index + 1}`);
    assert(!paths.has(path), `Manim Scene repeats file ${path}.`);
    paths.add(path);
    return { path, artifact: index };
  });
  const entry = relativePath(value.entry, "Manim Scene entry");
  assert(paths.has(entry), `Manim Scene entry ${entry} is not one of its files.`);
  return {
    format: manimSceneFormat,
    payload: { scene: value.scene, entry, files } as unknown as { readonly [key: string]: CanonicalValue },
    artifacts: value.files.map((file) => structuredClone(file.artifact)),
  };
}

export function readManimSceneProgram(value: SignalOperatorProgram): ManimSceneProgram {
  assertSignalOperatorProgram(value, "Manim Scene programme");
  assert(value.format === manimSceneFormat, `Unsupported Manim Scene format ${value.format}.`);
  const payload = value.payload as Record<string, unknown>;
  assert(typeof payload.scene === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(payload.scene),
    "Manim Scene class is invalid.");
  const entry = relativePath(payload.entry, "Manim Scene entry");
  assert(Array.isArray(payload.files) && payload.files.length > 0, "Manim Scene has no files.");
  const paths = new Set<string>();
  const files = payload.files.map((candidate, index): ManimSceneFile => {
    assert(candidate !== null && typeof candidate === "object" && !Array.isArray(candidate),
      `Manim Scene file ${index + 1} is invalid.`);
    const item = candidate as Record<string, unknown>;
    const path = relativePath(item.path, `Manim Scene file ${index + 1}`);
    assert(!paths.has(path), `Manim Scene repeats file ${path}.`);
    paths.add(path);
    assert(Number.isSafeInteger(item.artifact) && (item.artifact as number) >= 0
      && (item.artifact as number) < value.artifacts.length,
    `Manim Scene file ${path} has an invalid Artifact index.`);
    return { path, artifact: structuredClone(value.artifacts[item.artifact as number]!) };
  });
  assert(paths.has(entry), `Manim Scene entry ${entry} is not one of its files.`);
  return { scene: payload.scene, entry, files };
}

export function assertManimPictureSourceSet(value: ManimPictureSourceSet): void {
  assert(Array.isArray(value.sources), "Manim Picture Source set is invalid.");
  const keys = new Set<string>();
  for (const source of value.sources) {
    assert(typeof source.source === "string" && source.source.length > 0,
      "Manim Picture Source identity is empty.");
    assert(typeof source.output === "string" && source.output.length > 0,
      "Manim Picture Source output is empty.");
    readManimSceneProgram(source.program);
    const key = `${source.source}\u0000${source.output}`;
    assert(!keys.has(key), `Manim Picture Source ${source.source}.${source.output} is implemented more than once.`);
    keys.add(key);
  }
}

export function resolveManimPictureSource(
  set: ManimPictureSourceSet,
  source: string,
  output: string,
): ManimSceneProgram {
  assertManimPictureSourceSet(set);
  const matches = set.sources.filter((value) => value.source === source && value.output === output);
  assert(matches.length === 1,
    `Manim Picture Source ${source}.${output} has ${matches.length} implementations.`);
  return readManimSceneProgram(matches[0]!.program);
}

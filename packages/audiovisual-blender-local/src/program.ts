import { assertSignalOperatorProgram, type SignalOperatorProgram } from "@hypit/audiovisual";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";

export const blenderSceneFormat = "hypit.blender-python-scene@1";

export type BlenderSceneFile = {
  readonly path: string;
  readonly artifact: BlobRef;
};

/** A frame-independent Blender Python scene; simulations must use another implementation contract. */
export type BlenderSceneProgram = {
  readonly entry: string;
  readonly files: readonly BlenderSceneFile[];
};

export type BlenderPictureSource = {
  readonly source: string;
  readonly output: string;
  readonly program: SignalOperatorProgram;
};

export type BlenderPictureSourceSet = {
  readonly sources: readonly BlenderPictureSource[];
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

export function blenderSceneProgram(value: BlenderSceneProgram): SignalOperatorProgram {
  const paths = new Set<string>();
  const files = value.files.map((file, index) => {
    const path = relativePath(file.path, `Blender Scene file ${index + 1}`);
    assert(!paths.has(path), `Blender Scene repeats file ${path}.`);
    paths.add(path);
    return { path, artifact: index };
  });
  const entry = relativePath(value.entry, "Blender Scene entry");
  assert(paths.has(entry), `Blender Scene entry ${entry} is not one of its files.`);
  return {
    format: blenderSceneFormat,
    payload: { evaluation: "frame-independent", entry, files } as unknown as {
      readonly [key: string]: CanonicalValue;
    },
    artifacts: value.files.map((file) => structuredClone(file.artifact)),
  };
}

export function readBlenderSceneProgram(value: SignalOperatorProgram): BlenderSceneProgram {
  assertSignalOperatorProgram(value, "Blender Scene programme");
  assert(value.format === blenderSceneFormat, `Unsupported Blender Scene format ${value.format}.`);
  const payload = value.payload as Record<string, unknown>;
  assert(payload.evaluation === "frame-independent",
    "Blender Scene programme does not declare frame-independent evaluation.");
  const entry = relativePath(payload.entry, "Blender Scene entry");
  assert(Array.isArray(payload.files) && payload.files.length > 0, "Blender Scene has no files.");
  const paths = new Set<string>();
  const files = payload.files.map((candidate, index): BlenderSceneFile => {
    assert(candidate !== null && typeof candidate === "object" && !Array.isArray(candidate),
      `Blender Scene file ${index + 1} is invalid.`);
    const item = candidate as Record<string, unknown>;
    const path = relativePath(item.path, `Blender Scene file ${index + 1}`);
    assert(!paths.has(path), `Blender Scene repeats file ${path}.`);
    paths.add(path);
    assert(Number.isSafeInteger(item.artifact) && (item.artifact as number) >= 0
      && (item.artifact as number) < value.artifacts.length,
    `Blender Scene file ${path} has an invalid Artifact index.`);
    return { path, artifact: structuredClone(value.artifacts[item.artifact as number]!) };
  });
  assert(paths.has(entry), `Blender Scene entry ${entry} is not one of its files.`);
  return { entry, files };
}

export function assertBlenderPictureSourceSet(value: BlenderPictureSourceSet): void {
  assert(Array.isArray(value.sources), "Blender Picture Source set is invalid.");
  const keys = new Set<string>();
  for (const source of value.sources) {
    assert(typeof source.source === "string" && source.source.length > 0,
      "Blender Picture Source identity is empty.");
    assert(typeof source.output === "string" && source.output.length > 0,
      "Blender Picture Source output is empty.");
    readBlenderSceneProgram(source.program);
    const key = `${source.source}\u0000${source.output}`;
    assert(!keys.has(key), `Blender Picture Source ${source.source}.${source.output} is implemented more than once.`);
    keys.add(key);
  }
}

export function resolveBlenderPictureSource(
  set: BlenderPictureSourceSet,
  source: string,
  output: string,
): BlenderSceneProgram {
  assertBlenderPictureSourceSet(set);
  const matches = set.sources.filter((value) => value.source === source && value.output === output);
  assert(matches.length === 1,
    `Blender Picture Source ${source}.${output} has ${matches.length} implementations.`);
  return readBlenderSceneProgram(matches[0]!.program);
}

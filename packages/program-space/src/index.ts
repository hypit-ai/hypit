import { digestOf } from "@narratage/protocol";
import type { ModuleManifest, TypeRef, ValueSchema } from "@narratage/protocol";

export type ProgramSpace = {
  readonly contract: "svml.program-space@1";
  readonly durationSec: number;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
};

export const programSpaceModuleRef = { name: "@narratage/program-space", version: "1" } as const;
export const programSpaceTypes = {
  programSpace: { module: programSpaceModuleRef, name: "ProgramSpace" },
} satisfies Record<string, TypeRef>;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
export const programSpaceSchema: ValueSchema = {
  kind: "object",
  fields: {
    contract: { schema: { kind: "literal", value: "svml.program-space@1" } },
    durationSec: { schema: number },
    frameRate: { schema: { kind: "object", fields: {
      numerator: { schema: integer }, denominator: { schema: integer },
    } } },
  },
};
export const programSpaceManifest: ModuleManifest = {
  format: "svml.module@1", name: programSpaceModuleRef.name, version: programSpaceModuleRef.version,
  dependencies: [], types: [{ name: programSpaceTypes.programSpace.name, schema: programSpaceSchema }],
  capabilities: [], surfaces: [], producers: [],
};
export const programSpaceManifestDigest = digestOf(programSpaceManifest);
export const programSpaceDependency = { module: programSpaceModuleRef, digest: programSpaceManifestDigest } as const;

export function sealProgramSpace(value: ProgramSpace): ProgramSpace { return structuredClone(value); }
export function programSpaceFrameCount(programSpace: ProgramSpace): number {
  const frames = programSpace.durationSec * programSpace.frameRate.numerator / programSpace.frameRate.denominator;
  const rounded = Math.round(frames);
  if (!Number.isSafeInteger(rounded) || rounded < 1 || Math.abs(frames - rounded) > 1e-7) {
    throw new Error("ProgramSpace duration must end on an exact frame boundary.");
  }
  return rounded;
}
export function programSpaceSampleFrames(programSpace: ProgramSpace, sampleRate: number): number {
  const frames = programSpaceFrameCount(programSpace);
  return programFrameSampleBoundary(programSpace, frames, sampleRate);
}
export function programFrameSampleBoundary(
  programSpace: ProgramSpace,
  frame: number,
  sampleRate: number,
): number {
  const frames = programSpaceFrameCount(programSpace);
  if (!Number.isSafeInteger(frame) || frame < 0 || frame > frames) {
    throw new Error("ProgramSpace frame boundary is invalid.");
  }
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) throw new Error("ProgramSpace sample rate is invalid.");
  const numerator = BigInt(frame) * BigInt(sampleRate) * BigInt(programSpace.frameRate.denominator);
  const denominator = BigInt(programSpace.frameRate.numerator);
  const value = (numerator * 2n + denominator) / (denominator * 2n);
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ProgramSpace sample domain exceeds safe arithmetic.");
  return Number(value);
}
export function assertProgramSpaceIdentity(programSpace: ProgramSpace): void {
  if (programSpace.contract !== "svml.program-space@1") throw new Error("Unsupported ProgramSpace contract.");
  const { numerator, denominator } = programSpace.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator)
    || denominator <= 0 || !Number.isFinite(programSpace.durationSec) || programSpace.durationSec <= 0) {
    throw new Error("ProgramSpace is invalid.");
  }
  programSpaceFrameCount(programSpace);
}

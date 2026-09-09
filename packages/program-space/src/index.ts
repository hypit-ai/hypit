import type { ModuleManifest, TypeRef, ValueSchema } from "@hypit/protocol";

export type ProgramClock = {
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
};

export type ProgramSpace = {
  /** Author-visible identity of this film time axis. */
  readonly id: string;
  readonly durationSec: number;
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
};

export const programSpaceModuleRef = { name: "@hypit/program-space", version: "1" } as const;
export const programSpaceTypes = {
  programSpace: { module: programSpaceModuleRef, name: "ProgramSpace" },
  clock: { module: programSpaceModuleRef, name: "ProgramClock" },
} satisfies Record<string, TypeRef>;
const number = { kind: "number", minimum: 0 } as const;
const integer = { kind: "number", integer: true, minimum: 0 } as const;
const string = { kind: "string", minLength: 1 } as const;
export const programSpaceSchema: ValueSchema = {
  kind: "object",
  fields: {
    id: { schema: string },
    durationSec: { schema: number },
    frameRate: { schema: { kind: "object", fields: {
      numerator: { schema: integer }, denominator: { schema: integer },
    } } },
  },
};
export const programSpaceManifest: ModuleManifest = {
  format: "hypit.module@1", name: programSpaceModuleRef.name, version: programSpaceModuleRef.version,
  dependencies: [], types: [
    { name: programSpaceTypes.programSpace.name },
    { name: programSpaceTypes.clock.name },
  ],
  capabilities: [], producers: [],
};
export const programSpaceDependency = { module: programSpaceModuleRef } as const;
export const programSpaceMarkupSurfaces = [
  { name: "clock", tag: "Clock", mode: "structured", outputs: [programSpaceTypes.clock] },
  { name: "space", tag: "Space", mode: "structured", outputs: [programSpaceTypes.programSpace],
    vocabulary: {
      summary: "Declares a film's frame rate and authored duration, for animation whose timing is directed without a performance.",
      attributes: [
        { name: "id", kind: "identifier", required: true, summary: "Names the shared film time axis." },
        { name: "frame-rate", kind: "literal", required: true, summary: "Frames per second, such as 30 or 30000/1001." },
        { name: "duration", kind: "literal", required: true, summary: "Total duration in seconds, milliseconds or frames, such as 8s or 240f; ends on a frame boundary." },
      ],
      example: '<time:Space id="animation" frame-rate="30" duration="8s"/>',
    },
  },
] as const;

export function sealProgramClock(value: ProgramClock): ProgramClock {
  assertProgramClockIdentity(value);
  return structuredClone(value);
}

export function assertProgramClockIdentity(clock: ProgramClock): void {
  const { numerator, denominator } = clock.frameRate;
  if (!Number.isSafeInteger(numerator) || numerator <= 0
    || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("ProgramClock is invalid.");
  }
}

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
  const { numerator, denominator } = programSpace.frameRate;
  if (!programSpace.id.trim()
    || !Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator)
    || denominator <= 0 || !Number.isFinite(programSpace.durationSec) || programSpace.durationSec <= 0) {
    throw new Error("ProgramSpace is invalid.");
  }
  programSpaceFrameCount(programSpace);
}

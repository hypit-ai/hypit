import { artifactTypes } from "@hypit/artifact";
import { sealGraphFragment } from "@hypit/elaborator";
import type { GenerationPortTable, GenerationRequestDraft } from "@hypit/generation";
import { assertProgramClockIdentity, programSpaceTypes } from "@hypit/program-space";
import type { ProgramClock } from "@hypit/program-space";
import type { ModuleRef, ProducerRef, TypeRef } from "@hypit/protocol";
import { sealStandInCardRequest, standInCapabilities } from "@hypit/stand-in";
import type { StandInCardRequest } from "@hypit/stand-in";
import { textTypes } from "@hypit/text";
import type { Text } from "@hypit/text";

/**
 * A stand-in for an exact model's output is derived from that model's own request draft: the
 * frame from its resolution and aspect ports, the duration from its duration port, the model from
 * its port table, the prompt from the same Text edge the model would read. Nothing is restated by
 * hand, so the card follows the Source. What cannot be derived is refused with the reason.
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** How many pixels a resolution token names, and on which side. */
const RESOLUTIONS: Readonly<Record<string, { readonly pixels: number; readonly side: "shorter" | "longer" }>> = {
  "480p": { pixels: 480, side: "shorter" },
  "720p": { pixels: 720, side: "shorter" },
  "1080p": { pixels: 1080, side: "shorter" },
  "4k": { pixels: 2160, side: "shorter" },
  "1K": { pixels: 1024, side: "longer" },
  "2K": { pixels: 2048, side: "longer" },
  "4K": { pixels: 4096, side: "longer" },
};

function single(draft: GenerationRequestDraft, port: string): string | number | boolean | undefined {
  const values = draft.ports[port];
  if (values === undefined || values.length === 0) return undefined;
  const value = values[0];
  return typeof value === "object" ? undefined : value;
}

function even(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function standInFrameFromDraft(ports: GenerationPortTable, draft: GenerationRequestDraft): { readonly width: number; readonly height: number } {
  const size = single(draft, "size");
  if (typeof size === "string") {
    const match = /^(\d+)\s*[xX×]\s*(\d+)$/u.exec(size.trim());
    assert(match !== null, `${ports.model} size port "${size}" is not WIDTHxHEIGHT; no stand-in frame can be derived`);
    return { width: even(Number(match[1])), height: even(Number(match[2])) };
  }
  const resolution = single(draft, "resolution");
  assert(typeof resolution === "string" && RESOLUTIONS[resolution] !== undefined,
    `${ports.model} names no resolution a stand-in understands (${String(resolution)}); the card cannot know its frame`);
  const aspect = single(draft, "aspectRatio");
  let ratio: { readonly w: number; readonly h: number };
  if (typeof aspect === "string") {
    const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/u.exec(aspect.trim());
    assert(match !== null, `${ports.model} aspectRatio "${aspect}" is not W:H; no stand-in frame can be derived`);
    ratio = { w: Number(match[1]), h: Number(match[2]) };
  } else {
    assert(ports.result === "image", `${ports.model} declares no aspect ratio; a video stand-in cannot guess its frame`);
    ratio = { w: 1, h: 1 };
  }
  const { pixels, side } = RESOLUTIONS[resolution]!;
  const portrait = ratio.h > ratio.w;
  const fixShorter = side === "shorter";
  // The named pixel count lands on the shorter side (480p, 720p…) or the longer side (1K, 2K…).
  const widthIsFixed = fixShorter ? portrait : !portrait;
  return widthIsFixed
    ? { width: even(pixels), height: even(pixels * ratio.h / ratio.w) }
    : { width: even(pixels * ratio.w / ratio.h), height: even(pixels) };
}

export function standInCardRequestFromDraft(args: {
  readonly ports: GenerationPortTable;
  readonly draft: GenerationRequestDraft;
  readonly prompt: Text;
  readonly clock?: ProgramClock;
}): StandInCardRequest {
  const { ports, draft } = args;
  assert(ports.result !== "audio", `${ports.model} produces audio; a stand-in card is a picture`);
  const frame = standInFrameFromDraft(ports, draft);
  const base = { ...frame, model: ports.model, prompt: args.prompt.value };
  if (ports.result === "image") return sealStandInCardRequest({ kind: "image", ...base });
  const clock = args.clock;
  assert(clock !== undefined, `a video stand-in for ${ports.model} needs the piece's clock`);
  assertProgramClockIdentity(clock);
  const duration = single(draft, "duration");
  assert(typeof duration === "number" && Number.isFinite(duration) && duration > 0,
    `${ports.model} has no fixed duration (${String(duration)}); write the seconds, an automatic duration has no stand-in`);
  const frameCount = Math.round(duration * clock.frameRate.numerator / clock.frameRate.denominator);
  assert(Number.isSafeInteger(frameCount) && frameCount > 0, `${ports.model} duration yields no frames on this clock`);
  const audio = single(draft, "generateAudio") === true;
  return sealStandInCardRequest({ kind: "video", ...base, video: { frameRate: clock.frameRate, frameCount, ...(audio ? { audio: "silence" as const } : {}) } });
}

export type ExactModelStandIn = {
  readonly producer: ProducerRef;
  readonly fragment: ReturnType<typeof sealGraphFragment>;
  /** The export name a Run satisfies with: `image` or `video`, the Blob the model would have made. */
  readonly output: "image" | "video";
  readonly inputs: readonly { readonly name: string; readonly type: TypeRef }[];
};

/** The stand-in shape for one endpoint, or none for a model whose output is not a picture. */
export function exactModelStandIn(args: {
  readonly module: ModuleRef;
  readonly producerName: string;
  readonly draftType: TypeRef;
  readonly ports: GenerationPortTable;
}): ExactModelStandIn | undefined {
  if (args.ports.result === "audio") return undefined;
  const video = args.ports.result === "video";
  const producer = { module: args.module, name: `stand-in-${args.producerName}` };
  const inputs = [
    { name: "draft", type: args.draftType },
    { name: "prompt", type: textTypes.text },
    ...(video ? [{ name: "clock", type: programSpaceTypes.clock }] : []),
  ];
  const fragment = sealGraphFragment({
    inputs,
    operations: [{
      id: "card",
      producer,
      inputs: Object.fromEntries(inputs.map((input) => [input.name, { kind: "fragment-input" as const, name: input.name }])),
      result: { kind: "need", name: "card" },
    }],
    exports: [{
      name: video ? "video" : "image",
      type: artifactTypes.blob,
      root: { kind: "fragment-operation", operation: "card" },
    }],
  });
  return { producer, fragment, output: video ? "video" : "image", inputs };
}

export const standInNeed = { name: "card", capability: standInCapabilities.drawCard, returns: artifactTypes.blob } as const;

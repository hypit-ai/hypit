import { assertProgramSource, pictureType } from "@hypit/audiovisual";
import type { ProgramSource } from "@hypit/audiovisual";
import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import {
  assertExactTemporalValue,
  compareExactTemporalValues,
  exactTemporalZero,
  sealLocalTemporalDomain,
} from "@hypit/temporal/algebra";
import type { ExactTemporalValue } from "@hypit/temporal/algebra";

export type TitleCardSpec = {
  readonly id: string;
  readonly duration: ExactTemporalValue;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle: string;
  readonly background: string;
  readonly foreground: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertTitleCardSpec(value: TitleCardSpec): void {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "TitleCardSpec must be an object.");
  assert(/^[A-Za-z][A-Za-z0-9_.:#-]{0,191}$/u.test(value.id), "TitleCardSpec id is invalid.");
  assertExactTemporalValue(value.duration, "TitleCardSpec.duration");
  assert(compareExactTemporalValues(value.duration, exactTemporalZero()) > 0,
    "TitleCardSpec duration must be positive.");
  assert(Number.isSafeInteger(value.width) && value.width > 0
    && Number.isSafeInteger(value.height) && value.height > 0,
  "TitleCardSpec dimensions are invalid.");
  assert(value.title.trim().length > 0, "TitleCardSpec title is empty.");
  assert(value.subtitle.trim().length > 0, "TitleCardSpec subtitle is empty.");
  assert(/^#[0-9a-f]{6}$/iu.test(value.background), "TitleCardSpec background is invalid.");
  assert(/^#[0-9a-f]{6}$/iu.test(value.foreground), "TitleCardSpec foreground is invalid.");
}

/** Public finite signal facts; no DOM or terminal implementation enters the ProgramSource. */
export function titleCardProgramSource(spec: TitleCardSpec): ProgramSource {
  assertTitleCardSpec(spec);
  const source: ProgramSource = {
    id: spec.id,
    outputs: {
      picture: {
        kind: "signal",
        type: pictureType,
        domain: sealLocalTemporalDomain({ id: `${spec.id}:time`, duration: spec.duration }),
        spatialDomain: sealLocalSpatialDomain({
          id: `${spec.id}:picture-space`,
          region: { x: 0, y: 0, width: spec.width, height: spec.height },
        }),
      },
    },
  };
  assertProgramSource(source);
  return structuredClone(source);
}

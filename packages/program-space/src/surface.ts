import {
  assertEmptyElement as empty,
  textAttribute as text,
  type StructuredElement,
  type StructuredSurfaceHandler,
} from "@hypit/markup";

import { assertProgramSpaceIdentity, programSpaceTypes, sealProgramClock, type ProgramClock } from "./index.js";

function frameRate(element: StructuredElement): ProgramClock["frameRate"] {
  const value = text(element, "frame-rate");
  const match = /^(\d+)(?:\/(\d+))?$/u.exec(value);
  if (match === null) throw new Error(`${element.name}.frame-rate must be a positive rational such as 30 or 30000/1001.`);
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? "1");
  if (!Number.isSafeInteger(numerator) || numerator < 1
    || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw new Error(`${element.name}.frame-rate is invalid.`);
  }
  return { numerator, denominator };
}

export const decodeClockSurface: StructuredSurfaceHandler = ({ element }) => {
  const expected = ["frame-rate", "id"];
  if (Object.keys(element.attributes).sort().join("\0") !== expected.join("\0")) {
    throw new Error(`${element.name} requires exactly id and frame-rate.`);
  }
  empty(element);
  const id = text(element, "id");
  const clock = sealProgramClock({ frameRate: frameRate(element) });
  return {
    records: [{ id, type: programSpaceTypes.clock, value: { kind: "inline", value: clock }, range: element.range }],
    components: [],
    fragments: [],
  };
};

export const decodeSpaceSurface: StructuredSurfaceHandler = ({ element }) => {
  const expected = ["duration", "frame-rate", "id"];
  if (Object.keys(element.attributes).sort().join("\0") !== expected.join("\0")) {
    throw new Error(`${element.name} requires exactly id, frame-rate and duration.`);
  }
  empty(element);
  const id = text(element, "id");
  const rate = frameRate(element);
  const duration = text(element, "duration");
  const match = /^(\d+(?:\.\d+)?)(s|ms|f)$/u.exec(duration);
  if (match === null) throw new Error(`${element.name}.duration must be a duration such as 8s, 8000ms or 240f.`);
  const value = Number(match[1]);
  const durationSec = match[2] === "f" ? value * rate.denominator / rate.numerator
    : match[2] === "ms" ? value / 1000 : value;
  const space = { id, durationSec, frameRate: rate };
  assertProgramSpaceIdentity(space);
  return { records: [{ id, type: programSpaceTypes.programSpace, value: { kind: "inline", value: space }, range: element.range }], components: [], fragments: [] };
};

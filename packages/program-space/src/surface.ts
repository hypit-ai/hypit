import {
  assertEmptyElement as empty,
  textAttribute as text,
  type StructuredElement,
  type StructuredSurfaceHandler,
} from "@hypit/markup";

import { programSpaceTypes, sealProgramClock, type ProgramClock } from "./index.js";

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

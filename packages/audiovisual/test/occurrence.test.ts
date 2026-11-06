import assert from "node:assert/strict";
import test from "node:test";

import { sealLocalSpatialDomain } from "@hypit/spatial/algebra";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";

import { pictureType, sealOccurrence, type ProgramSource } from "../src/index.js";

const seconds = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });

test("a constant Source output borrows only Occurrence duration and owns no fake Mapping", () => {
  const parent = sealLocalTemporalDomain({ id: "main:time", duration: seconds(20) });
  const local = sealLocalTemporalDomain({ id: "poster-use:time", duration: seconds(10) });
  const pictureSpace = sealLocalSpatialDomain({
    id: "poster:picture-space",
    region: { x: 0, y: 0, width: 1920, height: 1080 },
  });
  const source: ProgramSource = { id: "poster", outputs: { picture: {
    kind: "constant", type: pictureType, spatialDomain: pictureSpace,
  } } };
  const use = sealOccurrence({
    id: "poster-use",
    source,
    domain: local,
    placement: { parent, start: seconds(3), active: { start: seconds(0), end: seconds(10) } },
    selections: { picture: { kind: "constant" } },
  });
  assert.deepEqual(use.selections, { picture: { kind: "constant" } });
});

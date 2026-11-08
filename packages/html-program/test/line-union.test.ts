import assert from "node:assert/strict";
import test from "node:test";

import { htmlLineUnionRuntime } from "../src/index.js";

test("HTML line union runtime remains renderer-local and exposes measurement, outline and paint", () => {
  assert.match(htmlLineUnionRuntime, /hypitLineUnionRectangles/u);
  assert.match(htmlLineUnionRuntime, /hypitLineUnionOutline/u);
  assert.match(htmlLineUnionRuntime, /hypitPaintLineUnion/u);
  assert.doesNotMatch(htmlLineUnionRuntime, /caption|timeline|anchor/iu);
  const outline = new Function(`${htmlLineUnionRuntime}\nreturn hypitLineUnionOutline;`)() as (
    rectangles: readonly { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }[],
    radius: number,
  ) => string;
  const path = outline([
    { left: 0, right: 100, top: 0, bottom: 40 },
    { left: 20, right: 120, top: 40, bottom: 80 },
  ], 8);
  assert.match(path, /^M/u);
  assert.match(path, /A8 8/u);
  assert.match(path, /Z$/u);
  assert.equal(outline([], 8), "");
});

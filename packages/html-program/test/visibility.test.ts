import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";

import { frameWorkIndexRuntime } from "../src/frame-work.js";
import { presentationVisibilityScript } from "../src/visibility.js";

test("Present visibility updates only absolute active-set changes across arbitrary seeks", () => {
  const writes: string[] = [];
  const element = (name: string, spans: object[]) => {
    let opacity = "initial";
    return {
      dataset: { hypitVisibility: JSON.stringify(spans) },
      style: {
        get opacity() { return opacity; },
        set opacity(value: string) { opacity = value; writes.push(`${name}:${value}`); },
      },
    };
  };
  const a = element("a", [{ startFrame: 2, endFrameExclusive: 5 }, { startFrame: 8, endFrameExclusive: 10 }]);
  const b = element("b", [{ startFrame: 4, endFrameExclusive: 9 }]);
  let seek: (event: { detail: { frame: number } }) => void = () => {};
  runInNewContext(`${frameWorkIndexRuntime}\n${presentationVisibilityScript()}`, {
    window: { addEventListener: (_: string, callback: typeof seek) => { seek = callback; } },
    document: { querySelectorAll: () => [a, b] },
    Set,
  });
  assert.deepEqual(writes, ["a:0", "b:0"]);
  seek({ detail: { frame: 2 } });
  seek({ detail: { frame: 4 } });
  seek({ detail: { frame: 6 } });
  seek({ detail: { frame: 8 } });
  seek({ detail: { frame: 1 } });
  assert.deepEqual(writes, ["a:0", "b:0", "a:", "b:", "a:0", "a:", "a:0", "b:0"]);
});

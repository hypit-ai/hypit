import assert from "node:assert/strict";
import test from "node:test";

import { programSpaceFrameCount } from "@narratage/program-space";
import { parseScript } from "@narratage/script";

import { estimateTiming } from "../src/interpret/timing.js";

const RATE = { numerator: 30, denominator: 1 } as const;

function narrative(body: string) {
  return parseScript("timing.test", body);
}

test("estimated anchors reproduce the Script's own identities", () => {
  const parsed = narrative("<opening><HOST>Meaning becomes the source.</opening>");
  const { map } = estimateTiming(parsed, RATE);
  const identities = new Set(map.anchors.map((anchor) => anchor.identity));
  // Every anchor the Script indexed must be locatable, or a marker bound to it
  // would throw when a Track projects it.
  for (const anchor of parsed.semanticIndex.anchors) {
    assert.ok(identities.has(anchor.id), `missing anchor ${anchor.id}`);
  }
  assert.ok(identities.has("segment:opening:start"));
  assert.ok(identities.has("segment:opening:end"));
  assert.ok(identities.has("segment:opening:token:1:start"));
});

test("token windows are contiguous and strictly increasing", () => {
  const parsed = narrative("<opening><HOST>One two three four five six seven.</opening>");
  const { map } = estimateTiming(parsed, RATE);
  assert.equal(map.tokens.length, parsed.tokens.length);
  let previous = -1;
  for (const token of map.tokens) {
    assert.ok(token.startFrame > previous, `${token.tokenId} does not advance`);
    assert.ok(token.endFrame > token.startFrame, `${token.tokenId} occupies no frames`);
    previous = token.startFrame;
  }
  for (const [index, token] of map.tokens.slice(1).entries()) {
    assert.equal(token.startFrame, map.tokens[index]!.endFrame, "windows must not leave gaps");
  }
});

test("punctuation-only tokens still occupy a frame instead of throwing", () => {
  // countSpeechEstimateUnits returns zero for these, and estimateSpeechDuration
  // would reject them outright.
  const parsed = narrative("<opening><HOST>Yes --- no --- maybe.</opening>");
  const { map, space } = estimateTiming(parsed, RATE);
  for (const token of map.tokens) assert.ok(token.endFrame - token.startFrame >= 1);
  assert.ok(programSpaceFrameCount(space) >= map.tokens.length);
});

test("the ProgramSpace round-trips to an exact frame count", () => {
  const parsed = narrative("<opening><HOST>A short line.</opening><answer><HOST>Another line.</answer>");
  const { map, space } = estimateTiming(parsed, RATE);
  const frames = programSpaceFrameCount(space);
  assert.equal(space.durationSec, frames / 30);
  assert.equal(map.tokens.at(-1)!.endFrame, frames);
});

test("estimation is deterministic", () => {
  const parsed = narrative("<opening><HOST>Determinism is the point of an estimate.</opening>");
  assert.deepEqual(estimateTiming(parsed, RATE), estimateTiming(parsed, RATE));
});

test("a non-integer frame rate still lands on exact frame boundaries", () => {
  const parsed = narrative("<opening><HOST>Broadcast rates are rational, not decimal.</opening>");
  const { space } = estimateTiming(parsed, { numerator: 30000, denominator: 1001 });
  assert.deepEqual(space.frameRate, { numerator: 30000, denominator: 1001 });
  assert.ok(Number.isSafeInteger(programSpaceFrameCount(space)));
});

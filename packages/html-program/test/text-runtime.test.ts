import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import test from "node:test";

import { frameWorkIndexRuntime } from "../src/frame-work.js";
import { terminalTextLayoutScript } from "../src/text.js";

test("terminal Text lazily prepares one persistent Animation per active Unit × Sequence", async () => {
  class Style {
    readonly values = new Map<string, string>();
    getPropertyValue(name: string) { return this.values.get(name) ?? ""; }
    setProperty(name: string, value: string) { this.values.set(name, value); }
    removeProperty(name: string) { this.values.delete(name); }
  }
  class MockElement {
    readonly style = new Style();
    readonly attributes = new Map<string, string>();
    readonly animationKeyframes: object[] = [];
    readonly animationPositions: number[][] = [];
    pauses = 0;
    cancels = 0;
    constructor(index: number) { this.attributes.set("data-hypit-text-unit-grapheme", String(index)); }
    hasAttribute(name: string) { return this.attributes.has(name); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    animate(keyframes: object) {
      this.animationKeyframes.push(keyframes);
      const positions: number[] = [];
      this.animationPositions.push(positions);
      const owner = this;
      return {
        pause() { owner.pauses += 1; },
        set currentTime(value: number) { positions.push(value); },
        cancel() { owner.cancels += 1; },
      };
    }
  }
  const units = [7, 8, 9].map((index) => new MockElement(index));
  const futureUnits = [7, 8, 9].map((index) => new MockElement(index));
  const sequences = JSON.stringify([{
      unit: "grapheme", range: { start: 7, endExclusive: 10 }, order: "random", seed: 41,
      startFrame: 0, staggerFrames: 1, unitDurationFrames: 10, cycles: 1,
      keyframes: [
        { atProgress: 0, state: { opacity: 0 } },
        { atProgress: 1, state: { opacity: 1 } },
      ],
    }]);
  const root = (startFrame: number, elements: MockElement[]) => {
    const attributes = new Map([
      ["data-hypit-text-start-frame", String(startFrame)],
      ["data-hypit-text-frame-numerator", "30"],
      ["data-hypit-text-frame-denominator", "1"],
      ["data-hypit-text-duration-frames", "30"],
      ["data-hypit-text-sequences", sequences],
    ]);
    return {
      getAttribute(name: string) { return attributes.get(name) ?? null; },
      querySelectorAll() { return elements; },
    };
  };
  const roots = [root(0, units), root(30, futureUnits)];
  const composition = { getAttribute: (name: string) => name === "data-composition-id" ? "main" : null };
  let seekListener: ((event: { detail: { frame: number; waitUntil(value: Promise<void>): void } }) => void) | undefined;
  const window = {
    addEventListener(name: string, listener: typeof seekListener) {
      if (name === "hypit-frame") seekListener = listener;
    },
  } as { addEventListener(name: string, listener: typeof seekListener): void };
  let seededSteps = 0;
  const countedMath = Object.create(Math) as Math;
  countedMath.imul = (left, right) => {
    seededSteps += 1;
    return Math.imul(left, right);
  };
  const document = {
    fonts: { ready: Promise.resolve() },
    documentElement: { getBoundingClientRect() { return {}; } },
    querySelector(selector: string) { return selector === "[data-composition-id]" ? composition : null; },
    querySelectorAll(selector: string) {
      return selector === "[data-hypit-text-clock][data-hypit-text-sequences]" ? roots : [];
    },
    getElementById() { return null; },
  };
  runInNewContext(`${frameWorkIndexRuntime}\n${terminalTextLayoutScript}`, {
    document,
    Element: MockElement,
    Math: countedMath,
    window,
  });
  assert.ok(seekListener);
  let ready: Promise<void> | undefined;
  seekListener({ detail: { frame: 0, waitUntil(value) { ready = value; } } });
  assert.ok(ready);
  await ready;

  assert.equal(seededSteps, 2, "only the initially active root prepares its Fisher-Yates order");
  const preparedKeyframes = units[0]!.animationKeyframes[0];
  assert.ok(preparedKeyframes);
  for (const unit of units) {
    assert.equal(unit.animationKeyframes.length, 1, "each selected Unit × Sequence creates one browser Animation");
    assert.equal(unit.pauses, 1);
    assert.equal(unit.cancels, 0);
  }
  assert.ok(units.every((unit) => unit.animationPositions[0]!.length === 2), "the active root receives the initial absolute seek");
  assert.ok(futureUnits.every((unit) => unit.animationKeyframes.length === 0), "the future root is not prepared in this Worker");
  for (let frame = 1; frame <= 20; frame += 1) seekListener({ detail: { frame, waitUntil() {} } });
  assert.equal(seededSteps, 2, "seeks reuse the prepared inverse rank map");
  for (const unit of units) {
    assert.equal(unit.animationKeyframes.length, 1);
    assert.equal(unit.animationKeyframes[0], preparedKeyframes, "Units in one root reuse prepared native keyframes");
    assert.equal(unit.animationPositions[0]!.length, 22);
  }
  seekListener({ detail: { frame: 30, waitUntil() {} } });
  assert.ok(units.every((unit) => unit.animationPositions[0]!.length === 22), "the expired Text root remains untouched");
  assert.ok(futureUnits.every((unit) => unit.animationPositions[0]!.length === 2), "the newly active Text root is evaluated");
  assert.equal(seededSteps, 4, "the newly active root prepares its random order once on first use");
  assert.ok(futureUnits.every((unit) => unit.animationKeyframes.length === 1 && unit.pauses === 1 && unit.cancels === 0));
});

test("terminal Text static layout ignores roots outside the render selection", async () => {
  class MockElement {}
  const root = (startFrame: number) => ({
    getAttribute(name: string) {
      if (name === "data-hypit-text-start-frame") return String(startFrame);
      if (name === "data-hypit-text-duration-frames") return "30";
      return null;
    },
  });
  const earlyRoot = root(0);
  const selectedRoot = root(90);
  const rotations = [0, 0];
  const path = (owner: ReturnType<typeof root>, index: number) => ({
    closest() { return owner; },
    querySelectorAll() {
      return [{
        removeAttribute() {},
        getRotationOfChar() { rotations[index]! += 1; return 0; },
        setAttribute() {},
      }];
    },
  });
  const paths = [path(earlyRoot, 0), path(selectedRoot, 1)];
  const composition = { getAttribute: () => "main" };
  let ready: Promise<void> | undefined;
  const window = {
    addEventListener(name: string, listener: (event: { detail: { frame: number; waitUntil(value: Promise<void>): void } }) => void) {
      if (name === "hypit-frame") listener({ detail: { frame: 100, waitUntil(value) { ready = value; } } });
    },
  } as { addEventListener(name: string, listener: (event: { detail: { frame: number; waitUntil(value: Promise<void>): void } }) => void): void };
  const document = {
    fonts: { ready: Promise.resolve() },
    documentElement: { getBoundingClientRect() {} },
    querySelector: () => composition,
    querySelectorAll(selector: string) {
      if (selector === "[data-hypit-text-path-upright]") return paths;
      return [];
    },
    getElementById() { return null; },
  };
  runInNewContext(`${frameWorkIndexRuntime}
    htmlPrepareFrameSelection([{ startFrame: 100, endFrameExclusive: 101 }]);
    ${terminalTextLayoutScript}`, { document, Element: MockElement, window });
  assert.ok(ready);
  await ready;
  assert.deepEqual(rotations, [0, 2]);
});

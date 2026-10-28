import assert from "node:assert/strict";
import test from "node:test";

import { HTML_VISUAL_FORMAT, type HtmlVisual } from "@hypit/html-program";
import {
  assertIrisShape,
  assertTransitionColor,
  assertTransitionDirection,
  assertTransitionEasing,
  blurDissolveEffect,
  crossDissolveEffect,
  dipToColorEffect,
  irisEffect,
  linearWipeEffect,
  pushEffect,
  slideEffect,
  visualTransitionAuthorDeclarations,
  visualTransitionMarkupDeclarations,
  zoomDissolveEffect,
} from "../src/index.js";
import { visualTransitionStudioParameterCompanions } from "../src/studio.js";

type Layer = { style: Record<string, string> };

function run(program: ReturnType<typeof crossDissolveEffect>, durationFrames = 3) {
  assert.equal(program.format, HTML_VISUAL_FORMAT);
  const visual = program.payload as unknown as HtmlVisual;
  const outgoing: Layer = { style: {} };
  const incoming: Layer = { style: {} };
  const color: Layer = { style: {} };
  const root = {
    querySelector: (selector: string) => selector.includes("transition-color")
      ? color
      : selector.includes("outgoing") ? outgoing : incoming,
  };
  const render = new Function("root", "data", "context", visual.setup!)(
    root,
    visual.data,
    { durationFrames },
  ) as (localFrame: number) => void;
  return { visual, outgoing, incoming, color, render };
}

test("the official package publishes one declaration per foundational transition effect", () => {
  assert.deepEqual(visualTransitionMarkupDeclarations.map(({ tag }) => tag), [
    "CrossDissolve",
    "DipToColor",
    "Push",
    "Slide",
    "LinearWipe",
    "Iris",
    "ZoomDissolve",
    "BlurDissolve",
  ]);
  assert.deepEqual(
    visualTransitionAuthorDeclarations.map(({ declaration }) => declaration),
    visualTransitionMarkupDeclarations.map(({ name }) => name),
  );
  assert.deepEqual(
    visualTransitionStudioParameterCompanions.map(({ match }) => match.declaration),
    visualTransitionMarkupDeclarations.map(({ name }) => name),
  );
});

test("every transition owns exactly the outgoing and incoming Picture inputs", () => {
  const programs = [
    crossDissolveEffect(),
    dipToColorEffect(),
    pushEffect(),
    slideEffect(),
    linearWipeEffect(),
    irisEffect(),
    zoomDissolveEffect(),
    blurDissolveEffect(),
  ];
  for (const program of programs) {
    const visual = program.payload as unknown as HtmlVisual;
    assert.equal(visual.html.match(/\{\{outgoing\}\}/gu)?.length, 1);
    assert.equal(visual.html.match(/\{\{incoming\}\}/gu)?.length, 1);
  }
});

test("Cross Dissolve interpolates premultiplied Pictures and reaches both endpoints", () => {
  const { visual, outgoing, incoming, render } = run(crossDissolveEffect("linear"));
  render(0);
  assert.equal(outgoing.style.opacity, "1");
  assert.equal(incoming.style.opacity, "0");
  render(1);
  assert.equal(outgoing.style.opacity, "0.5");
  assert.equal(incoming.style.opacity, "0.5");
  render(2);
  assert.equal(outgoing.style.opacity, "0");
  assert.equal(incoming.style.opacity, "1");
  assert.match(visual.css!, /mix-blend-mode:\s*plus-lighter/u);
});

test("Dip To Color passes through the selected opaque colour at its midpoint", () => {
  const { outgoing, incoming, color, render } = run(dipToColorEffect("#ffffff"));
  assert.equal(color.style.background, "#ffffff");
  render(0);
  assert.deepEqual([outgoing.style.opacity, color.style.opacity, incoming.style.opacity], ["1", "0", "0"]);
  render(1);
  assert.deepEqual([outgoing.style.opacity, color.style.opacity, incoming.style.opacity], ["0", "1", "0"]);
  render(2);
  assert.deepEqual([outgoing.style.opacity, color.style.opacity, incoming.style.opacity], ["0", "0", "1"]);
});

test("Push and Slide preserve their distinct two-picture spatial relations", () => {
  const push = run(pushEffect("left", "linear"));
  push.render(0);
  assert.equal(push.outgoing.style.transform, "translate3d(0%, 0, 0)");
  assert.equal(push.incoming.style.transform, "translate3d(100%, 0, 0)");
  push.render(2);
  assert.equal(push.outgoing.style.transform, "translate3d(-100%, 0, 0)");
  assert.equal(push.incoming.style.transform, "translate3d(0%, 0, 0)");

  const slide = run(slideEffect("up", "linear"));
  slide.render(1);
  assert.equal(slide.outgoing.style.transform, "none");
  assert.equal(slide.incoming.style.transform, "translate3d(0, 50%, 0)");
});

test("Linear Wipe and Iris own reveal geometry rather than changing Visual Track", () => {
  const wipe = run(linearWipeEffect("right", "linear"));
  wipe.render(0);
  assert.equal(wipe.incoming.style.clipPath, "inset(0 100% 0 0)");
  wipe.render(2);
  assert.equal(wipe.incoming.style.clipPath, "inset(0 0% 0 0)");

  const iris = run(irisEffect("box", "linear"));
  iris.render(0);
  assert.equal(iris.incoming.style.clipPath, "inset(50% 50% 50% 50%)");
  iris.render(2);
  assert.equal(iris.incoming.style.clipPath, "inset(0% 0% 0% 0%)");
});

test("Zoom and Blur Dissolve expose bounded optical parameters", () => {
  const zoom = run(zoomDissolveEffect(0.2, "linear"));
  zoom.render(1);
  assert.equal(zoom.outgoing.style.transform, "scale(1.1)");
  assert.equal(zoom.incoming.style.transform, "scale(0.9)");

  const blur = run(blurDissolveEffect(20, "linear"));
  blur.render(1);
  assert.equal(blur.outgoing.style.filter, "blur(20px)");
  assert.equal(blur.incoming.style.filter, "blur(20px)");
  assert.throws(() => zoomDissolveEffect(1.1), /between 0 and 1/u);
  assert.throws(() => blurDissolveEffect(-1), /between 0 and 200/u);
});

test("effect packages reject invalid author parameters at their own boundary", () => {
  assert.throws(() => assertTransitionEasing("spring"), /easing spring is invalid/u);
  assert.throws(() => assertTransitionDirection("diagonal"), /direction diagonal is invalid/u);
  assert.throws(() => assertIrisShape("star"), /shape star is invalid/u);
  assert.throws(() => assertTransitionColor("black"), /hexadecimal color/u);
});

test("Studio edits package-owned parameters rather than adding fields to Visual Track", () => {
  const cross = visualTransitionStudioParameterCompanions.find(({ id }) => id === "cross-dissolve")!;
  assert.deepEqual(cross.inspector?.find(({ binding }) => binding === "easing")?.options,
    ["linear", "ease-in", "ease-out", "ease-in-out"]);
  const dip = visualTransitionStudioParameterCompanions.find(({ id }) => id === "dip-to-color")!;
  assert.equal(dip.inspector?.find(({ binding }) => binding === "color")?.control, "color");
  const iris = visualTransitionStudioParameterCompanions.find(({ id }) => id === "iris")!;
  assert.deepEqual(iris.inspector?.find(({ binding }) => binding === "shape")?.options,
    ["circle", "box", "diamond"]);
});

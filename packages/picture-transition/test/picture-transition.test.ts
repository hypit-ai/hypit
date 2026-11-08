import assert from "node:assert/strict";
import test from "node:test";

import { HTML_VISUAL_FORMAT, type HtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/protocol";
import { createNleLoweringHostFromFacets } from "@hypit/nle";
import { exactTemporalValue, sealLocalTemporalDomain } from "@hypit/temporal/algebra";
import {
  assertIrisShape,
  assertTransitionColor,
  assertTransitionDirection,
  assertTransitionEasing,
  blurDissolveEffect,
  blurDissolveOperator,
  crossDissolveEffect,
  crossDissolveOperator,
  dipToColorEffect,
  dipToColorOperator,
  irisEffect,
  irisOperator,
  linearWipeEffect,
  linearWipeOperator,
  pushEffect,
  pushOperator,
  slideEffect,
  slideOperator,
  transitionOperator,
  pictureTransitionComponent,
  pictureTransitionNleAuthoring,
  pictureTransitionProducers,
  pictureTransitionNleSymbol,
  zoomDissolveEffect,
  zoomDissolveOperator,
} from "../src/index.js";
import { hypitPackage as pictureTransitionHypitPackage } from "../src/activation.js";

type Layer = { style: Record<string, string> };
const domain = sealLocalTemporalDomain({ id: "transition:time", duration: exactTemporalValue({
  numerator: 3n, denominator: 1n,
}) });

function run(effect: ReturnType<typeof crossDissolveEffect>, durationFrames = 3) {
  assert.deepEqual(effect.inputs, ["outgoing", "incoming"]);
  assert.equal(effect.program.format, HTML_VISUAL_FORMAT);
  const visual = effect.program.payload as unknown as HtmlVisual;
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

test("the typed Producer publishes every package-owned transition as a Picture Operator", async () => {
  const producer = pictureTransitionComponent.producers.find((candidate) =>
    candidate.producer.name === pictureTransitionProducers.operator.name)!;
  const specs = [
    { kind: "cross-dissolve", easing: "linear" },
    { kind: "dip-to-color", color: "#ffffff", easing: "ease-in" },
    { kind: "push", direction: "left", easing: "ease-out" },
    { kind: "slide", direction: "up", easing: "ease-in-out" },
    { kind: "linear-wipe", direction: "right", easing: "linear" },
    { kind: "iris", shape: "diamond", easing: "ease-in" },
    { kind: "zoom-dissolve", strength: 0.2, easing: "ease-out" },
    { kind: "blur-dissolve", radius: 24, easing: "ease-in-out" },
  ] as const;
  for (const spec of specs) {
    const result = await producer.handler({ inputs: {
      spec: { value: canonicalize(spec) }, domain: { value: canonicalize(domain) },
    } } as never);
    assert.equal(result.kind, "output");
    assert.deepEqual(result.value, transitionOperator(spec, domain));
  }
});

test("every official transition closes the same two named AVIR ports", () => {
  const operators = [
    crossDissolveOperator(domain),
    dipToColorOperator(domain),
    pushOperator(domain),
    slideOperator(domain),
    linearWipeOperator(domain),
    irisOperator(domain),
    zoomDissolveOperator(domain),
    blurDissolveOperator(domain),
  ];
  assert.deepEqual(operators.map(({ id }) => id), [
    "hypit.picture-transition:cross-dissolve",
    "hypit.picture-transition:dip-to-color",
    "hypit.picture-transition:push",
    "hypit.picture-transition:slide",
    "hypit.picture-transition:linear-wipe",
    "hypit.picture-transition:iris",
    "hypit.picture-transition:zoom-dissolve",
    "hypit.picture-transition:blur-dissolve",
  ]);
  for (const operator of operators) {
    assert.deepEqual(operator.inputs, ["outgoing", "incoming"]);
    assert.deepEqual(operator.temporalControls, { progress: domain });
  }
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
  for (const effect of programs) {
    assert.deepEqual(effect.inputs, ["outgoing", "incoming"]);
    const visual = effect.program.payload as unknown as HtmlVisual;
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

test("Linear Wipe and Iris own reveal geometry rather than changing Picture placement", () => {
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

test("the package resolves a direct NLE Transition against its overlap domain", () => {
  const spec = { kind: "cross-dissolve", easing: "ease-in-out" } as const;
  const resolved = createNleLoweringHostFromFacets(pictureTransitionHypitPackage.facets)
    .resolveTransition({
      id: "join", outgoing: "left", incoming: "right",
      operator: pictureTransitionNleSymbol, parameters: canonicalize(spec),
    }, { domain } as never);
  assert.deepEqual(resolved, { operator: transitionOperator(spec, domain) });
  assert.deepEqual(pictureTransitionNleAuthoring.inspect({ transition: {
    id: "join", outgoing: "left", incoming: "right",
    operator: pictureTransitionNleSymbol, parameters: canonicalize(spec),
  } } as never), canonicalize(spec));
  const changed = { kind: "push", direction: "left", easing: "ease-out" } as const;
  assert.deepEqual(pictureTransitionNleAuthoring.edit({ kind: "set-spec", spec: changed }, {} as never),
    canonicalize(changed));
});

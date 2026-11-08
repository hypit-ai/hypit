import assert from "node:assert/strict";
import test from "node:test";

import { pictureType } from "@hypit/audiovisual";
import { readHtmlVisual } from "@hypit/html-program";
import { canonicalize } from "@hypit/protocol";
import {
  applyNleTransaction,
  createNleAuthoringHostFromFacets,
  createNleProject,
  findNleItem,
  nleLinearSourceTime,
} from "@hypit/nle";
import { exactTemporalValue } from "@hypit/temporal/algebra";

import { hypitPackage } from "../src/activation.js";
import {
  textFineNleComponentSymbol,
  textFineNleHtmlVideoResolver,
  textFineNleResolver,
  type TextFineNleParameters,
} from "../src/index.js";

const at = (value: number) => exactTemporalValue({ numerator: BigInt(value), denominator: 1n });
const parameters: TextFineNleParameters = {
  typography: { fontFamily: "system-ui, sans-serif", fontSizePx: 64, fontWeight: 800, lineHeight: 1.05 },
  paints: [
    { kind: "shadow", color: "#00000099", offsetX: 4, offsetY: 6, blurPx: 8 },
    { kind: "stroke", paint: { kind: "solid", color: "#111827" }, widthPx: 3, placement: "outside" },
    { kind: "fill", paint: { kind: "linear-gradient", angleDeg: 90, stops: [
      { offset: 0, color: "#ffffff", opacity: 1 },
      { offset: 1, color: "#67e8f9", opacity: 1 },
    ] } },
  ],
  children: [{ kind: "group", id: "headline", children: [
    { kind: "text", id: "lead", text: "A title " },
    { kind: "text", id: "accent", text: "with structure", style: {
      typography: { fontStyle: "italic" },
    } },
  ] }],
  sequences: [{
    id: "lead-graphemes",
    nodes: ["lead"],
    unit: "grapheme",
    order: "forward",
    startFrame: 0,
    durationFrames: 8,
    staggerFrames: 2,
    cycles: 1,
    keyframes: [
      { atProgress: 0, state: { opacity: 0, translateYPx: 18, scale: 0.86, blurPx: 4,
        clipInsetPercent: { top: 0, right: 0, bottom: 100, left: 0 } } },
      { atProgress: 1, easing: "ease-out", state: { opacity: 1, translateYPx: 0, scale: 1, blurPx: 0 } },
    ],
  }],
  placement: {
    kind: "flow",
    paddingPx: { top: 20, right: 20, bottom: 20, left: 20 },
    inlineAlign: "center",
    blockAlign: "center",
    wrap: "word",
    overflow: "shrink",
    minimumScale: 0.5,
    maxLines: 2,
    columns: 1,
    columnGapPx: 0,
  },
};

function project() {
  return applyNleTransaction(createNleProject({
    id: "fine-text", name: "Fine Text", canvas: { width: 1920, height: 1080, clearColor: "#000000" },
  }), { revision: 0, commands: [{
    kind: "track.add",
    track: { id: "titles", name: "Titles", kind: "picture", locked: false, muted: false, items: [{
      id: "headline",
      kind: "component",
      start: at(0),
      duration: at(3),
      sourceTime: nleLinearSourceTime(at(3)),
      enabled: true,
      component: textFineNleComponentSymbol,
      parameters: canonicalize(parameters),
      picture: { layout: { x: 160, y: 100, width: 1600, height: 300, fit: "fill" }, effects: [] },
    }] },
  }] });
}

test("Fine Text resolves rich Flow text as an ordinary Picture Component", () => {
  const item = findNleItem(project(), "headline").item;
  if (item.kind !== "component") throw new Error("Fine Text fixture changed Item kind.");
  const resolved = textFineNleResolver.resolve(item, { project: project(), track: project().tracks[0]! });
  assert.equal(resolved.source.outputs.picture?.type.name, pictureType.name);
  assert.equal(resolved.source.outputs.picture?.kind, "signal");
  assert.ok(hypitPackage.facets.some((facet) => facet.abi === "hypit.html-video-nle-package@1"));
});

test("Fine Text package authors document, style and local placement through item.replace", () => {
  const original = project();
  const host = createNleAuthoringHostFromFacets(hypitPackage.facets);
  const transaction = host.planComponentParameterEdit(original, "headline", {
    kind: "set-document",
    children: [{ kind: "text", id: "replacement", text: "Changed title" }],
  });
  assert.deepEqual(transaction.commands.map((command) => command.kind), ["item.replace"]);
  const edited = applyNleTransaction(original, transaction);
  const item = findNleItem(edited, "headline").item;
  if (item.kind !== "component") throw new Error("Fine Text edit changed Item kind.");
  assert.deepEqual((item.parameters as unknown as TextFineNleParameters).children,
    [{ kind: "text", id: "replacement", text: "Changed title" }]);
});

test("Fine Text lays rich runs on an authored path without a Composition intermediary", () => {
  const selectedProject = project();
  const item = findNleItem(selectedProject, "headline").item;
  if (item.kind !== "component") throw new Error("Fine Text fixture changed Item kind.");
  const pathItem = { ...item, parameters: canonicalize({ ...parameters, placement: {
    kind: "path",
    commands: [
      { kind: "move", x: 80, y: 220 },
      { kind: "quadratic", controlX: 800, controlY: 20, x: 1520, y: 220 },
    ],
    side: "left",
    orientation: "follow",
    startMarginPx: 20,
    endMarginPx: 20,
    align: "center",
    reverse: false,
    overflow: "clip",
    marginAnimation: { keyframes: [
      { atFrame: 0, startMarginPx: 20 },
      { atFrame: 45, startMarginPx: 120, easing: "ease-in-out" },
    ] },
  } }) };
  const terminal = textFineNleHtmlVideoResolver.resolve(pathItem, {
    project: selectedProject,
    track: selectedProject.tracks[0]!,
  }, textFineNleResolver.resolve(pathItem, { project: selectedProject, track: selectedProject.tracks[0]! }));
  if (terminal.html?.implementation.kind !== "program") throw new Error("Fine Text terminal is not a Program.");
  const visual = readHtmlVisual(terminal.html.implementation.program);
  assert.match(visual.html, /data-hypit-text-fine-path-guide/u);
  assert.match(visual.html, /Q800 20 1520 220/u);
  assert.match(visual.setup ?? "", /hypitLayoutTextOnPath/u);
  assert.match(visual.setup ?? "", /hypitApplyTextSequences/u);
  assert.match(visual.html, /lead:grapheme:/u);
  assert.match(visual.setup ?? "", /--hypit-text-path-transform/u);
  assert.doesNotThrow(() => new Function("root", "data", "context", visual.setup ?? ""));
});

test("Fine Text authors internal sequence motion as direct Component parameters", () => {
  const original = project();
  const host = createNleAuthoringHostFromFacets(hypitPackage.facets);
  const transaction = host.planComponentParameterEdit(original, "headline", {
    kind: "set-sequences",
    sequences: [{
      id: "nodes",
      unit: "node",
      order: "reverse",
      startFrame: 3,
      durationFrames: 6,
      staggerFrames: 1,
      cycles: 2,
      keyframes: [
        { atProgress: 0, state: { opacity: 0 } },
        { atProgress: 1, state: { opacity: 1 } },
      ],
    }],
  });
  const edited = applyNleTransaction(original, transaction);
  const item = findNleItem(edited, "headline").item;
  if (item.kind !== "component") throw new Error("Fine Text edit changed Item kind.");
  assert.equal((item.parameters as unknown as TextFineNleParameters).sequences?.[0]?.cycles, 2);
});

test("Fine Text rejects impossible Flow ownership instead of hiding layout fallback", () => {
  assert.throws(() => textFineNleResolver.resolve({
    ...findNleItem(project(), "headline").item,
    parameters: canonicalize({ ...parameters, placement: {
      kind: "flow",
      paddingPx: { top: 0, right: 0, bottom: 0, left: 0 },
      inlineAlign: "center",
      blockAlign: "center",
      wrap: "word",
      overflow: "clip",
      minimumScale: 0.5,
      columns: 1,
      columnGapPx: 0,
    } }),
  } as never, {} as never), /minimumScale belongs only to shrink/u);
});

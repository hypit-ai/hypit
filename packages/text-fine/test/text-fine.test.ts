import assert from "node:assert/strict";
import test from "node:test";

import { pictureType } from "@hypit/audiovisual";
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

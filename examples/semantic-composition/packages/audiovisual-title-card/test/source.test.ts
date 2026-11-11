import assert from "node:assert/strict";
import test from "node:test";

import {
  createNleScaledHtmlOutput,
  createNleTerminalLinkHostFromFacets,
  lowerNleProjectToHtmlProgram,
} from "../../../../../packages/html-video/src/index.js";
import {
  applyNleTransaction,
  commitNleEdit,
  createComponentMaterialization,
  createNleAuthoringHostFromFacets,
  createNleEditSession,
  createNleProject,
  findNleItem,
  undoNleEdit,
} from "@hypit/nle";
import { exactTemporalValue } from "@hypit/temporal/algebra";

import {
  titleCardHtmlSource,
  titleCardNleSymbol,
  titleCardProgramSource,
  type TitleCardSpec,
} from "../src/index.js";
import { hypitPackage as titleCardHypitPackage } from "../src/activation.js";

const at = (numerator: number, denominator = 1) => exactTemporalValue({
  numerator: BigInt(numerator), denominator: BigInt(denominator),
});

const title: TitleCardSpec = {
  id: "project-opening-title",
  duration: at(3),
  width: 1280,
  height: 720,
  title: "A component is a Source",
  subtitle: "not a Track kind",
  background: "#172033",
  foreground: "#f4f7ff",
};

test("the project component projects direct parameters to finite Source and HTML facts", () => {
  const source = titleCardProgramSource(title);
  assert.equal(source.outputs.picture?.kind, "signal");
  if (source.outputs.picture?.kind !== "signal") throw new Error("Title Card Picture is not a signal.");
  assert.deepEqual(source.outputs.picture.domain.duration, at(3));
  assert.deepEqual(source.outputs.picture.spatialDomain?.region, {
    x: 0, y: 0, width: 1280, height: 720,
  });
  const html = titleCardHtmlSource(title);
  assert.match(JSON.stringify(html), /A component is a Source/u);
  assert.match(JSON.stringify(html), /not a Track kind/u);
});

test("the installed project package resolves and edits one materialized NLE Component", () => {
  const empty = createNleProject({
    id: "component-editorial", name: "Component editorial",
    canvas: { width: 1280, height: 720, clearColor: "#000000" },
  });
  const withTrack = applyNleTransaction(empty, { revision: 0, commands: [{
    kind: "track.add", track: {
      id: "main", name: "Main", kind: "picture", muted: false, items: [],
    },
  }] });
  const project = applyNleTransaction(withTrack, createComponentMaterialization(withTrack, {
    id: "opening", track: "main", component: titleCardNleSymbol,
    parameters: {
      title: "A materialized Component", subtitle: "resolved by its project package",
      background: "#172033", foreground: "#f4f7ff",
    },
    at: at(0), duration: at(2),
  }));
  const host = createNleTerminalLinkHostFromFacets(titleCardHypitPackage.facets);
  const html = lowerNleProjectToHtmlProgram(project, host,
    createNleScaledHtmlOutput(project, { numerator: 1, denominator: 1 }));
  assert.match(html.html, /A materialized Component/u);
  assert.match(html.html, /resolved by its project package/u);

  const authoring = createNleAuthoringHostFromFacets(titleCardHypitPackage.facets);
  const transaction = authoring.planComponentParameterEdit(project, "opening", {
    kind: "set-title", value: "Edited by its package",
  });
  let session = createNleEditSession(project);
  session = commitNleEdit(session, { label: "Edit title", transaction });
  const editedHtml = lowerNleProjectToHtmlProgram(session.current, host,
    createNleScaledHtmlOutput(session.current, { numerator: 1, denominator: 1 }));
  assert.match(editedHtml.html, /Edited by its package/u);
  const editedItem = findNleItem(session.current, "opening").item;
  if ((editedItem.kind !== "present" || editedItem.source !== "component")) throw new Error("Title Card Item changed kind.");
  assert.equal((editedItem.parameters as { readonly title: string }).title, "Edited by its package");
  session = undoNleEdit(session);
  const restoredItem = findNleItem(session.current, "opening").item;
  if ((restoredItem.kind !== "present" || restoredItem.source !== "component")) throw new Error("Restored Title Card Item changed kind.");
  assert.equal((restoredItem.parameters as { readonly title: string }).title, "A materialized Component");
  assert.throws(() => authoring.planComponentParameterEdit(project, "opening", {
    kind: "set-colors", background: "black", foreground: "#ffffff",
  }), /six-digit hex color/u);
});

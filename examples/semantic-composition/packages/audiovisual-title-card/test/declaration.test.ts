import assert from "node:assert/strict";
import test from "node:test";

import { titleCardAuthorDeclaration } from "../src/declaration.js";

test("the project component owns its label-native ProgramSource declaration", async () => {
  const declaration = {
    module: { name: "@example/audiovisual-title-card", version: "1" },
    name: "Card",
    label: "opening-title",
    fields: [
      ["duration", "2s"], ["width", "1920px"], ["height", "1080px"],
      ["title", "Hypit"], ["subtitle", "Project-owned component"],
      ["background", "#101828"], ["foreground", "#ffffff"],
    ].map(([name, value]) => ({ name: name!, value: { kind: "literal" as const, value: value! } })),
    children: [],
    range: { start: 0, end: 1 },
  };
  const bindings = titleCardAuthorDeclaration.bindings(declaration, { sourceName: "main.svml" });
  assert.equal(bindings[0]?.name, "opening-title");
  assert.equal(bindings[0]?.type.name, "ProgramSource");
  const compiled = await titleCardAuthorDeclaration.compile({
    sourceName: "main.svml",
    declaration,
    resolveReference: () => undefined,
    resolveAsset: () => { throw new Error("unused"); },
    readAsset: () => { throw new Error("unused"); },
  });
  assert.equal(compiled.components[0]?.id, "opening-title:title-card");
  assert.equal(compiled.components[0]?.outputs.source, "opening-title");
  const spec = compiled.records[0]?.value as { duration?: { ticks?: string }; width?: number; height?: number };
  assert.equal(spec.duration?.ticks, "2");
  assert.equal(spec.width, 1920);
  assert.equal(spec.height, 1080);
});

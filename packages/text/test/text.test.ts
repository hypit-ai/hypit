import assert from "node:assert/strict";
import test from "node:test";

import { contractsManifest } from "@svml/contracts";
import { createResolvedClosure, digestOf, isDigest, link } from "@svml/core";
import type { ModuleManifest } from "@svml/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@svml/script";
import {
  TextFrontendError,
  TextSurfaceRegistry,
  decodeText,
  parseStructuredElement,
} from "@svml/text";

function scriptContext() {
  const closure = createResolvedClosure([contractsManifest, scriptManifest]);
  const registry = new TextSurfaceRegistry();
  registry.registerRaw(
    scriptModuleRef,
    "script",
    scriptSurfaceImplementationDigest,
    decodeScriptSurface,
  );
  return {
    closure,
    registry,
    resolveModule: () => scriptModuleRef,
  } as const;
}

test("Text learns <script> only from an imported Script Manifest", () => {
  const result = decodeText(
    {
      name: "talk.svml",
      text: `<svml>
        <import from="@svml/script@0.0.0-dev"/>

        <script id="story">
          <opening>
            <ALICE>Hello.
            <BOB>Hi.
          </opening>
        </script>
      </svml>`,
    },
    scriptContext(),
  );

  assert.equal(result.module.records.length, 1);
  assert.equal(result.module.records[0]?.id, "story");
  assert.equal(result.module.records[0]?.type.name, "Narrative");
  assert.equal(result.sourceMaps.length, 1);
  assert.doesNotThrow(() => link(scriptContext().closure, [result.module]));
});

test("the same Script meaning has the same authored Record digest across reflow", () => {
  const compact = decodeText(
    {
      name: "compact.svml",
      text: `<svml><import from="@svml/script"/><script id="story"><opening><ALICE>Hello.<BOB>Hi.</opening></script></svml>`,
    },
    scriptContext(),
  );
  const multiline = decodeText(
    {
      name: "multiline.svml",
      text: `<svml>
        <import from="@svml/script"/>
        <script id="story">
          <opening>
            <ALICE>Hello.
            <BOB>Hi.
          </opening>
        </script>
      </svml>`,
    },
    scriptContext(),
  );

  assert.equal(compact.module.records[0]?.digest, multiline.module.records[0]?.digest);
  assert.notEqual(
    compact.module.records[0]?.origin.kind === "authored" ? compact.module.records[0].origin.sourceDigest : undefined,
    multiline.module.records[0]?.origin.kind === "authored" ? multiline.module.records[0].origin.sourceDigest : undefined,
  );
});

test("without the import, Text has no hard-coded knowledge of Script", () => {
  assert.throws(
    () => decodeText(
      { name: "unknown.svml", text: "<svml><script><opening>Hello.</opening></script></svml>" },
      scriptContext(),
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_UNKNOWN_SURFACE",
  );
});

test("a raw Surface cannot consume the Text document close", () => {
  const closure = createResolvedClosure([contractsManifest, scriptManifest]);
  const registry = new TextSurfaceRegistry();
  registry.registerRaw(
    scriptModuleRef,
    "script",
    scriptSurfaceImplementationDigest,
    (input) => ({ nextOffset: input.source.length, records: [] }),
  );
  assert.throws(
    () => decodeText(
      {
        name: "swallowed.svml",
        text: `<svml><import from="@svml/script"/><script><opening>Hello.</opening></script></svml>`,
      },
      { closure, registry, resolveModule: () => scriptModuleRef },
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_ROOT_UNCLOSED",
  );
});

test("imports are frozen before body decoding", () => {
  assert.throws(
    () => decodeText(
      {
        name: "late.svml",
        text: `<svml>
          <import from="@svml/script"/>
          <script><opening>Hello.</opening></script>
          <import from="@svml/script"/>
        </svml>`,
      },
      scriptContext(),
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_IMPORT_AFTER_BODY",
  );
});

test("a body tag whose name merely starts with import is not treated as an import", () => {
  assert.throws(
    () => decodeText(
      { name: "important.svml", text: "<svml><important/></svml>" },
      scriptContext(),
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_UNKNOWN_SURFACE",
  );
});

test("Text also exposes a generic structured Surface tree", () => {
  const source = {
    name: "structured.svml",
    text: `<card title="Hello" target={story}><line>World</line></card>`,
  };
  const parsed = parseStructuredElement(source, 0);
  assert.equal(parsed.nextOffset, source.text.length);
  assert.equal(parsed.element.name, "card");
  assert.deepEqual(parsed.element.attributes.target, { kind: "reference", path: "story" });
  assert.equal(parsed.element.children[0]?.kind, "element");
});

test("a module can use Text's generic structured parser without adding another parser", () => {
  const module = { name: "example.card", version: "1" } as const;
  const type = { module, name: "Card" } as const;
  const implementationDigest = digestOf("example.card/surface@1");
  const manifest: ModuleManifest = {
    format: "svml.module@0",
    name: module.name,
    version: module.version,
    dependencies: [],
    types: [
      {
        name: type.name,
        schema: {
          kind: "object",
          fields: { tag: { schema: { kind: "literal", value: "card" } } },
        },
      },
    ],
    surfaces: [
      {
        name: "card",
        tag: "card",
        mode: "structured",
        outputs: [type],
        implementation: {
          kind: "trusted-frontend-surface",
          locator: "example.card/surface",
          digest: implementationDigest,
        },
      },
    ],
    producers: [],
  };
  const closure = createResolvedClosure([manifest]);
  const registry = new TextSurfaceRegistry();
  registry.registerStructured(module, "card", implementationDigest, ({ element }) => ({
    records: [
      {
        id: "card",
        type,
        value: { kind: "inline", value: { tag: element.name } },
        range: element.range,
      },
    ],
  }));
  const result = decodeText(
    {
      name: "card.svml",
      text: `<svml><import from="example.card@1"/><card title="Hello"><line>World</line></card></svml>`,
    },
    { closure, registry, resolveModule: () => module },
  );

  assert.equal(result.module.records[0]?.id, "card");
  assert.equal(isDigest(result.module.records[0]?.digest ?? ""), true);

  const overreachingRegistry = new TextSurfaceRegistry();
  overreachingRegistry.registerStructured(module, "card", implementationDigest, ({ element }) => ({
    records: [
      {
        id: "other",
        type: { module, name: "Other" },
        value: { kind: "inline", value: { tag: element.name } },
        range: element.range,
      },
    ],
  }));
  assert.throws(
    () => decodeText(
      { name: "overreach.svml", text: `<svml><import from="example.card@1"/><card/></svml>` },
      { closure, registry: overreachingRegistry, resolveModule: () => module },
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_SURFACE_OUTPUT",
  );
});

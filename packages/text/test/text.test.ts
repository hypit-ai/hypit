import { narrativeManifest } from "@narratage/narrative";
import type { CaptionProjection, Narrative, NarrativeDialogueExcerpt, NarrativeExcerpt, NarrativeSpeechExcerpt } from "@narratage/narrative";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, digestOf, isDigest, link } from "@narratage/core";
import type { ModuleManifest } from "@narratage/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@narratage/script";
import {
  TextFrontendError,
  TextSurfaceRegistry,
  decodeText,
  parseStructuredElement,
} from "@narratage/text";

function scriptContext() {
  const closure = createResolvedClosure([narrativeManifest, scriptManifest]);
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

test("Text learns <script> only from an imported Script Manifest", async () => {
  const result = await decodeText(
    {
      name: "talk.svml",
      text: `<svml>
        <import from="@narratage/script@1"/>

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

  assert.equal(result.module.records.length, 5);
  assert.equal(result.module.records[0]?.id, "story");
  assert.equal(result.module.records[0]?.type.name, "Narrative");
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening" && record.type.name === "NarrativeExcerpt"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening.dialogue" && record.type.name === "NarrativeDialogueExcerpt"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening.speech" && record.type.name === "NarrativeSpeechExcerpt"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.caption" && record.type.name === "CaptionProjection"), true);
  assert.equal(result.sourceMaps.length, 1);
  assert.doesNotThrow(() => link(scriptContext().closure, [result.module]));
});

test("the same Script meaning has the same authored Record digest across reflow", async () => {
  const compact = await decodeText(
    {
      name: "compact.svml",
      text: `<svml><import from="@narratage/script"/><script id="story"><opening><ALICE>Hello.<BOB>Hi.</opening></script></svml>`,
    },
    scriptContext(),
  );
  const multiline = await decodeText(
    {
      name: "multiline.svml",
      text: `<svml>
        <import from="@narratage/script"/>
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
  assert.equal(compact.module.records[1]?.digest, multiline.module.records[1]?.digest);
  assert.notEqual(
    compact.module.records[0]?.origin.kind === "authored" ? compact.module.records[0].origin.sourceDigest : undefined,
    multiline.module.records[0]?.origin.kind === "authored" ? multiline.module.records[0].origin.sourceDigest : undefined,
  );
});

test("without the import, Text has no hard-coded knowledge of Script", async () => {
  await assert.rejects(
    decodeText(
      { name: "unknown.svml", text: "<svml><script><opening>Hello.</opening></script></svml>" },
      scriptContext(),
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_UNKNOWN_SURFACE",
  );
});

test("a raw Surface cannot consume the Text document close", async () => {
  const closure = createResolvedClosure([narrativeManifest, scriptManifest]);
  const registry = new TextSurfaceRegistry();
  registry.registerRaw(
    scriptModuleRef,
    "script",
    scriptSurfaceImplementationDigest,
    (input) => ({
      nextOffset: input.source.length,
      records: [],
      components: [],
      fragments: [],
    }),
  );
  await assert.rejects(
    decodeText(
      {
        name: "swallowed.svml",
        text: `<svml><import from="@narratage/script"/><script><opening>Hello.</opening></script></svml>`,
      },
      { closure, registry, resolveModule: () => scriptModuleRef },
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_ROOT_UNCLOSED",
  );
});

test("imports are frozen before body decoding", async () => {
  await assert.rejects(
    decodeText(
      {
        name: "late.svml",
        text: `<svml>
          <import from="@narratage/script"/>
          <script><opening>Hello.</opening></script>
          <import from="@narratage/script"/>
        </svml>`,
      },
      scriptContext(),
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_IMPORT_AFTER_BODY",
  );
});

test("a body tag whose name merely starts with import is not treated as an import", async () => {
  await assert.rejects(
    decodeText(
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

test("a module can use Text's generic structured parser without adding another parser", async () => {
  const module = { name: "example.card", version: "1" } as const;
  const type = { module, name: "Card" } as const;
  const implementationDigest = digestOf("example.card/surface@1");
  const manifest: ModuleManifest = {
    format: "svml.module@1",
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
    capabilities: [],
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
    components: [],
    fragments: [],
  }));
  const result = await decodeText(
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
    components: [],
    fragments: [],
  }));
  await assert.rejects(
    decodeText(
      { name: "overreach.svml", text: `<svml><import from="example.card@1"/><card/></svml>` },
      { closure, registry: overreachingRegistry, resolveModule: () => module },
    ),
    (error: unknown) => error instanceof TextFrontendError && error.code === "TEXT_SURFACE_OUTPUT",
  );
});

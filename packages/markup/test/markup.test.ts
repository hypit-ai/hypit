import { narrativeManifest } from "@narratage/narrative";
import type { Narrative, NarrativeExcerpt } from "@narratage/narrative";
import { textManifest } from "@narratage/text";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure, digestOf, isDigest } from "@narratage/core";
import type { ModuleManifest } from "@narratage/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptModuleRef,
  scriptSurfaceImplementationDigest,
} from "@narratage/script";
import {
  MarkupFrontendError,
  MarkupSurfaceRegistry,
  decodeMarkup,
  parseStructuredElement,
} from "@narratage/markup";

function scriptContext() {
  const closure = createResolvedClosure([narrativeManifest, textManifest, scriptManifest]);
  const registry = new MarkupSurfaceRegistry();
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

test("Markup learns <script> only from an imported Script Manifest", async () => {
  const result = await decodeMarkup(
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

  assert.equal(result.module.records.length, 6);
  assert.equal(result.module.records[0]?.id, "story");
  assert.equal(result.module.records[0]?.type.name, "Narrative");
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening" && record.type.name === "NarrativeExcerpt"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening.dialogue" && record.type.name === "Text"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.segment.opening.speech" && record.type.name === "Text"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.caption" && record.type.name === "CaptionDisplaySequence"), true);
  assert.equal(result.module.records.some((record) =>
    record.id === "story.caption.correspondence" && record.type.name === "CaptionCorrespondence"), true);
  assert.equal(result.sourceMaps.length, 1);
});

test("the same Script meaning has the same authored Record digest across reflow", async () => {
  const compact = await decodeMarkup(
    {
      name: "compact.svml",
      text: `<svml><import from="@narratage/script"/><script id="story"><opening><ALICE>Hello.<BOB>Hi.</opening></script></svml>`,
    },
    scriptContext(),
  );
  const multiline = await decodeMarkup(
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
});

test("without the import, Markup has no hard-coded knowledge of Script", async () => {
  await assert.rejects(
    decodeMarkup(
      { name: "unknown.svml", text: "<svml><script><opening>Hello.</opening></script></svml>" },
      scriptContext(),
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_UNKNOWN_SURFACE",
  );
});

test("a raw Surface cannot consume the Markup document close", async () => {
  const closure = createResolvedClosure([narrativeManifest, textManifest, scriptManifest]);
  const registry = new MarkupSurfaceRegistry();
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
    decodeMarkup(
      {
        name: "swallowed.svml",
        text: `<svml><import from="@narratage/script"/><script><opening>Hello.</opening></script></svml>`,
      },
      { closure, registry, resolveModule: () => scriptModuleRef },
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_ROOT_UNCLOSED",
  );
});

test("imports are frozen before body decoding", async () => {
  await assert.rejects(
    decodeMarkup(
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
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_IMPORT_AFTER_BODY",
  );
});

test("a body tag whose name merely starts with import is not treated as an import", async () => {
  await assert.rejects(
    decodeMarkup(
      { name: "important.svml", text: "<svml><important/></svml>" },
      scriptContext(),
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_UNKNOWN_SURFACE",
  );
});

test("Markup also exposes a generic structured Surface tree", () => {
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

test("a module can use Markup's generic structured parser without adding another parser", async () => {
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
  const registry = new MarkupSurfaceRegistry();
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
  const result = await decodeMarkup(
    {
      name: "card.svml",
      text: `<svml><import from="example.card@1"/><card title="Hello"><line>World</line></card></svml>`,
    },
    { closure, registry, resolveModule: () => module },
  );

  assert.equal(result.module.records[0]?.id, "card");
  assert.equal(isDigest(result.module.records[0]?.digest ?? ""), true);

  const overreachingRegistry = new MarkupSurfaceRegistry();
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
    decodeMarkup(
      { name: "overreach.svml", text: `<svml><import from="example.card@1"/><card/></svml>` },
      { closure, registry: overreachingRegistry, resolveModule: () => module },
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_SURFACE_OUTPUT",
  );
});

import { narrativeManifest } from "@hypit/narrative";
import type { Narrative, NarrativeExcerpt } from "@hypit/narrative";
import { textManifest } from "@hypit/text";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure } from "@hypit/core";
import type { ModuleManifest } from "@hypit/protocol";
import {
  decodeScriptSurface,
  scriptManifest,
  scriptMarkupSurfaces,
  scriptModuleRef,
} from "@hypit/script";
import {
  MarkupFrontendError,
  MarkupSurfaceRegistry,
  decodeMarkup,
  parseStructuredElement,
} from "@hypit/markup";

function scriptContext() {
  const closure = createResolvedClosure([narrativeManifest, textManifest, scriptManifest]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerRaw({
    module: scriptModuleRef,
    declaration: scriptMarkupSurfaces[0]!,
    handler: decodeScriptSurface,
  });
  return {
    closure,
    registry,
    resolveModule: () => scriptModuleRef,
  } as const;
}

test("Script teaches Markup <script> only through its imported Manifest", async () => {
  const result = await decodeMarkup(
    {
      name: "talk.svml",
      text: `<svml>
        <import from="@hypit/script@1"/>

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

  assert.equal(result.records.length, 6);
  assert.equal(result.records[0]?.id, "story");
  assert.equal(result.records[0]?.type.name, "Narrative");
  assert.equal(result.records.some((record) =>
    record.id === "story.segment.opening" && record.type.name === "NarrativeExcerpt"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.segment.opening.dialogue" && record.type.name === "Text"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.segment.opening.speech" && record.type.name === "Text"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.caption" && record.type.name === "CaptionDisplaySequence"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.caption.correspondence" && record.type.name === "CaptionCorrespondence"), true);
});

test("the same Script meaning has the same authored Record digest across reflow", async () => {
  const compact = await decodeMarkup(
    {
      name: "compact.svml",
      text: `<svml><import from="@hypit/script@1"/><script id="story"><opening><ALICE>Hello.<BOB>Hi.</opening></script></svml>`,
    },
    scriptContext(),
  );
  const multiline = await decodeMarkup(
    {
      name: "multiline.svml",
      text: `<svml>
        <import from="@hypit/script@1"/>
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

  assert.deepEqual(compact.records, multiline.records);
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
  registry.registerRaw({
    module: scriptModuleRef,
    declaration: scriptMarkupSurfaces[0]!,
    handler: (input) => ({
      nextOffset: input.source.length,
      records: [],
      components: [],
      fragments: [],
    }),
  });
  await assert.rejects(
    decodeMarkup(
      {
        name: "swallowed.svml",
        text: `<svml><import from="@hypit/script@1"/><script><opening>Hello.</opening></script></svml>`,
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
          <import from="@hypit/script@1"/>
          <script><opening>Hello.</opening></script>
          <import from="@hypit/script@1"/>
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
  const cardSurface = {
    name: "card",
    tag: "card",
    mode: "structured",
    outputs: [type],
  } as const;
  const manifest: ModuleManifest = {
    format: "hypit.module@1",
    name: module.name,
    version: module.version,
    dependencies: [],
    types: [
      {
        name: type.name,
      },
    ],
    capabilities: [],
    producers: [],
  };
  const closure = createResolvedClosure([manifest]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerStructured({ module, declaration: cardSurface, handler: ({ element }) => ({
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
  }) });
  const result = await decodeMarkup(
    {
      name: "card.svml",
      text: `<svml><import from="example.card@1"/><card title="Hello"><line>World</line></card></svml>`,
    },
    { closure, registry, resolveModule: () => module },
  );

  assert.equal(result.records[0]?.id, "card");

  const overreachingRegistry = new MarkupSurfaceRegistry();
  overreachingRegistry.registerStructured({ module, declaration: cardSurface, handler: ({ element }) => ({
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
  }) });
  await assert.rejects(
    decodeMarkup(
      { name: "overreach.svml", text: `<svml><import from="example.card@1"/><card/></svml>` },
      { closure, registry: overreachingRegistry, resolveModule: () => module },
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_SURFACE_OUTPUT",
  );
});

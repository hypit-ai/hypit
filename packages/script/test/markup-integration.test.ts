import { narrativeManifest } from "@hypit/narrative";
import { captionManifest } from "@hypit/caption";
import { narrativeCaptionManifest } from "@hypit/narrative-caption";
import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import { textManifest } from "@hypit/text";
import assert from "node:assert/strict";
import test from "node:test";

import { createResolvedClosure } from "@hypit/kernel";
import type { ModuleManifest } from "@hypit/protocol";
import {
  decodeScriptSurface,
  narrativeType,
  scriptManifest,
  scriptMarkupSurfaces,
  scriptModuleRef,
  parseScript,
} from "@hypit/script";
import {
  MarkupFrontendError,
  MarkupSurfaceRegistry,
  decodeMarkup,
  parseStructuredElement,
} from "@hypit/markup";

function scriptContext() {
  const closure = createResolvedClosure([captionManifest, narrativeManifest, narrativeCaptionManifest, textManifest, scriptManifest]);
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

test("Script's raw boundary scanner respects escapes before comments and closing tags", async () => {
  const body = String.raw`<line>Show \<!-- and \</script> literally. \\<!-- </script> is a comment --> Done.</line>`;
  const source = `<svml><import from="@hypit/script@1"/><script id="story">${body}</script></svml>`;
  const result = await decodeMarkup({ name: "escapes.svml", text: source }, scriptContext());
  const speech = result.records.find(record => record.id === "story.segment.line.speech")!;
  assert.deepEqual(speech.value, ({ value: parseScript("body", body).serializations.speech }));
});

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
    record.id === "story.segment.opening" && record.type.name === "NarrativeSegmentRef"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.segment.opening.dialogue" && record.type.name === "Text"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.segment.opening.speech" && record.type.name === "Text"), true);
  assert.equal(result.records.some((record) =>
    record.id === "story.caption" && record.type.name === "CaptionDocument"), true);
  const captionBinding = result.records.find((record) => record.id === "story.caption-binding");
  assert.equal(captionBinding?.type.name, "NarrativeCaptionBinding");
  if (captionBinding !== undefined) {
    assert.equal((captionBinding.value as { readonly id?: string }).id, "story.caption-binding");
  }
  assert.deepEqual(result.identities, [{ namespace: narrativeType, id: "story" }]);
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
  const closure = createResolvedClosure([captionManifest, narrativeManifest, narrativeCaptionManifest, textManifest, scriptManifest]);
  const registry = new MarkupSurfaceRegistry();
  registry.registerRaw({
    module: scriptModuleRef,
    declaration: scriptMarkupSurfaces[0]!,
    handler: (input) => ({
      nextOffset: input.source.length,
      records: [],
      components: [],
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
        value: ({ tag: element.name }),
        range: element.range,
      },
    ],
    components: [],
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
        value: ({ tag: element.name }),
        range: element.range,
      },
    ],
    components: [],
  }) });
  await assert.rejects(
    decodeMarkup(
      { name: "overreach.svml", text: `<svml><import from="example.card@1"/><card/></svml>` },
      { closure, registry: overreachingRegistry, resolveModule: () => module },
    ),
    (error: unknown) => error instanceof MarkupFrontendError && error.code === "MARKUP_SURFACE_OUTPUT",
  );
});

test("a wordless Script publishes its Segment and an empty CaptionDocument", async () => {
  const result = await decodeMarkup({
    name: "wordless.svml",
    text: '<svml><import from="@hypit/script@1"/><script id="story"><empty></empty></script></svml>',
  }, scriptContext());
  const narrative = result.records.find((record) => record.id === "story")!;
  const value = narrative.value as unknown as Narrative;
  assert.deepEqual(value.tokens, []);
  assert.equal(value.segments[0]?.id, "empty");
  assert.ok(result.records.some((record) => record.id === "story.segment.empty"));
  assert.deepEqual(result.records.find((record) => record.id === "story.caption")?.value, ({ id: "story.caption", units: [], words: [], cues: [] }));
});

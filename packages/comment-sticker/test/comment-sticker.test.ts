import { sealTimeline, timelineTypes } from "@hypit/timeline";
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureResource } from "../../../test/fixture-resource.js";
import { timelineFixture } from "../../../test/timeline-fixture.js";
import { projectProgramWindow } from "../../../test/temporal-fixture.js";

import { blobTypes } from "@hypit/blob";
import { compileHtmlProgram } from "@hypit/html-program";
import type { FontArtifactRef, FontStackRef } from "@hypit/media";
import { mediaTypes } from "@hypit/media";
import { spatialTypes } from "@hypit/spatial";
import { recipeType } from "@hypit/recipe";
import type { Recipe } from "@hypit/recipe";
import { parseStructuredElement } from "@hypit/markup";
import type { SurfaceResolvedReference } from "@hypit/markup";
import { sealText } from "@hypit/text";
import { textTypes } from "@hypit/text";
import { temporalTypes } from "@hypit/temporal";

import {
  appendProjectedCommentSticker,
  commentStickerProducers,
  commentStickerTypes,
  createCommentStickerSet,
  createCommentStickerContent,
  decodeCommentStickerStyle,
  decodeCommentStickerStyleSurface,
  decodeCommentStickerTrackSurface,
  finalizeCommentSticker,
  renderCommentSticker,
  sealCommentStickerHeader,
  sealCommentStickerItemSpec,
  setCommentStickerContentText,
} from "../src/index.js";

const font: FontArtifactRef = {
  sources: [{ artifact: { kind: "blob", resource: fixtureResource("comment-sticker-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 800,
  style: "normal",
};
const fonts: FontStackRef = { faces: [font] };
const recipe: Recipe = {

  path: "comment.social",
  properties: { "avatar-fallback": "initial", "body-max-lines": 4 },
};
const style = decodeCommentStickerStyle(recipe, fonts, "social-comment");
const frame = { xPx: 80, yPx: 140, widthPx: 920, heightPx: 360 };
const canvas = { widthPx: 1080, heightPx: 1920 };
const space = sealTimeline({ id: "test-space", frameCount: 90, frameRate: { numerator: 30, denominator: 1 } });
const header = sealCommentStickerHeader({ id: "comments" });
const semantic = timelineFixture(space);

function item(id: string) {
  return sealCommentStickerItemSpec({

    id,
  });
}

function content(meta?: string, author = "@viewer") {
  let value = createCommentStickerContent(sealText("This part finally made the idea click."));
  value = setCommentStickerContentText(value, "author", sealText(author));
  if (meta !== undefined) value = setCommentStickerContentText(value, "meta", sealText(meta));
  return value;
}

function track(meta?: string, author?: string) {
  const spec = item("opening");
  const set = appendProjectedCommentSticker(createCommentStickerSet(), header, space, frame, style, spec, content(meta, author), projectProgramWindow({
    itemId: spec.id, semantic, projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } },
  }));
  return renderCommentSticker(space, finalizeCommentSticker(set, header));
}

test("Comment Sticker is one deterministic self-contained peer VisualTrack", () => {
  const first = track();
  assert.deepEqual(first, track());
  assert.equal(first.presents.length, 1);
  assert.deepEqual(first.presents[0]?.span, { startFrame: 0, endFrameExclusive: 90 });
  assert.equal(first.presents[0]?.elements.some((element) => element.id === "meta"), false);
  assert.equal(JSON.stringify(first).includes("37 replies"), false);
  assert.ok(first.presents[0]?.elements.some((element) => element.id === "avatar-initial"));
  for (const element of first.presents[0]!.elements) assert.equal(element.attributes, undefined);
});

test("the avatar initial is the author's first whole character", () => {
  const initialOf = (author: string) => {
    const element = track(undefined, author).presents[0]?.elements.find((candidate) => candidate.id === "avatar-initial");
    const inline = element?.kind === "text-flow" ? element.document.paragraphs[0]?.inlines[0] : undefined;
    return inline?.kind === "text" ? inline.text : undefined;
  };
  assert.equal(initialOf("@viewer"), "V");
  assert.equal(initialOf("👍🏽fan"), "👍🏽");
  assert.equal(initialOf("🇯🇵traveler"), "🇯🇵");
  assert.equal(initialOf("👩‍💻dev"), "👩‍💻");
  assert.equal(initialOf("e\u0301lodie"), "E\u0301");
});

test("explicit metadata is rendered and the terminal compiler accepts the Track unchanged", () => {
  const rendered = track("Featured comment");
  const meta = rendered.presents[0]?.elements.find((element) => element.id === "meta");
  assert.equal(meta?.kind === "text-flow" ? meta.document.paragraphs[0]?.inlines[0]?.kind === "text"
    ? meta.document.paragraphs[0].inlines[0].text : undefined : undefined, "Featured comment");
  const document = compileHtmlProgram({
    id: "comment-film",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [rendered],
  }, space);
  assert.match(document.html, /data-hypit-element-id="meta"/u);
  assert.match(document.html, /data-hypit-element-id="body"/u);
});

test("SVS controls appearance and local motion but cannot smuggle geometry", () => {
  const changed = decodeCommentStickerStyle({ ...recipe, properties: { background: "#111111", enter: "fade", "enter-frames": 8 } }, fonts, "dark");
  assert.equal(changed.card.background, "#111111");
  assert.equal(changed.motion.enter.durationFrames, 8);
  assert.throws(() => decodeCommentStickerStyle({ ...recipe, properties: { x: 0.2 } }, fonts, "bad"), /does not accept x/u);
});

test("short Sticker windows compose overlapping enter and exit motion instead of rejecting them", () => {
  const compressed = decodeCommentStickerStyle({
    ...recipe,
    properties: {
      enter: "slide-pop",
      "enter-frames": 70,
      exit: "fade-up",
      "exit-frames": 60,
      hold: "none",
    },
  }, fonts, "compressed");
  const spec = item("compressed");
  const set = appendProjectedCommentSticker(
    createCommentStickerSet(), header, space, frame, compressed, spec, content(), projectProgramWindow({
      itemId: spec.id, semantic, projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } },
    }),
  );
  const rendered = renderCommentSticker(space, finalizeCommentSticker(set, header));
  const animation = rendered.presents[0]?.elements.find((element) => element.animation !== undefined)?.animation;
  assert.ok(animation);
  const overlap = animation.keyframes.find((keyframe) => keyframe.atFrame === 45)!;
  const opacity = overlap.style.find((declaration) => declaration.name === "opacity")?.value;
  assert.equal(typeof opacity, "number");
  assert.ok((opacity as number) > 0 && (opacity as number) < 1);
});

function parsed(source: string) {
  return parseStructuredElement({ name: "fixture.svml", text: source }, 0).element;
}
function authored(path: string, type: SurfaceResolvedReference["type"], value: unknown): SurfaceResolvedReference {
  return {
    path,
    ref: { kind: "record", id: path },
    type,
    record: {
      id: path,
      type,
      value: { kind: "inline", value: value as never },
    },
  };
}
const noAsset = () => { throw new Error("No assets are resolved by this test."); };

test("Style Surface consumes an explicit SVS Recipe and exact Font Stack", async () => {
  const refs = new Map([
    ["styles.comment", authored("styles.comment", recipeType, recipe)],
    ["fonts.ui", authored("fonts.ui", mediaTypes.fontStack, fonts)],
  ]);
  const result = await decodeCommentStickerStyleSurface({
    sourceName: "fixture.svml",
    element: parsed('<comment:Style id="social" recipe={styles.comment} font={fonts.ui}/>'),
    resolveReference: (path) => refs.get(path),
    resolveAsset: noAsset,
  });
  assert.equal(result.records[0]?.type.name, commentStickerTypes.style.name);
  assert.equal(result.components.length, 0);
});

test("Track Surface lowers literal and graph Text with a resolved Window to a finite explicit graph", async () => {
  const blob = { kind: "blob" as const, resource: fixtureResource("comment-avatar"), size: 128, mediaType: "image/png" };
  const refs = new Map<string, SurfaceResolvedReference>([
    ["video.timeline", authored("video.timeline", timelineTypes.timeline, semantic)],
    ["layout.comment", authored("layout.comment", spatialTypes.frame, frame)],
    ["social", authored("social", commentStickerTypes.style, style)],
    ["avatar", authored("avatar", blobTypes.blob, blob)],
    ["copy", authored("copy", textTypes.text, sealText("This is graph-supplied comment content."))],
    ["whole", authored("whole", temporalTypes.window, projectProgramWindow({ itemId: "whole", semantic,
      projection: { start: { ref: "timeline.start" }, end: { ref: "timeline.end" } } }))],
  ]);
  const result = await decodeCommentStickerTrackSurface({
    sourceName: "fixture.svml",
    element: parsed(`<comment:Track id="comments" timeline={video.timeline}>
      <comment:Sticker id="one" comment={copy} frame={layout.comment} style={social} avatar={avatar} author="@viewer" meta="Featured" during={whole}/>
    </comment:Track>`),
    resolveReference: (path) => refs.get(path),
    resolveAsset: noAsset,
  });
  assert.equal(result.components.filter((component) => component.outputs.visual !== undefined).length, 1);
  assert.deepEqual(result.fragments.flatMap((fragment) => fragment.operations.map((operation) => operation.producer.name)).sort(), [
    commentStickerProducers.createSet.name,
    commentStickerProducers.createContent.name,
    commentStickerProducers.setContentAuthor.name,
    commentStickerProducers.setContentMeta.name,
    commentStickerProducers.appendItemAvatar.name,
    commentStickerProducers.finalize.name,
        commentStickerProducers.render.name,
  ].sort());
  assert.equal(result.components.find((component) => component.outputs.visual !== undefined)?.outputs.visual, "comments.visual");
});

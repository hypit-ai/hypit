import assert from "node:assert/strict";
import test from "node:test";

import { artifactTypes } from "@narratage/artifact";
import { compileHyperframesDocument } from "@narratage/hyperframes";
import type { FontArtifactRef, FontStackRef } from "@narratage/media";
import { mediaTypes } from "@narratage/media";
import { sealProgramSpace } from "@narratage/program-space";
import { digestOf } from "@narratage/protocol";
import { spatialTypes } from "@narratage/spatial";
import { svsRecipeType } from "@narratage/svs";
import type { SvsRecipe } from "@narratage/svs";
import { parseStructuredElement } from "@narratage/markup";
import type { SurfaceResolvedReference } from "@narratage/markup";
import { sealText } from "@narratage/text";
import { textTypes } from "@narratage/text";

import {
  appendProgramCommentSticker,
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
  sources: [{ artifact: { kind: "blob", digest: digestOf("comment-sticker-font"), size: 1_024, mediaType: "font/woff2" } }],
  weight: 800,
  style: "normal",
};
const fonts: FontStackRef = { faces: [font] };
const recipe: SvsRecipe = {
  contract: "svml.svs-recipe@1",
  path: "comment.social",
  properties: { "avatar-fallback": "initial", "body-max-lines": 4 },
};
const style = decodeCommentStickerStyle(recipe, fonts, "social-comment");
const frame = { xPx: 80, yPx: 140, widthPx: 920, heightPx: 360 };
const canvas = { widthPx: 1080, heightPx: 1920,
  origin: "top-left" as const, xDirection: "right" as const, yDirection: "down" as const, pixelAspect: "square" as const };
const space = sealProgramSpace({ durationSec: 3, frameRate: { numerator: 30, denominator: 1 } });
const header = sealCommentStickerHeader({ contract: "svml.comment-sticker-header@1", id: "comments" });

function item(id: string) {
  return sealCommentStickerItemSpec({
    contract: "svml.comment-sticker-item-spec@1",
    id,
    projection: { start: { ref: "program.start" }, end: { ref: "program.end" } },
    expansion: { kind: "one" },
  });
}

function content(meta?: string) {
  let value = createCommentStickerContent(sealText("This part finally made the idea click."));
  value = setCommentStickerContentText(value, "author", sealText("@viewer"));
  if (meta !== undefined) value = setCommentStickerContentText(value, "meta", sealText(meta));
  return value;
}

function track(meta?: string) {
  const set = appendProgramCommentSticker(createCommentStickerSet(), header, frame, style, space, item("opening"), content(meta));
  return renderCommentSticker(canvas, space, finalizeCommentSticker(set, header));
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

test("explicit metadata is rendered and the terminal compiler accepts the Track unchanged", () => {
  const rendered = track("Featured comment");
  const meta = rendered.presents[0]?.elements.find((element) => element.id === "meta");
  assert.equal(meta?.kind === "text-flow" ? meta.document.paragraphs[0]?.inlines[0]?.kind === "text"
    ? meta.document.paragraphs[0].inlines[0].text : undefined : undefined, "Featured comment");
  const document = compileHyperframesDocument({
    id: "comment-film",
    canvas: { width: 1080, height: 1920, clearColor: "#000000" },
    tracks: [rendered],
  }, space);
  assert.match(document.html, /data-svml-element-id="meta"/u);
  assert.match(document.html, /data-svml-element-id="body"/u);
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
  const set = appendProgramCommentSticker(
    createCommentStickerSet(), header, frame, compressed, space, item("compressed"), content(),
  );
  const rendered = renderCommentSticker(canvas, space, finalizeCommentSticker(set, header));
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
      digest: digestOf(value),
      origin: { kind: "authored" },
    },
  };
}
const noAsset = () => { throw new Error("No assets are resolved by this test."); };

test("Style Surface consumes an explicit SVS Recipe and exact Font Stack", async () => {
  const refs = new Map([
    ["styles.comment", authored("styles.comment", svsRecipeType, recipe)],
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

test("Track Surface lowers mixed program and semantic Stickers to a finite explicit graph", async () => {
  const blob = { kind: "blob" as const, digest: digestOf("comment-avatar"), size: 128, mediaType: "image/png" };
  const refs = new Map<string, SurfaceResolvedReference>([
    ["video.canvas", authored("video.canvas", spatialTypes.canvas, canvas)],
    ["video.space", authored("video.space", { module: { name: "@narratage/program-space", version: "1" }, name: "ProgramSpace" }, space)],
    ["layout.comment", authored("layout.comment", spatialTypes.frame, frame)],
    ["social", authored("social", commentStickerTypes.style, style)],
    ["avatar", authored("avatar", artifactTypes.blob, blob)],
    ["copy", authored("copy", textTypes.text, sealText("This is graph-supplied comment content."))],
  ]);
  const result = await decodeCommentStickerTrackSurface({
    sourceName: "fixture.svml",
    element: parsed(`<comment:Track id="comments" canvas={video.canvas} space={video.space}>
      <comment:Sticker id="one" comment={copy} frame={layout.comment} style={social} avatar={avatar} author="@viewer" meta="Featured" during="program"/>
    </comment:Track>`),
    resolveReference: (path) => refs.get(path),
    resolveAsset: noAsset,
  });
  assert.equal(result.components.length, 1);
  assert.deepEqual(result.fragments[0]?.operations.map((operation) => operation.producer.name).sort(), [
    commentStickerProducers.createSet.name,
    commentStickerProducers.createContent.name,
    commentStickerProducers.setContentAuthor.name,
    commentStickerProducers.setContentMeta.name,
    commentStickerProducers.appendProgramAvatar.name,
    commentStickerProducers.finalize.name,
    commentStickerProducers.render.name,
  ].sort());
  assert.equal(result.components[0]?.outputs.track, "comments.track");
});

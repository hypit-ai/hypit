import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { interpretSource } from "../src/interpret/document.js";
import { injectRuntimeShim } from "../src/preview/runtime-shim.js";
import type { PlaygroundSnapshot } from "../src/shared.js";

const SOURCE = `<?svml using="@narratage/markup@1"?>

<svml>
  <import from="@narratage/script@1"/>
  <import as="seedance" from="@narratage/seedance@1"/>
  <import as="speech" from="@narratage/speech-spine@1"/>
  <import as="media-track" from="@narratage/media-track@1"/>
  <import as="space" from="@narratage/spatial@1"/>
  <import as="film" from="@narratage/film@1"/>
  <import as="studio" source="./studio.svs"/>

  <script id="story">
    <opening><HOST>A @claim shallow preview reads the source@/claim, so the
      @proof timeline is the SVML@/proof, not a file.</opening>
  </script>

  <space:Canvas id="vertical" width="1080" height="1920"/>
  <space:Frame id="speech-frame" within={vertical} left="0%" top="0%" right="100%" bottom="100%"/>
  <space:Frame id="card-a" within={vertical} left="8%" top="16%" right="92%" bottom="46%"/>
  <space:Frame id="card-b" within={vertical} left="12%" top="52%" right="88%" bottom="78%"/>

  <seedance:TextVideo id="take" model="mini" duration="10"/>

  <speech:Spine id="speech" frame-rate="30"
    visual-frame={speech-frame} visual-appearance={studio.speech.visual} visual-z="0">
    <speech:Take video={take.video} segment={story.segment.opening}/>
  </speech:Spine>

  <media-track:Track id="broll" map={timing.map} space={speech.space} canvas={vertical}>
    <media-track:Item id="broll-one" video={take.video} during={story.selection.claim}
      frame={card-a} appearance={studio.media.card} motion={studio.motion.card}/>
    <media-track:Item id="broll-two" video={take.video} during={story.selection.proof}
      frame={card-b} appearance={studio.media.wide}/>
  </media-track:Track>

  <film:Film id="main" canvas={vertical} space={speech.space} appearance={studio.film.vertical}>
    <film:Track source={speech.visual}/>
  </film:Film>
</svml>
`;

const STYLES = `<?svml using="@narratage/svs@1"?>

<sheet version="1">
  film.vertical { background: #09090B; }
  speech.visual { fit: cover; }
  media.card {
    stack-order: 40; fit: cover; playback: hold-start;
    frame-paint: #16161d; clip: rounded; radius: 24; padding: 12 12;
  }
  media.wide { stack-order: 41; fit: cover; playback: hold-start; frame-paint: #1d1620; }
  motion.card {
    enter: slide; enter-frames: 5; enter-direction: up; enter-easing: ease-out;
    exit: fade; exit-frames: 5; exit-easing: ease-in;
  }
</sheet>
`;

async function fixture(): Promise<PlaygroundSnapshot> {
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-preview-"));
  writeFileSync(join(directory, "main.svml"), SOURCE, "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES, "utf8");
  return (await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 })).snapshot;
}

function srcdoc(snapshot: PlaygroundSnapshot): string {
  assert.equal(snapshot.preview.kind, "hyperframes");
  return snapshot.preview.kind === "hyperframes" ? snapshot.preview.srcdoc : "";
}

test("the preview declares the authored canvas and frame domain", async () => {
  const html = srcdoc(await fixture());
  assert.match(html, /data-width="1080"/u);
  assert.match(html, /data-height="1920"/u);
  assert.match(html, /data-fps="30(\/1)?"/u);
});

test("every clip is addressable in the rendered document", async () => {
  // The bounding-box overlay finds a clip's box by this id. It is emitted by
  // HyperFrames from MediaItemProgram.id, so a rename upstream has to fail here
  // rather than silently detach the overlay from the picture.
  const snapshot = await fixture();
  const html = srcdoc(snapshot);
  for (const track of snapshot.tracks) {
    for (const clip of track.clips) {
      assert.ok(
        html.includes(`data-svml-present-id="${clip.id}"`),
        `${clip.id} has no present in the rendered document`,
      );
    }
  }
});

test("the preview references no Artifact, so it needs no build", async () => {
  // Every layer is painted. If material ever leaks in, the resolver in
  // preview/render.ts throws rather than emitting a broken source.
  assert.ok(!srcdoc(await fixture()).includes("svml-artifact://"));
});

test("authored motion reaches the document as real animation", async () => {
  const html = srcdoc(await fixture());
  assert.match(html, /@keyframes/u, "enter/exit motion should compile to keyframes");
  // The document samples those keyframes and then cancels them, so it is the
  // only thing that can place an animated element afterwards.
  assert.match(html, /data-svml-frame-animation/u);
});

test("the shim asks the document to place its own animations", async () => {
  // HyperFrames cancels every CSS animation once it has sampled it. Driving the
  // Web Animations API from out here would silently find nothing to move and
  // leave motion frozen on its first keyframe.
  const injected = injectRuntimeShim("<html><body></body></html>");
  assert.match(injected, /hf-seek/u);
  assert.match(injected, /detail: \{ time: seconds \}/u);
  assert.ok(!injected.includes("getAnimations"), "the shim must not drive WAAPI itself");
});

test("the shim goes inside the document body", async () => {
  const injected = injectRuntimeShim("<html><body><div>x</div></body></html>");
  assert.ok(injected.indexOf("__svmlSeekFrame") < injected.indexOf("</body>"));
  assert.ok(injected.startsWith("<html><body><div>x</div>"));
});

test("the shim seeks real material as well as animations", async () => {
  // A Take backed by a real file renders as <video>, which keeps its own clock
  // and would drift away from the scrubbed frame if it were left alone.
  const injected = injectRuntimeShim("<html><body></body></html>");
  assert.match(injected, /data-media-start/u);
  assert.match(injected, /data-playback-rate/u);
  assert.match(injected, /currentTime/u);
});

test("a document with no body still receives the shim", async () => {
  assert.match(injectRuntimeShim("<div></div>"), /__svmlSeekFrame/u);
});

test("Captions are rendered, timed from the same map as the Tracks", async () => {
  // Cue times come from the Script tokens each Atom corresponds to, so captions
  // land on the same timeline as the B-roll rather than on a second guess.
  const directory = mkdtempSync(join(tmpdir(), "svml-playground-caption-"));
  writeFileSync(join(directory, "main.svml"), SOURCE
    .replace('<import as="film" from="@narratage/film@1"/>',
      '<import as="film" from="@narratage/film@1"/>\n'
      + '  <import as="caption" from="@narratage/caption@1"/>\n'
      + '  <import as="caption-fine" from="@narratage/caption-fine@1"/>\n'
      + '  <import as="fonts" from="@narratage/fonts-open@1"/>')
    .replace('  <film:Film',
      '  <fonts:Stack id="caption-font" family="inter" weight="700" style="normal"/>\n'
      + '  <caption-fine:Style id="base-caption" recipe={studio.caption.base} font={caption-font}/>\n'
      // A Track names a Program, not a Style: the Program is where the Source
      // said which words are set in which Style.
      + '  <caption:Program id="caption-program" display={story.caption} default={base-caption}/>\n'
      + '  <caption-fine:Track id="captions" display={story.caption}\n'
      + '    correspondence={story.caption.correspondence}\n'
      + '    map={timing.map} space={speech.space} program={caption-program}/>\n\n  <film:Film'), "utf8");
  writeFileSync(join(directory, "studio.svs"), STYLES.replace("</sheet>", `
  caption.base {
    cue-min-words: 1; cue-max-words: 5;
    stack-order: 70; x: 0.5; y: 0.86; width: 0.86; anchor-x: center; anchor-y: bottom;
    size: 56; line-height: 1.05; align: center;
    fill: #FFFFFF; stroke-color: #08080A; stroke-width: 2;
    background: #08080ACC; border-color: #FFFFFF20; border-width: 1; padding: 14 22; radius: 16;
    karaoke: trail; karaoke-transition: wipe; active-fill: #FFD54A;
  }
</sheet>`), "utf8");

  const result = await interpretSource({ source: join(directory, "main.svml"), root: directory, revision: 1 });
  const html = result.snapshot.preview.kind === "hyperframes" ? result.snapshot.preview.srcdoc : "";
  assert.match(html, /@font-face/u, "the exact face an author chose is embedded");
  assert.match(result.snapshot.provenance.note, /Caption Cues timed from the same map/u);
  // The words on screen are the words in the Script.
  assert.match(html, /shallow/u);
  // A Cue must not be placed outside the program it belongs to.
  const fps = result.snapshot.space.frameRate.numerator / result.snapshot.space.frameRate.denominator;
  const last = [...html.matchAll(/data-start="([\d.]+)" data-duration="([\d.]+)"/gu)]
    .map(([, start, duration]) => Number(start) + Number(duration));
  assert.ok(Math.max(...last) <= result.snapshot.space.frameCount / fps + 1e-6);
});

import assert from "node:assert/strict";
import test from "node:test";

import { scriptBody } from "../src/authoring.js";
import { reviewPlan } from "../src/plan.js";

const SVML = `<?svml using="@hypit/markup@1"?>
<svml version="1">
  <import as="story" from="@hypit/script@1"/>
  <import as="media-track" from="@hypit/media-track@1"/>
  <script id="story">
    <one><HOST>alpha bravo @claim charlie delta @/claim echo.</one>
    <two><HOST>foxtrot @proof golf hotel @/proof india.</two>
  </script>
  <media-track:Track id="broll" semantic={speech.semantic} canvas={vertical}>
    <media-track:Item id="one" media={a.media} during={story.selection.claim}
      frame={card-a} appearance={recipes.media.card}/>
    <media-track:Item id="two" media={b.media} during={story.selection.proof}
      frame={card-b} appearance={recipes.media.wide}/>
  </media-track:Track>
</svml>
`;

const BROLL = [{ id: "broll", tag: "Track", alias: "media-track", specifier: "@hypit/media-track" }];

function planFor(svml: string) {
  return reviewPlan({ svml, svmlPath: "main.svml", scriptBody: scriptBody(svml), drawn: BROLL });
}

// Under-covering is the silent direction: the gate passes, the round runs, and the second design is
// simply never drawn. The two exclusion lists this key is built from will grow as packages are added,
// and widening one by an attribute that actually decides what a picture looks like merges two groups
// into one. That edit has no visible symptom, so it is the one worth pinning.
test("two placements that declare different pictures are two looks, and two that declare the same are one", () => {
  const distinct = planFor(SVML);
  assert.equal(distinct.length, 2, "a different appearance and Frame is a different picture");
  assert.deepEqual(distinct.map((entry) => entry.named), ["selection claim", "selection proof"]);

  // Only the declaration differs between these two runs. The windows, the ids and the media stay put.
  const same = planFor(SVML
    .replace("appearance={recipes.media.wide}", "appearance={recipes.media.card}")
    .replace("frame={card-b}", "frame={card-a}"));
  assert.equal(same.length, 1, "the same declaration over different words is one design, read once");

  // The material each Item names is mocked in the render this plan is for, so two Items differing
  // only in which unbuilt picture they point at draw the identical placeholder.
  const mocked = planFor(SVML
    .replace("appearance={recipes.media.wide}", "appearance={recipes.media.card}")
    .replace("frame={card-b}", "frame={card-a}")
    .replace("media={b.media}", "media={c.media}"));
  assert.equal(mocked.length, 1, "an unbuilt picture is a grey rectangle whichever generation names it");
});

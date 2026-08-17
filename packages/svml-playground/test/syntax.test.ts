import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { tokenizeSvml } from "../src/ui/syntax.js";

const SOURCE = readFileSync(
  new URL("../../../examples/talking-film-broll-preview/main.svml", import.meta.url),
  "utf8",
);

function kindsOf(source: string): readonly string[] {
  return tokenizeSvml(source).map((token) => source.slice(token.start, token.end) + `:${token.kind}`);
}

test("tokens are ordered and never overlap", () => {
  let previous = 0;
  for (const token of tokenizeSvml(SOURCE)) {
    assert.ok(token.start >= previous, `token at ${token.start} overlaps the one before it`);
    assert.ok(token.end > token.start, "a token must cover at least one character");
    previous = token.end;
  }
});

test("the rendered text reconstructs the source exactly", () => {
  // The code pane emits one text node per token and per gap, so any character
  // the tokenizer skipped or double-counted would corrupt the pane and every
  // offset the highlight geometry depends on.
  let rebuilt = "";
  let cursor = 0;
  for (const token of tokenizeSvml(SOURCE)) {
    rebuilt += SOURCE.slice(cursor, token.start) + SOURCE.slice(token.start, token.end);
    cursor = token.end;
  }
  rebuilt += SOURCE.slice(cursor);
  assert.equal(rebuilt, SOURCE);
});

test("the Source Header, tags, attributes and references are distinguished", () => {
  const kinds = kindsOf(`<?svml using="@narratage/markup@1"?>
<svml>
  <space:Frame id="card-a" within={vertical} left="8%"/>
</svml>
`);
  assert.ok(kinds.includes(`<?svml using="@narratage/markup@1"?>:header`));
  assert.ok(kinds.includes("space:Frame:tag"));
  assert.ok(kinds.includes("id:attr"));
  assert.ok(kinds.includes(`"card-a":string`));
  assert.ok(kinds.includes("{vertical}:reference"));
});

test("Script markers and Role Cues are highlighted inside the Script body", () => {
  const kinds = kindsOf(`<svml>
  <script id="story">
    <opening><HOST>A @claim marked phrase@/claim ends here.</opening>
  </script>
</svml>
`);
  assert.ok(kinds.includes("@claim:marker"), "an opening marker is a marker");
  assert.ok(kinds.includes("@/claim:marker"), "a closing marker is a marker");
  assert.ok(kinds.includes("HOST:role"), "an upper-case Script tag is a Role Cue");
  assert.ok(kinds.includes("opening:tag"), "a lower-case Script tag is a Segment");
  // Prose between markers stays untokenized, so it renders in the plain colour.
  assert.ok(!kinds.some((entry) => entry.startsWith("marked phrase")));
});

test("comments are one token, including any markup inside them", () => {
  const kinds = kindsOf("<svml>\n  <!-- <space:Frame id=\"x\"/> -->\n</svml>\n");
  assert.ok(kinds.includes(`<!-- <space:Frame id="x"/> -->:comment`));
  assert.ok(!kinds.includes("space:Frame:tag"), "markup inside a comment is not a tag");
});

test("an unterminated construct consumes the rest rather than looping", () => {
  for (const broken of ["<?svml using=", "<!-- open", "<space:Frame id=\"x", "<space:Frame id={x"]) {
    const tokens = tokenizeSvml(broken);
    assert.ok(tokens.length > 0, `${broken} produced no tokens`);
    assert.ok(tokens.at(-1)!.end <= broken.length);
  }
});

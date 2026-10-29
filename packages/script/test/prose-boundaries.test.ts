import assert from "node:assert/strict";
import test from "node:test";
import { adjustScriptMoment, captionDocument, narrativeCaptionBinding, parseScript, serializeCaption, serializeSpeech } from "@hypit/script";

const parse = (text: string) => parseScript("boundary", `<line>${text}</line>`);
const caption = (text: string) => {
  const document = captionDocument(parse(text), "caption", "story");
  return document.words.map(word => word.separatorBefore + word.text).join("");
};

test("annotations cannot create speech boundaries inside words or attached punctuation", () => {
  for (const body of ['hel@{beat!}lo', '“@{beat!}测试”', 'hello@{beat!}, world',
    'hel{emphasis}lo', '한{emphasis}글', 'hel||lo', '1,||000-word essay', '<hel{emphasis}lo|hello>', '<hel{emphasis}lo|>']) {
    assert.throws(() => parse(body), /SCRIPT_(?:MARKER_TOKEN_BOUNDARY|CAPTION_BREAK_TOKEN_BOUNDARY|ATTRIBUTE_TARGET)/u, body);
  }
  assert.equal(caption('@{beat!}“测试”'), '“测试”');
  assert.equal(caption('hello,@{beat!} world'), 'hello, world');
});

test("comments do not divide words, and source edits retain the comment", () => {
  const source = '<line>hel<!-- note -->lo 한<!-- 설명 -->글. @{beat!}</line>';
  const parsed = parseScript("boundary", source);
  assert.deepEqual(parsed.tokens.map(token => token.text), ['hello', '한글']);
  assert.equal(serializeSpeech(parsed), 'hello 한글.');
  const changed = adjustScriptMoment({ sourceName: "boundary", source, parsed,
    adjustment: { id: 'beat', anchorId: parsed.tokens[0]!.startAnchorId } });
  assert.equal(changed, '<line>@{beat!}hel<!-- note -->lo 한<!-- 설명 -->글. </line>');
});

test("display attributes follow the complete prose across zero-width annotations", () => {
  for (const body of [
    'hello<!-- note -->{emphasis} world.',
    'hello@{beat!}{emphasis} world.',
    '<hello@{beat!}{emphasis} world.|>',
  ]) {
    const parsed = parse(body);
    const document = captionDocument(parsed, "caption", "story");
    assert.equal(document.words.map(word => word.separatorBefore + word.text).join(""), "hello world.");
    assert.deepEqual(document.words[0]!.attributes, [{ name: "emphasis", value: true }]);
  }
  for (const body of ['hello <!-- note -->{emphasis}', 'hello @{beat!}{emphasis}', '<hello @{beat!}{emphasis}|>']) {
    assert.throws(() => parse(body), /SCRIPT_ATTRIBUTE_TARGET/u);
  }
});

test("a Dual's explicit speech must supply correspondence for its display", () => {
  for (const body of ['<API|...>', '<hello|@{beat!}!!!>', '<|!!!>', '<API|@{beat!}>']) {
    assert.throws(() => parse(body), /SCRIPT_DUAL_EMPTY/u);
  }
  assert.equal(caption('<😀|smile> <API|A P I>'), '😀 API');
});

test("Dual display spelling does not require speech characters", () => {
  for (const [body, expected] of [
    ['<😀|smile>', '😀'], ['<❤️|love>', '❤️'], ['<.|dot>', '.'],
    ['<!?|surprise>', '!?'], ['“<测试|>”', '“测试”'], ['<😀{emphasis}|smile>', '😀'],
  ]) assert.equal(caption(body!), expected, body);
});

test("explicit and shared Dual attributes address visible words, not prior attribute syntax", () => {
  for (const body of ['<one{emphasis} two{strong}|one two>', '<one{emphasis} two{strong}|>',
    '<하나{emphasis} 둘{strong}|하나 둘>']) {
    const document = captionDocument(parse(body), 'caption', 'story');
    assert.deepEqual(document.words.map(word => word.attributes), [
      [{ name: 'emphasis', value: true }], [{ name: 'strong', value: true }],
    ]);
  }
});

test("explicit groups keep internal speech anchors while display separators stay authored", () => {
  const parsed = parse('<组@{beat!}件{emphasis}化|> 3D 한글');
  assert.equal(serializeCaption(parsed), '组件化 3D 한글');
  const document = captionDocument(parsed, 'caption', 'story');
  assert.deepEqual(narrativeCaptionBinding(parsed, "caption", "story").units[0]!.sourceTokenIds,
    parsed.tokens.slice(0, 3).map(token => token.id));
  assert.equal(parsed.moments[0]!.anchorId, parsed.tokens[1]!.startAnchorId);
  assert.equal(document.words.map(word => word.separatorBefore + word.text).join(''), '组件化 3D 한글');
});

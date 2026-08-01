import { elements, numberAttr, stringAttr } from "./helpers.mjs";

function fail(message) {
  throw new Error(message);
}

export default {
  abiVersion: "1",
  project(context) {
    const script = context.resolve(context.element.attributes.script);
    const semantic = context.resolve(context.element.attributes.semantic);
    if (!script?.semanticIndex) fail("caption-planner requires NarrativeIR");
    if (semantic?.contract !== "svml.complete-semantic-map.v1") {
      fail("caption-planner requires CompleteSemanticMap");
    }
    if (semantic.semanticIndexDigest !== script.semanticIndex.digest) {
      fail("caption-planner SemanticMap does not match Script");
    }
    const points = new Map(semantic.anchors.map(anchor => [anchor.identity, anchor.point.frame]));
    const words = script.tokens.map(token => ({
      ...token,
      startFrame: points.get(token.startAnchorId),
      endFrameExclusive: points.get(token.endAnchorId),
    }));
    const maxWords = Math.max(1, Math.round(numberAttr(context.element, "maxWords", 3)));
    const atomsByStart = new Map(script.captionAtoms.map(atom => [atom.startToken, atom]));
    const cues = [];
    for (const segment of script.segments) {
      const units = [];
      let token = segment.tokenStart;
      while (token < segment.tokenEnd) {
        const atom = atomsByStart.get(token);
        if (atom) {
          units.push({ startToken: atom.startToken, endTokenExclusive: atom.endTokenExclusive });
          token = atom.endTokenExclusive;
        } else {
          units.push({ startToken: token, endTokenExclusive: token + 1 });
          token += 1;
        }
      }
      for (let index = 0; index < units.length; index += maxWords) {
        const group = units.slice(index, index + maxWords);
        cues.push({
          id: `cue-${cues.length + 1}`,
          startToken: group[0].startToken,
          endTokenExclusive: group.at(-1).endTokenExclusive,
        });
      }
    }
    const frameRangesForRole = role => script.turns
      .filter(turn => turn.role === role)
      .map(turn => ({
        startFrame: words[turn.tokenStart]?.startFrame,
        endFrameExclusive: words[turn.tokenEndExclusive - 1]?.endFrameExclusive,
      }))
      .filter(range => Number.isInteger(range.startFrame) && Number.isInteger(range.endFrameExclusive));
    const annotations = [];
    for (const item of elements(context, "annotate")) {
      const role = item.attributes.role;
      const during = item.attributes.during;
      if ((role === undefined) === (during === undefined)) {
        fail(`<annotate id="${stringAttr(item, "id")}"> requires exactly one of role or during`);
      }
      const ranges = role !== undefined
        ? frameRangesForRole(stringAttr(item, "role"))
        : context.selection(during, "annotate.during");
      for (const [occurrence, range] of ranges.entries()) {
        const selected = words.filter(word =>
          word.startFrame < range.endFrameExclusive
          && word.endFrameExclusive > range.startFrame);
        if (!selected.length) continue;
        annotations.push({
          id: `${stringAttr(item, "id")}:${occurrence + 1}`,
          kind: stringAttr(item, "kind"),
          startToken: selected[0].index,
          endTokenExclusive: selected.at(-1).index + 1,
          ...(typeof item.attributes.value === "string" ? { value: item.attributes.value } : {}),
        });
      }
    }
    const plannerDigest = context.digest({
      implementation: context.instance.executionDigest,
      maxWords,
    });
    const payload = {
      contract: "svml.caption-plan.v1",
      semanticIndexDigest: script.semanticIndex.digest,
      basisDigest: semantic.basisDigest,
      cues,
      annotations,
      plannerDigest,
    };
    return { outputs: { plan: { ...payload, planDigest: context.digest(payload) } } };
  },
};

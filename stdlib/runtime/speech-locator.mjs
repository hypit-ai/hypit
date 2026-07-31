function normalizeWord(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

function fail(message) {
  throw new Error(message);
}

export default {
  abiVersion: "1",
  project(context) {
    const narrative = context.element.attributes.script;
    const production = context.element.attributes.basis;
    const evidenceValue = context.element.attributes.evidence;
    const evidence = evidenceValue?.data ?? evidenceValue;
    if (!narrative?.semanticIndex) fail("speech-locator requires NarrativeIR");
    if (production?.contract !== "svml.temporal-basis-production.v1") {
      fail("speech-locator requires TemporalBasisProduction");
    }
    if (evidence?.contract !== "svml.speech-alignment.v1") fail("unsupported alignment evidence");
    const basis = production.basis;
    const fps = basis.frameRate.numerator / basis.frameRate.denominator;
    if (Math.round(evidence.durationSec * fps) !== basis.durationFrames) {
      fail("alignment duration does not match ProgramBasis");
    }
    if (evidence.words.length !== narrative.tokens.length) fail("alignment token cardinality mismatch");
    if (evidence.segments.length !== narrative.segments.length) fail("alignment Segment cardinality mismatch");
    const segments = new Map(evidence.segments.map(segment => [segment.id, segment]));
    if (segments.size !== evidence.segments.length) fail("alignment repeats a Segment id");
    const words = new Map();
    const previousBySegment = new Map();
    for (const [index, token] of narrative.tokens.entries()) {
      const word = evidence.words[index];
      const segment = segments.get(token.segmentId);
      if (!word || !segment || word.segmentId !== token.segmentId || normalizeWord(word.text) !== token.normalized) {
        fail(`alignment token ${index + 1} does not match Script`);
      }
      if (word.startSec < segment.startSec || word.endSec < word.startSec || word.endSec > segment.endSec) {
        fail(`alignment token ${index + 1} falls outside Segment`);
      }
      const previous = previousBySegment.get(word.segmentId);
      if (previous && word.startSec < previous.endSec - 1e-6) fail(`alignment overlaps inside Segment ${word.segmentId}`);
      previousBySegment.set(word.segmentId, word);
      words.set(token.id, word);
    }
    for (const [index, scriptSegment] of narrative.segments.entries()) {
      const segment = segments.get(scriptSegment.id);
      if (!segment) fail(`alignment is missing Segment ${scriptSegment.id}`);
      const previousScript = narrative.segments[index - 1];
      const previous = previousScript ? segments.get(previousScript.id) : undefined;
      if (previous && (segment.startSec < previous.startSec || segment.endSec < previous.endSec)) {
        fail(`alignment reorders Segment ${scriptSegment.id}`);
      }
    }
    const anchors = narrative.semanticIndex.anchors.map(anchor => {
      const segment = segments.get(anchor.segmentId);
      const word = anchor.tokenId ? words.get(anchor.tokenId) : undefined;
      const seconds = anchor.kind === "segment-start"
        ? segment?.startSec
        : anchor.kind === "segment-end"
          ? segment?.endSec
          : anchor.kind === "token-start"
            ? word?.startSec
            : word?.endSec;
      if (seconds === undefined) fail(`alignment is missing anchor ${anchor.id}`);
      return {
        identity: anchor.id,
        point: { basisDigest: basis.basisDigest, frame: Math.round(seconds * fps) },
        quality: "measured",
      };
    });
    const payload = {
      contract: "svml.exact-semantic-map.v1",
      semanticIndexDigest: narrative.semanticIndex.digest,
      basisDigest: basis.basisDigest,
      anchors,
      evidenceDigests: [evidenceValue.contentDigest ?? context.digest(evidence)],
      locatorDigest: context.digest({
        implementation: context.instance.executionDigest,
        quantizationPolicy: "nearest-frame",
      }),
      quantizationPolicy: "nearest-frame",
      ...(evidence.captionCues ? { captionCues: evidence.captionCues } : {}),
    };
    return {
      outputs: {
        map: { ...payload, mapDigest: context.digest(payload) },
      },
    };
  },
};

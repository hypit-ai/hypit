function normalizeWord(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

function fail(message) {
  throw new Error(message);
}

function lcsMatches(tokens, units) {
  const rows = Array.from({ length: tokens.length + 1 }, () =>
    Array(units.length + 1).fill(0));
  for (let left = tokens.length - 1; left >= 0; left -= 1) {
    for (let right = units.length - 1; right >= 0; right -= 1) {
      rows[left][right] = tokens[left].normalized === normalizeWord(units[right].text)
        ? rows[left + 1][right + 1] + 1
        : Math.max(rows[left + 1][right], rows[left][right + 1]);
    }
  }
  const matches = [];
  let left = 0;
  let right = 0;
  while (left < tokens.length && right < units.length) {
    if (
      tokens[left].normalized === normalizeWord(units[right].text)
      && rows[left][right] === rows[left + 1][right + 1] + 1
    ) {
      matches.push([left, right]);
      left += 1;
      right += 1;
    } else if (rows[left + 1][right] >= rows[left][right + 1]) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return matches;
}

function distributeFrames(tokens, startFrame, endFrameExclusive, quality) {
  const weights = tokens.map(token => Math.max(1, [...token.normalized].length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let accumulated = 0;
  return tokens.map((_, index) => {
    const start = startFrame + Math.round((endFrameExclusive - startFrame) * accumulated / total);
    accumulated += weights[index];
    const end = index === tokens.length - 1
      ? endFrameExclusive
      : startFrame + Math.round((endFrameExclusive - startFrame) * accumulated / total);
    return { startFrame: start, endFrameExclusive: Math.max(start, end), quality };
  });
}

function alignSegment(tokens, units, segment, fps, evidenceQuality) {
  const output = Array(tokens.length).fill(undefined);
  const matches = lcsMatches(tokens, units);
  let tokenCursor = 0;
  let unitCursor = 0;
  for (let matchIndex = 0; matchIndex <= matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    const tokenEnd = match?.[0] ?? tokens.length;
    const unitEnd = match?.[1] ?? units.length;
    const tokenRun = tokens.slice(tokenCursor, tokenEnd);
    const unitRun = units.slice(unitCursor, unitEnd);
    if (tokenRun.length) {
      const previous = tokenCursor > 0 ? output[tokenCursor - 1] : undefined;
      const nextUnit = match ? units[unitEnd] : undefined;
      const startFrame = unitRun.length
        ? Math.round(unitRun[0].startSec * fps)
        : previous?.endFrameExclusive ?? Math.round(segment.startSec * fps);
      const endFrame = unitRun.length
        ? Math.round(unitRun.at(-1).endSec * fps)
        : nextUnit
          ? Math.round(nextUnit.startSec * fps)
          : Math.round(segment.endSec * fps);
      const quality = evidenceQuality === "estimated" || !unitRun.length
        ? "estimated"
        : "derived";
      for (const [offset, value] of distributeFrames(
        tokenRun,
        startFrame,
        Math.max(startFrame, endFrame),
        quality,
      ).entries()) output[tokenCursor + offset] = value;
    }
    if (match) {
      const [tokenIndex, unitIndex] = match;
      const unit = units[unitIndex];
      output[tokenIndex] = {
        startFrame: Math.round(unit.startSec * fps),
        endFrameExclusive: Math.round(unit.endSec * fps),
        quality: evidenceQuality === "measured" ? "measured" : "estimated",
      };
      tokenCursor = tokenIndex + 1;
      unitCursor = unitIndex + 1;
    }
  }
  if (output.some(value => !value)) fail(`could not align every Script token in Segment ${segment.id}`);
  return output;
}

function validate(narrative, basis, evidence) {
  if (evidence?.contract !== "svml.speech-timing-evidence.v1") {
    fail("speech-locator requires SpeechTimingEvidence");
  }
  if (!['measured', 'estimated'].includes(evidence.quality)) fail("invalid speech timing quality");
  const fps = basis.frameRate.numerator / basis.frameRate.denominator;
  if (Math.abs(evidence.fps - fps) > 1e-6) fail("speech timing fps does not match ProgramBasis");
  if (Math.round(evidence.durationSec * fps) !== basis.durationFrames) {
    fail("speech timing duration does not match ProgramBasis");
  }
  if (evidence.segments.length !== narrative.segments.length) {
    fail("speech timing Segment cardinality mismatch");
  }
  const segments = new Map(evidence.segments.map(segment => [segment.id, segment]));
  if (segments.size !== evidence.segments.length) fail("speech timing repeats a Segment id");
  for (const [index, scriptSegment] of narrative.segments.entries()) {
    const segment = segments.get(scriptSegment.id);
    if (!segment) fail(`speech timing is missing Segment ${scriptSegment.id}`);
    if (
      !Number.isFinite(segment.startSec)
      || !Number.isFinite(segment.endSec)
      || segment.startSec < 0
      || segment.endSec < segment.startSec
      || segment.endSec > evidence.durationSec + 1e-6
    ) fail(`invalid speech timing window for Segment ${scriptSegment.id}`);
    const previousScript = narrative.segments[index - 1];
    const previous = previousScript ? segments.get(previousScript.id) : undefined;
    if (previous && (segment.startSec < previous.startSec - 1e-6 || segment.endSec < previous.endSec - 1e-6)) {
      fail(`speech timing reorders Segment ${scriptSegment.id}`);
    }
  }
  const previousBySegment = new Map();
  for (const [index, unit] of evidence.units.entries()) {
    const segment = segments.get(unit.segmentId);
    if (
      !segment
      || typeof unit.text !== "string"
      || !Number.isFinite(unit.startSec)
      || !Number.isFinite(unit.endSec)
      || unit.startSec < segment.startSec - 1e-6
      || unit.endSec < unit.startSec
      || unit.endSec > segment.endSec + 1e-6
    ) fail(`speech timing unit ${index + 1} falls outside its Segment`);
    const previous = previousBySegment.get(unit.segmentId);
    if (previous && unit.startSec < previous.endSec - 1e-6) {
      fail(`speech timing units overlap inside Segment ${unit.segmentId}`);
    }
    previousBySegment.set(unit.segmentId, unit);
  }
  return { fps, segments };
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
    const basis = production.basis;
    const { fps, segments } = validate(narrative, basis, evidence);
    const tokenFrames = new Map();
    for (const scriptSegment of narrative.segments) {
      const segment = segments.get(scriptSegment.id);
      const tokens = narrative.tokens.slice(scriptSegment.tokenStart, scriptSegment.tokenEnd);
      const units = evidence.units.filter(unit => unit.segmentId === scriptSegment.id);
      const aligned = alignSegment(tokens, units, segment, fps, evidence.quality);
      tokens.forEach((token, index) => tokenFrames.set(token.id, aligned[index]));
    }
    const anchors = narrative.semanticIndex.anchors.map(anchor => {
      const segment = segments.get(anchor.segmentId);
      const token = anchor.tokenId ? tokenFrames.get(anchor.tokenId) : undefined;
      const frame = anchor.kind === "segment-start"
        ? Math.round(segment.startSec * fps)
        : anchor.kind === "segment-end"
          ? Math.round(segment.endSec * fps)
          : anchor.kind === "token-start"
            ? token?.startFrame
            : token?.endFrameExclusive;
      if (frame === undefined) fail(`speech timing is missing anchor ${anchor.id}`);
      return {
        identity: anchor.id,
        point: { basisDigest: basis.basisDigest, frame },
        quality: token?.quality ?? evidence.quality,
      };
    });
    const payload = {
      contract: "svml.complete-semantic-map.v1",
      semanticIndexDigest: narrative.semanticIndex.digest,
      basisDigest: basis.basisDigest,
      anchors,
      evidenceDigests: [evidenceValue.contentDigest ?? context.digest(evidence)],
      locatorDigest: context.digest({
        implementation: context.instance.executionDigest,
        quantizationPolicy: "nearest-frame",
      }),
      quantizationPolicy: "nearest-frame",
    };
    return { outputs: { map: { ...payload, mapDigest: context.digest(payload) } } };
  },
};

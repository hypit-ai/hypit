/**
 * Build a stand-in SemanticTake for every Segment a Source declares, from the Source alone.
 *
 * A Track timed against speech cannot be projected before the speech exists, and on this route it
 * does not exist: the Build has not run. What the Source does hold is the words themselves and the
 * estimator it already trusts to size its own generations — `estimate:Speech` with a policy Recipe.
 * Running that estimator here produces the same numbers the Source used to order its takes, so this
 * introduces no second clock; it reads the one already written down.
 *
 * What the result is good for: which elements are on screen together, where each sits, at what size
 * and colour. Those follow from word ranges and Recipe values and are exact. What it is not good for
 * is real timing — the delivered speech is not the estimate, and anything measured in seconds waits
 * for `production-gates.md` Gate 3.
 *
 * Tokens are laid across the Segment in proportion to the same syllable count the estimator uses, so
 * a long word occupies more of the window than a short one and the ordering is the Script's.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const from = (path) => new URL(`../../../../packages/${path}`, import.meta.url).href;
const { parseScript } = await import(from("script/src/parser.ts"));
const { estimateSpeechDuration, countSpeechEstimateUnits, resolveSpeechEstimateLanguage } =
  await import(from("estimate/src/program.ts"));
const { speechEstimatePolicyFromRecipe } = await import(from("estimate/src/surface.ts"));

/** The Script body, which `parseScript` takes on its own. */
function scriptBody(svml) {
  const open = /<script\b[^>]*>/u.exec(svml);
  if (open === null) throw new Error("the Source declares no <script>");
  const start = open.index + open[0].length;
  const end = svml.indexOf("</script>", start);
  if (end < 0) throw new Error("the Source's <script> is not closed");
  return { text: svml.slice(start, end), offset: start };
}

/** Every Recipe body in every sheet the Source imports, keyed `alias.path`. */
async function recipeSheets(svml, svmlPath) {
  const sheets = new Map();
  for (const [, alias, source] of svml.matchAll(/<import\s+as="([^"]+)"\s+source="([^"]+\.svs)"/gu)) {
    const text = await readFile(resolve(dirname(svmlPath), source), "utf8").catch(() => undefined);
    if (text === undefined) continue;
    for (const [, name, body] of text.matchAll(/([A-Za-z0-9_.-]+)\s*\{([^}]*)\}/gu)) {
      const properties = {};
      for (const [, key, raw] of body.matchAll(/([a-z][a-z0-9-]*)\s*:\s*([^;]+);/gu)) {
        const value = raw.trim();
        properties[key] = /^-?\d+(\.\d+)?$/u.test(value) ? Number(value) : value;
      }
      sheets.set(`${alias}.${name}`, { path: `${alias}.${name}`, properties });
    }
  }
  return sheets;
}

/**
 * The policy each Segment's duration was estimated with. A Source names it once per Segment through
 * `<estimate:Speech source={story.segment.NAME.speech} policy={recipes.X}/>`, and reading it back is
 * what keeps this on the Source's own basis rather than a second one.
 */
function policiesBySegment(svml, sheets) {
  const policies = new Map();
  const named = new Set();
  for (const [, attributes] of svml.matchAll(/<estimate:Speech\b([^>]*?)\/?>/gsu)) {
    const segment = /\bsource=\{story\.segment\.([A-Za-z0-9_-]+)\.speech\}/u.exec(attributes)?.[1];
    const recipe = /\bpolicy=\{([A-Za-z0-9_.-]+)\}/u.exec(attributes)?.[1];
    if (segment === undefined || recipe === undefined) continue;
    const sheet = sheets.get(recipe);
    if (sheet === undefined) throw new Error(`policy Recipe ${recipe} is not in any imported sheet`);
    named.add(recipe);
    policies.set(segment, speechEstimatePolicyFromRecipe(sheet));
  }
  // A Segment whose take is shared with another Segment carries no estimate of its own, so it has no
  // policy named against it. One policy across the Source settles those; several leaves no basis to
  // pick from, and guessing would put a Segment on a pace the Source never chose for it.
  const shared = named.size === 1 ? policies.get([...policies.keys()][0]) : undefined;
  return { policies, shared, policyCount: named.size };
}

const SILENT_AUDIO = { kind: "blob", digest: `sha256:${"0".repeat(64)}`, size: 1, mediaType: "audio/wav" };

/**
 * @param svmlPath  the Author SVML this Source is written in
 * @param frameRate the Program's frame rate, as a whole number of frames per second
 * @returns one `{ segmentId, take }` per Segment, in Script order
 */
export async function standInTakes(svmlPath, frameRate, focus = {}) {
  const svml = await readFile(svmlPath, "utf8");
  const body = scriptBody(svml);
  const parsed = parseScript(svmlPath, body.text, body.offset);
  const sheets = await recipeSheets(svml, svmlPath);
  const { policies, shared, policyCount } = policiesBySegment(svml, sheets);

  // Which Segment the render is actually looking at. Every other Segment still has to exist — a
  // Speech Track assembles one Take per Segment and an unsatisfied one refuses the whole projection —
  // but nothing needs it at its estimated length. Held to one frame per word it stays legal, keeps
  // its anchors, and stops the renderer drawing a minute of program to show six seconds of it.
  let focused;
  if (focus.segment !== undefined) focused = focus.segment;
  else if (focus.selection !== undefined) {
    const selection = parsed.selections.find((item) => item.id === focus.selection);
    const token = selection?.occurrences[0]?.open.boundary.tokenIndex;
    focused = token === undefined
      ? undefined
      : parsed.segments.find((segment) => token >= segment.tokenStart && token < segment.tokenEndExclusive)?.id;
  }

  const takes = [];
  // Global frame span of every word, in Script order, so a Selection can be turned into a frame
  // range without going near a clock. This is the correspondence the route uses everywhere else:
  // a stretch of the reference is found by its words, and its words are where the Script says.
  const frameOfToken = [];
  let frameCursor = 0;
  for (const segment of parsed.segments) {
    const policy = policies.get(segment.id) ?? shared;
    if (policy === undefined) {
      throw new Error(`Segment ${segment.id} names no estimate:Speech policy, and the Source uses ${policyCount} policies, so there is no single one to fall back to`);
    }
    const tokens = parsed.tokens.slice(segment.tokenStart, segment.tokenEndExclusive);
    const text = tokens.map((token) => token.text).join(" ");
    const seconds = estimateSpeechDuration({ value: text }, policy);
    const frameCount = focused !== undefined && segment.id !== focused
      ? Math.max(1, tokens.length)
      : Math.max(tokens.length, Math.round(seconds * frameRate));

    // Share the Segment's frames out by the estimator's own unit count, so the word order and the
    // relative widths both come from the same place the duration did.
    const language = resolveSpeechEstimateLanguage(text, policy.language);
    const weights = tokens.map((token) => Math.max(1, countSpeechEstimateUnits(token.text, language)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const anchors = [
      { identity: `segment:${segment.id}:start`, frame: 0 },
      { identity: `segment:${segment.id}:end`, frame: frameCount },
    ];
    const placed = [];
    let used = 0;
    for (const [index, token] of tokens.entries()) {
      const start = used;
      // The last token closes the Segment exactly, so rounding never leaves a frame unclaimed.
      used = index === tokens.length - 1
        ? frameCount
        : Math.min(frameCount - (tokens.length - 1 - index), start + Math.max(1, Math.round(frameCount * weights[index] / total)));
      const id = `segment:${segment.id}:token:${index + 1}`;
      placed.push({
        tokenId: id, segmentId: segment.id, text: token.text,
        startAnchorId: `${id}:start`, endAnchorId: `${id}:end`,
        startFrame: start, endFrameExclusive: used,
      });
      anchors.push({ identity: `${id}:start`, frame: start }, { identity: `${id}:end`, frame: used });
    }

    frameOfToken.push(...placed.map((token) => ({ frame: frameCursor + token.startFrame, end: frameCursor + token.endFrameExclusive })));
    takes.push({
      segmentId: segment.id,
      startFrame: frameCursor,
      take: {
        media: {
          timeline: { frameRate: { numerator: frameRate, denominator: 1 }, frameCount },
          audio: { artifact: SILENT_AUDIO, sampleFrames: Math.round(frameCount / frameRate * 48_000) },
        },
        segment: {
          segmentId: segment.id,
          startAnchorId: `segment:${segment.id}:start`,
          endAnchorId: `segment:${segment.id}:end`,
          startFrame: 0,
          endFrameExclusive: frameCount,
        },
        tokens: placed,
        anchors,
      },
    });
    frameCursor += frameCount;
  }

  // Every Selection the Script marks, as the frames its words occupy. Occurrences are unioned, since
  // one Selection id can be marked in several places and they nest freely.
  const selections = new Map();
  for (const selection of parsed.selections) {
    let start = Infinity;
    let end = 0;
    for (const occurrence of selection.occurrences) {
      const first = frameOfToken[occurrence.open.boundary.tokenIndex];
      const last = frameOfToken[occurrence.close.boundary.tokenIndex - 1];
      if (first === undefined || last === undefined) continue;
      start = Math.min(start, first.frame);
      end = Math.max(end, last.end);
    }
    if (start < end) selections.set(selection.id, { startFrame: start, endFrameExclusive: end });
  }
  return { takes, selections, frameCount: frameCursor };
}

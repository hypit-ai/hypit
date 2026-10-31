import { assertBlobRef, canonicalize, canonicalStringify } from "@hypit/hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/hypit/protocol";
import type { VisualProgramElement } from "@hypit/composition";
import { verifyPictureInterpretation } from "@hypit/media";
import type { PictureInterpretation } from "@hypit/media";

export const HTML_VISUAL_FORMAT = "hypit.html-visual@1" as const;

export type HtmlVisualDependency =
  | {
      /** Non-presented package bytes, such as a font or data table. */
      readonly kind: "data";
      readonly artifact: BlobRef;
    }
  | {
      /** One browser-presented still picture with author-owned colour meaning. */
      readonly kind: "picture";
      readonly artifact: BlobRef;
      readonly picture: PictureInterpretation;
    };

export type HtmlVisual = {
  /** HTML fragment. {{child-id}} inserts an owned VisualElement, including frame-sampled video. */
  readonly html: string;
  /** CSS in an @scope rooted at this program's element. */
  readonly css?: string;
  /** Function body with (root, data, context) arguments; returns a synchronous render(localFrame) function. */
  readonly setup?: string;
  readonly data?: CanonicalValue;
  /** Package-owned resource meaning. Timed media must instead be an owned VisualElement slot. */
  readonly dependencies: readonly HtmlVisualDependency[];
};

export type HtmlVisualAuthoring = Omit<HtmlVisual, "dependencies"> & {
  readonly dependencies?: readonly HtmlVisualDependency[];
};

function assertExactKeys(value: object, keys: readonly string[], label: string): void {
  if (canonicalStringify(Object.keys(value).sort()) !== canonicalStringify([...keys].sort())) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
}

function assertDependency(value: unknown, index: number): asserts value is HtmlVisualDependency {
  const label = `HTML visual dependency ${index}`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a typed dependency.`);
  }
  const dependency = value as Partial<HtmlVisualDependency>;
  if (dependency.kind === "data") {
    assertExactKeys(value, ["artifact", "kind"], label);
    const artifact = dependency.artifact;
    assertBlobRef(artifact, `${label}.artifact`);
    if (["audio/", "image/", "video/"].some((prefix) => artifact.mediaType.startsWith(prefix))) {
      throw new Error(`${label} cannot present media as data; use a picture dependency or an owned VisualElement.`);
    }
    return;
  }
  if (dependency.kind === "picture") {
    assertExactKeys(value, ["artifact", "kind", "picture"], label);
    assertBlobRef(dependency.artifact, `${label}.artifact`);
    if (!dependency.artifact.mediaType.startsWith("image/")) {
      throw new Error(`${label}.artifact must declare an image media type.`);
    }
    verifyPictureInterpretation(dependency.picture, `${label}.picture`);
    return;
  }
  throw new Error(`${label} must declare data or picture use.`);
}

export function htmlVisual(value: HtmlVisualAuthoring): VisualProgramElement["program"] {
  const payload = canonicalize({ ...value, dependencies: value.dependencies ?? [] }) as VisualProgramElement["program"]["payload"];
  const dependencies = (payload as unknown as HtmlVisual).dependencies;
  const program = {
    format: HTML_VISUAL_FORMAT,
    payload,
    artifacts: dependencies.map((dependency) => dependency.artifact),
  };
  readHtmlVisual(program);
  return program;
}

export function readHtmlVisual(program: VisualProgramElement["program"]): HtmlVisual {
  if (program.format !== HTML_VISUAL_FORMAT) {
    throw new Error(`HTML renderer does not support visual program format ${program.format}.`);
  }
  const value = program.payload as unknown as HtmlVisual;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("HTML visual payload must be an object.");
  }
  const expectedKeys = ["html", "dependencies",
    ...(value.css === undefined ? [] : ["css"]),
    ...(value.setup === undefined ? [] : ["setup"]),
    ...(value.data === undefined ? [] : ["data"])];
  assertExactKeys(value, expectedKeys, "HTML visual payload");
  if (typeof value.html !== "string"
    || (value.css !== undefined && typeof value.css !== "string")
    || (value.setup !== undefined && typeof value.setup !== "string")
    || !Array.isArray(value.dependencies)) {
    throw new Error("HTML visual requires HTML and optional CSS and setup source.");
  }
  for (const [index, dependency] of value.dependencies.entries()) assertDependency(dependency, index);
  if (new Set(value.dependencies.map((dependency) => dependency.artifact.resource)).size !== value.dependencies.length) {
    throw new Error("HTML visual dependencies must not repeat an Artifact resource.");
  }
  if (!Array.isArray(program.artifacts) || program.artifacts.length !== value.dependencies.length) {
    throw new Error("HTML visual carrier Artifacts do not match its typed dependencies.");
  }
  for (const [index, dependency] of value.dependencies.entries()) {
    assertBlobRef(program.artifacts[index], `HTML visual carrier Artifact ${index}`);
    if (canonicalStringify(program.artifacts[index]) !== canonicalStringify(dependency.artifact)) {
      throw new Error("HTML visual carrier Artifacts do not match its typed dependencies.");
    }
  }
  return value;
}

export function htmlVisualHtml(program: HtmlVisual, children: ReadonlyMap<string, string>): string {
  const used = new Set<string>();
  const result = program.html.replace(/\{\{([^{}]+)\}\}/gu, (_match, name: string) => {
    const child = children.get(name);
    if (child === undefined || used.has(name)) throw new Error(`HTML visual slot ${name} is missing or repeated.`);
    used.add(name);
    return child;
  });
  for (const name of children.keys()) {
    if (!used.has(name)) throw new Error(`HTML visual does not place owned child ${name}.`);
  }
  return result;
}

/** JSON is embedded as data, so author text cannot close the surrounding script element. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

export function htmlVisualScript(entries: readonly {
  readonly id: string;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly clock?: { readonly startFrame: number; readonly endFrameExclusive: number };
  readonly program: Pick<HtmlVisual, "data" | "html" | "setup">;
}[], context: { readonly width: number; readonly height: number } = { width: 0, height: 0 }): string {
  return `(() => {
    const fail = error => { window.__hypitHtmlVisualError = String(error?.stack || error); };
    const entries = ${scriptJson(entries)}.filter(entry =>
      htmlSelectionOverlaps(entry.startFrame, entry.startFrame + entry.durationFrames));
    const renders = entries.map((entry, order) => {
      const root = document.getElementById(entry.id);
      try {
        const render = entry.program.setup === undefined ? () => {} :
          new Function('root', 'data', 'context', entry.program.setup)(root, entry.program.data, {
            durationFrames: entry.clock ? entry.clock.endFrameExclusive - entry.clock.startFrame : entry.durationFrames,
            width: ${context.width},
            height: ${context.height},
          });
        if (typeof render !== 'function') throw new Error('HTML visual setup must return render(localFrame).');
        return { ...entry, order, render, region: undefined };
      } catch (error) { fail(error); return { ...entry, order, render: () => {}, region: undefined }; }
    });
    const workIndex = htmlCreateFrameWorkIndex(renders.map(entry => ({
      startFrame: entry.startFrame,
      endFrameExclusive: entry.startFrame + entry.durationFrames,
      order: entry.order,
      payload: entry,
    })));
    let previousFrame;
    const renderAt = (entry, frame) => {
      const local = frame - (entry.clock?.startFrame ?? entry.startFrame);
      const duration = entry.clock ? entry.clock.endFrameExclusive - entry.clock.startFrame : entry.durationFrames;
      const region = frame < entry.startFrame ? 'before' : frame >= entry.startFrame + entry.durationFrames ? 'after' : 'active';
      // Preserve initial and crossed boundary poses. Active seeks always redraw,
      // including repeated frames after an asynchronously prepared image became ready.
      if (region !== 'active' && entry.region === region) return;
      try {
        const result = entry.render(Math.max(0, Math.min(duration, local)));
        if (result != null && typeof result.then === 'function') {
          // Observe a later rejection, but never let asynchronous drawing race frame capture.
          Promise.resolve(result).catch(fail);
          throw new Error('HTML visual render(localFrame) must be synchronous; prepare asynchronous resources before rendering.');
        }
        entry.region = region;
      }
      catch (error) { fail(error); }
    };
    const apply = frame => {
      if (previousFrame === undefined) {
        // Establish every compiler-owned root's boundary pose once. Later work
        // is limited to active programs and spans crossed by an arbitrary seek.
        for (const entry of renders) renderAt(entry, frame);
      } else {
        const work = new Map();
        for (const item of workIndex.at(frame)) work.set(item.serial, item);
        if (frame !== previousFrame) {
          const startFrame = Math.min(previousFrame, frame);
          const endFrameExclusive = Math.max(previousFrame, frame) + 1;
          for (const item of workIndex.overlapping({ startFrame, endFrameExclusive })) work.set(item.serial, item);
        }
        for (const item of [...work.values()].sort((left, right) => left.order - right.order || left.serial - right.serial)) {
          renderAt(item.payload, frame);
        }
      }
      previousFrame = frame;
    };
    apply(0);
    window.addEventListener('hypit-frame', event => apply(event.detail?.frame));
  })();`;
}

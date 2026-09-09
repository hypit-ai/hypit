import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import type { VisualProgramElement } from "@hypit/composition";

export const BROWSER_PROGRAM_FORMAT = "hypit.browser-program@1" as const;

export type BrowserProgram = {
  /** HTML fragment. {{child-id}} inserts an owned VisualElement, including frame-sampled video. */
  readonly html: string;
  /** CSS in an @scope rooted at this program's element. */
  readonly css?: string;
  /** Function body with (root, data) arguments; returns a synchronous render(localFrame) function. */
  readonly setup?: string;
  readonly data?: CanonicalValue;
};

export function browserProgram(value: BrowserProgram, artifacts: readonly BlobRef[] = []): VisualProgramElement["program"] {
  return { format: BROWSER_PROGRAM_FORMAT, payload: canonicalize(value) as VisualProgramElement["program"]["payload"], artifacts: [...artifacts] };
}

export function readBrowserProgram(program: VisualProgramElement["program"]): BrowserProgram {
  if (program.format !== BROWSER_PROGRAM_FORMAT) {
    throw new Error(`HyperFrames does not support visual program format ${program.format}.`);
  }
  const value = program.payload as unknown as BrowserProgram;
  if (value === null || typeof value !== "object" || typeof value.html !== "string"
    || (value.css !== undefined && typeof value.css !== "string")
    || (value.setup !== undefined && typeof value.setup !== "string")) {
    throw new Error("Browser program requires HTML and optional CSS and setup source.");
  }
  return value;
}

export function browserProgramHtml(program: BrowserProgram, children: ReadonlyMap<string, string>): string {
  const used = new Set<string>();
  const result = program.html.replace(/\{\{([^{}]+)\}\}/gu, (_match, name: string) => {
    const child = children.get(name);
    if (child === undefined || used.has(name)) throw new Error(`Browser program slot ${name} is missing or repeated.`);
    used.add(name);
    return child;
  });
  for (const name of children.keys()) {
    if (!used.has(name)) throw new Error(`Browser program does not place owned child ${name}.`);
  }
  return result;
}

/** JSON is embedded as data, so author text cannot close the surrounding script element. */
const scriptJson = (value: unknown): string => JSON.stringify(value).replaceAll("<", "\\u003c");

export function browserProgramScript(entries: readonly {
  readonly id: string;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly program: BrowserProgram;
}[], numerator: number, denominator: number): string {
  return `(() => {
    const fail = error => { window.__hypitBrowserProgramError = String(error?.stack || error); };
    const entries = ${scriptJson(entries)};
    const renders = entries.map(entry => {
      const root = document.getElementById(entry.id);
      try {
        const render = entry.program.setup === undefined ? () => {} :
          new Function('root', 'data', entry.program.setup)(root, entry.program.data);
        if (typeof render !== 'function') throw new Error('Browser program setup must return render(localFrame).');
        return { ...entry, render };
      } catch (error) { fail(error); return { ...entry, render: () => {} }; }
    });
    const apply = time => {
      const frame = Math.round(Number(time || 0) * ${numerator} / ${denominator});
      for (const entry of renders) {
        try { entry.render(Math.max(0, Math.min(entry.durationFrames, frame - entry.startFrame))); }
        catch (error) { fail(error); }
      }
    };
    apply(0);
    window.addEventListener('hf-seek', event => apply(event.detail?.time));
  })();`;
}

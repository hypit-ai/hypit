import type { PreviewProducer } from "../discovery/producers.js";
import { workspacePreviewProducers } from "../discovery/workspace.js";
import { renderPreview } from "../preview/render.js";
import {
  defaultCanvasSpace,
  defaultProgramSpace,
  sealProgramSpace,
} from "../svml.js";
import type { CanonicalValue, ProgramSpace, Track } from "../svml.js";
import { FORM_CSS, blankValue, buildForm } from "./form.js";
import { createStage } from "./stage.js";

const CSS = `
.rail {
  width: 356px; flex: 0 0 356px; border-right: 1px solid var(--line);
  background: var(--panel); display: flex; flex-direction: column; min-height: 0;
}
.rail-head { padding: 12px 14px; border-bottom: 1px solid var(--line); }
.rail-head h1 { margin: 0 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .02em; }
.rail-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px 24px; }
.rail select, .rail input[type=number] {
  background: #1c1c21; color: var(--text); border: 1px solid var(--line);
  border-radius: 5px; padding: 4px 7px; font: inherit; font-size: 12px; min-width: 0; width: 100%;
}
.rail-canvas { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 6px; align-items: center; margin-top: 9px; }
.rail-canvas span { color: var(--muted); font-size: 11px; }
.section { color: var(--accent); font-size: 11px; margin: 15px 0 4px; }
.section:first-child { margin-top: 0; }
.module { color: var(--muted); font-size: 11px; font-family: ui-monospace, monospace; margin-top: 4px; }
.hint { color: var(--muted); font-size: 12px; margin-top: 7px; }
.copy-svs {
  margin-top: 8px; border: 1px solid var(--line); border-radius: 5px; background: #1c1c21;
  color: var(--text); font: inherit; font-size: 11px; padding: 3px 9px; cursor: pointer;
}
.copy-svs:hover { border-color: #3a3a42; }
.rail-canvas input[type=color] {
  width: 100%; height: 24px; padding: 0; border: 1px solid var(--line);
  background: none; border-radius: 5px;
}
${FORM_CSS}
`;

export async function mountShell(root: HTMLElement): Promise<void> {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const rail = document.createElement("div");
  rail.className = "rail";
  rail.innerHTML = `
    <div class="rail-head">
      <h1>Component playground</h1>
      <select data-producer></select>
      <div class="module" data-module></div>
      <div class="rail-canvas">
        <span>W</span><input type="number" data-width min="16" step="2" />
        <span>H</span><input type="number" data-height min="16" step="2" />
        <span>fps</span><input type="number" data-fps min="1" step="1" />
        <span>sec</span><input type="number" data-duration min="0.1" step="0.1" />
        <span>bg</span><input type="color" data-background />
      </div>
    </div>
    <div class="rail-body"></div>
  `;

  const picker = rail.querySelector<HTMLSelectElement>("[data-producer]")!;
  const moduleLine = rail.querySelector<HTMLElement>("[data-module]")!;
  const body = rail.querySelector<HTMLElement>(".rail-body")!;
  const widthInput = rail.querySelector<HTMLInputElement>("[data-width]")!;
  const heightInput = rail.querySelector<HTMLInputElement>("[data-height]")!;
  const fpsInput = rail.querySelector<HTMLInputElement>("[data-fps]")!;
  const durationInput = rail.querySelector<HTMLInputElement>("[data-duration]")!;
  const backgroundInput = rail.querySelector<HTMLInputElement>("[data-background]")!;

  const stage = createStage();
  root.append(rail, stage.element);

  const producers = await workspacePreviewProducers();
  if (producers.length === 0) {
    stage.showError("No module declares a Producer that outputs a VisualTrack.");
    return;
  }
  for (const producer of producers) {
    const option = document.createElement("option");
    option.value = producer.id;
    option.textContent = producer.label;
    picker.append(option);
  }

  // Spatial owns geometry and ProgramSpace owns time, so the preview starts
  // from those package-owned values rather than a second playground model of a
  // frame. The clear colour belongs to a Composition, and a preview assembles
  // none, so it is a stage control the operator sets like the others.
  const canvasSpace = defaultCanvasSpace();
  const defaultSpace = defaultProgramSpace();
  const canvas = {
    width: canvasSpace.widthPx,
    height: canvasSpace.heightPx,
    clearColor: "#09090b",
  };
  const space = {
    fps: defaultSpace.frameRate.numerator / defaultSpace.frameRate.denominator,
    durationSec: defaultSpace.durationSec,
  };

  /**
   * Values a ProgramSpace input must agree with.
   *
   * Producers take a ProgramSpace as an ordinary input, but the canvas controls
   * and the scrubber describe the same thing, so the shell owns it and the form
   * does not offer a second copy to disagree with.
   */
  function programSpace(): ProgramSpace {
    return sealProgramSpace({
      contract: "svml.program-space@1",
      durationSec: space.durationSec,
      frameRate: { numerator: space.fps, denominator: 1 },
    });
  }

  const drafts = new Map<string, Record<string, CanonicalValue>>();
  // Open on something that draws. A producer whose inputs its own modules can
  // all supply shows a frame immediately; one waiting on media would greet the
  // operator with a failure they have not caused yet.
  let active: PreviewProducer = producers.find((producer) =>
    producer.inputs.every((input) => input.initial !== undefined)) ?? producers[0]!;
  picker.value = active.id;

  function draft(producer: PreviewProducer): Record<string, CanonicalValue> {
    const existing = drafts.get(producer.id);
    if (existing !== undefined) return existing;
    const created: Record<string, CanonicalValue> = {};
    for (const input of producer.inputs) {
      // Whatever the declaring module says one of these looks like. Where it
      // declines — because the value carries media it has no bytes for — the
      // schema still says what shape the operator has to fill in.
      created[input.name] = input.initial !== undefined
        ? structuredClone(input.initial) as CanonicalValue
        : input.schema === undefined ? null : blankValue(input.schema);
    }
    drafts.set(producer.id, created);
    return created;
  }

  function isProgramSpace(name: string, producer: PreviewProducer): boolean {
    return producer.inputs.some((input) =>
      input.name === name && input.type.name === "ProgramSpace");
  }

  let queued = 0;
  function schedule(): void {
    if (queued !== 0) clearTimeout(queued);
    queued = window.setTimeout(render, 120);
  }

  /** Lowers the written Recipe. Throws in the module's own words. */
  function recipeFilled(producer: PreviewProducer): Readonly<Record<string, CanonicalValue>> {
    const facet = producer.recipes[0];
    const written = recipeDrafts.get(producer.id);
    if (facet === undefined || written === undefined) return {};
    return facet.apply(written, draft(producer));
  }

  /**
   * Which inputs the Recipe answers for, for laying out the form.
   *
   * A Recipe naming a font nothing has bytes for cannot be lowered, and the
   * canvas already says so — so here it simply answers for nothing, and the
   * form keeps offering those inputs rather than hiding them behind something
   * that is not working.
   */
  function recipeInputNames(producer: PreviewProducer): ReadonlySet<string> {
    try {
      return new Set(Object.keys(recipeFilled(producer)));
    } catch {
      return new Set();
    }
  }

  function render(): void {
    const values = { ...draft(active) };
    try {
      Object.assign(values, recipeFilled(active));
      const resolved = programSpace();
      for (const input of active.inputs) {
        if (isProgramSpace(input.name, active)) values[input.name] = resolved as never;
      }
      const track = active.invoke(values) as Track;
      stage.show(renderPreview({
        id: active.moduleName,
        canvas,
        programSpace: resolved,
        tracks: [track],
      }));
    } catch (error) {
      // The compiler's own message. The last good frame stays up.
      stage.showError(error instanceof Error ? error.message : String(error));
    }
  }

  function section(title: string): HTMLElement {
    const element = document.createElement("div");
    element.className = "section";
    element.textContent = title;
    return element;
  }

  /**
   * Properties the operator has written, per module.
   *
   * A Recipe is authored in its own vocabulary — the one that goes into a `.svs`
   * — so these are kept as written and lowered on every render, rather than
   * folded into the Producer inputs where they could no longer be read back out
   * or copied into a project.
   */
  const recipeDrafts = new Map<string, Record<string, CanonicalValue>>();

  function recipeDraft(producer: PreviewProducer): Record<string, CanonicalValue> | undefined {
    const facet = producer.recipes[0];
    if (facet === undefined) return undefined;
    const existing = recipeDrafts.get(producer.id);
    if (existing !== undefined) return existing;
    const created = blankValue(facet.schema) as Record<string, CanonicalValue>;
    recipeDrafts.set(producer.id, created);
    return created;
  }

  /** The Recipe as it would be written in a stylesheet. */
  function svsText(producer: PreviewProducer): string {
    const written = recipeDrafts.get(producer.id) ?? {};
    const short = producer.moduleName.replace(/^@narratage\//u, "").replace(/-.*$/u, "");
    const lines = Object.entries(written)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([name, value]) => `  ${name}: ${String(value)};`);
    return `${short}.preview {\n${lines.join("\n")}\n}`;
  }

  function renderRail(): void {
    const values = draft(active);
    moduleLine.textContent = active.moduleName;
    body.replaceChildren();

    const written = recipeDraft(active);
    if (written !== undefined) {
      body.append(section("Recipe"), buildForm(active.recipes[0]!.schema, written, schedule));
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "copy-svs";
      copy.textContent = "Copy as .svs";
      copy.addEventListener("click", () => {
        void navigator.clipboard.writeText(svsText(active)).then(
          () => { copy.textContent = "Copied"; },
          () => { copy.textContent = "Copy failed"; },
        ).finally(() => {
          window.setTimeout(() => { copy.textContent = "Copy as .svs"; }, 1200);
        });
      });
      body.append(copy);
    }

    const fromRecipe = recipeInputNames(active);
    for (const input of active.inputs) {
      // The shell owns the frame domain; offering it again would be a second
      // answer free to disagree with the canvas controls. The same reasoning
      // hides an input the Recipe above already answers for.
      if (isProgramSpace(input.name, active)) continue;
      if (fromRecipe.has(input.name)) continue;
      body.append(section(input.name));
      if (input.schema === undefined) {
        const missing = document.createElement("div");
        missing.className = "hint";
        missing.textContent = `${input.type.module.name} declares no schema for ${input.type.name}.`;
        body.append(missing);
        continue;
      }
      if (values[input.name] === null || values[input.name] === undefined) {
        const empty = document.createElement("div");
        empty.className = "hint";
        empty.textContent = `${input.type.module.name} offers no default for ${input.type.name}.`;
        body.append(empty);
      }
      body.append(buildForm(input.schema, values[input.name] ?? {}, schedule));
    }
  }

  picker.addEventListener("input", () => {
    active = producers.find((entry) => entry.id === picker.value) ?? active;
    renderRail();
    render();
  });

  widthInput.value = String(canvas.width);
  heightInput.value = String(canvas.height);
  fpsInput.value = String(space.fps);
  durationInput.value = String(space.durationSec);
  backgroundInput.value = canvas.clearColor;
  backgroundInput.addEventListener("input", () => {
    canvas.clearColor = backgroundInput.value;
    schedule();
  });
  for (const [input, apply] of [
    [widthInput, (n: number) => { canvas.width = n; }],
    [heightInput, (n: number) => { canvas.height = n; }],
    [fpsInput, (n: number) => { space.fps = n; }],
    [durationInput, (n: number) => { space.durationSec = n; }],
  ] as const) {
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (Number.isFinite(value) && value > 0) { apply(value); schedule(); }
    });
  }

  renderRail();
  render();
}

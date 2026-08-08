import { REGISTRY, componentById } from "../registry/index.js";
import type { PreviewComponent } from "../registry/index.js";
import { renderPreview } from "../preview/render.js";
import { sealProgramSpace } from "../svml.js";
import type { CanonicalValue } from "../svml.js";
import { FORM_CSS, buildForm } from "./form.js";
import { createStage } from "./stage.js";

const CSS = `
.rail {
  width: 340px; flex: 0 0 340px; border-right: 1px solid var(--line);
  background: var(--panel); display: flex; flex-direction: column; min-height: 0;
}
.rail-head { padding: 12px 14px; border-bottom: 1px solid var(--line); }
.rail-head h1 { margin: 0 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .02em; }
.rail-body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 14px 24px; }
.rail select, .rail input[type=number] {
  background: #1c1c21; color: var(--text); border: 1px solid var(--line);
  border-radius: 5px; padding: 4px 7px; font: inherit; font-size: 12px; min-width: 0;
}
.rail-canvas { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 6px; align-items: center; margin-top: 9px; }
.rail-canvas span { color: var(--muted); font-size: 11px; }
.section { color: var(--accent); font-size: 11px; letter-spacing: .05em;
  text-transform: uppercase; margin: 14px 0 4px; }
.section:first-child { margin-top: 0; }
${FORM_CSS}
`;

type Draft = { parameters: CanonicalValue; content: CanonicalValue };

export function mountShell(root: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const rail = document.createElement("div");
  rail.className = "rail";
  rail.innerHTML = `
    <div class="rail-head">
      <h1>Component playground</h1>
      <select data-component></select>
      <div class="rail-canvas">
        <span>W</span><input type="number" data-width min="16" step="2" />
        <span>H</span><input type="number" data-height min="16" step="2" />
        <span>fps</span><input type="number" data-fps min="1" step="1" />
        <span>sec</span><input type="number" data-duration min="0.1" step="0.1" />
      </div>
    </div>
    <div class="rail-body"></div>
  `;

  const picker = rail.querySelector<HTMLSelectElement>("[data-component]")!;
  const body = rail.querySelector<HTMLElement>(".rail-body")!;
  const widthInput = rail.querySelector<HTMLInputElement>("[data-width]")!;
  const heightInput = rail.querySelector<HTMLInputElement>("[data-height]")!;
  const fpsInput = rail.querySelector<HTMLInputElement>("[data-fps]")!;
  const durationInput = rail.querySelector<HTMLInputElement>("[data-duration]")!;

  for (const component of REGISTRY) {
    const option = document.createElement("option");
    option.value = component.id;
    option.textContent = component.label;
    picker.append(option);
  }

  const stage = createStage();
  root.append(rail, stage.element);

  const canvas = { width: 1080, height: 1920, clearColor: "#09090b" };
  const space = { fps: 30, durationSec: 4 };
  widthInput.value = String(canvas.width);
  heightInput.value = String(canvas.height);
  fpsInput.value = String(space.fps);
  durationInput.value = String(space.durationSec);

  // One draft per component, so switching away and back keeps your edits.
  const drafts = new Map<string, Draft>();
  let active: PreviewComponent = REGISTRY[0]!;

  function draft(component: PreviewComponent): Draft {
    const existing = drafts.get(component.id);
    if (existing !== undefined) return existing;
    const created = component.defaults();
    drafts.set(component.id, created);
    return created;
  }

  let queued = 0;
  function schedule(): void {
    if (queued !== 0) clearTimeout(queued);
    queued = window.setTimeout(render, 120);
  }

  function render(): void {
    const current = draft(active);
    try {
      const programSpace = sealProgramSpace({
        contract: "svml.program-space@1",
        durationSec: space.durationSec,
        frameRate: { numerator: space.fps, denominator: 1 },
      });
      const tracks = active.build({
        parameters: current.parameters,
        content: current.content,
        programSpace,
        canvas,
      });
      stage.show(renderPreview({ id: active.id, canvas, programSpace, tracks }));
    } catch (error) {
      // The compiler's own message, verbatim. The last good frame stays up.
      stage.showError(error instanceof Error ? error.message : String(error));
    }
  }

  function renderForm(): void {
    const current = draft(active);
    body.replaceChildren();
    const parameters = document.createElement("div");
    parameters.className = "section";
    parameters.textContent = "Parameters";
    const content = document.createElement("div");
    content.className = "section";
    content.textContent = "Content";
    body.append(
      parameters,
      buildForm(active.parameters, current.parameters, active.hints ?? {}, schedule),
      content,
      buildForm(active.content, current.content, active.hints ?? {}, schedule),
    );
  }

  picker.addEventListener("input", () => {
    active = componentById(picker.value) ?? active;
    renderForm();
    render();
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

  renderForm();
  render();
}

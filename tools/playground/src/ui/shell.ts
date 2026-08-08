import { REGISTRY, componentById } from "../registry/index.js";
import type { PreviewComponent } from "../registry/index.js";
import { renderPreview } from "../preview/render.js";
import { discover } from "../svs/discover.js";
import type { Discovery, PreviewSubject } from "../svs/discover.js";
import { sealProgramSpace } from "../svml.js";
import type { CanonicalValue } from "../svml.js";
import { BROWSE_CSS, createBrowser, readSheet } from "./browse.js";
import { FORM_CSS, buildForm } from "./form.js";
import { GALLERY_CSS, renderGallery } from "./gallery.js";
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
  text-transform: uppercase; margin: 14px 0 4px; display: flex; justify-content: space-between; align-items: baseline; }
.section:first-child { margin-top: 0; }
.section button {
  border: 0; background: none; color: var(--muted); cursor: pointer;
  font: inherit; font-size: 11px; text-transform: none; letter-spacing: 0; padding: 0;
}
.section button:hover { color: var(--text); }
.sheet-note { color: var(--muted); font-size: 12px; margin-top: 6px; }
.sheet-note b { color: var(--accent); font-weight: 500; }
${BROWSE_CSS}
${FORM_CSS}
${GALLERY_CSS}
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
  let main: HTMLElement = stage.element;
  root.append(rail, main);

  const canvas = { width: 1080, height: 1920, clearColor: "#09090b" };
  const space = { fps: 30, durationSec: 4 };
  widthInput.value = String(canvas.width);
  heightInput.value = String(canvas.height);
  fpsInput.value = String(space.fps);
  durationInput.value = String(space.durationSec);

  // Mode B keeps one draft per component; mode A keeps one per Recipe, so
  // switching between two captions from a sheet does not merge their edits.
  const drafts = new Map<string, Draft>();
  let active: PreviewComponent = REGISTRY[0]!;
  let activeKey = active.id;
  let sheet: { name: string; discovery: Discovery } | undefined;

  function draft(key: string, make: () => Draft): Draft {
    const existing = drafts.get(key);
    if (existing !== undefined) return existing;
    const created = make();
    drafts.set(key, created);
    return created;
  }

  function currentDraft(): Draft {
    return draft(activeKey, () => active.defaults());
  }

  function swapMain(next: HTMLElement): void {
    main.replaceWith(next);
    main = next;
  }

  let queued = 0;
  function schedule(): void {
    if (queued !== 0) clearTimeout(queued);
    queued = window.setTimeout(render, 120);
  }

  function programSpace() {
    return sealProgramSpace({
      contract: "svml.program-space@1",
      durationSec: space.durationSec,
      frameRate: { numerator: space.fps, denominator: 1 },
    });
  }

  function render(): void {
    if (main !== stage.element) swapMain(stage.element);
    const current = currentDraft();
    try {
      const resolved = programSpace();
      stage.show(renderPreview({
        id: active.id,
        canvas,
        programSpace: resolved,
        tracks: active.build({
          parameters: current.parameters,
          content: current.content,
          programSpace: resolved,
          canvas,
        }),
      }));
    } catch (error) {
      // The compiler's own message, verbatim. The last good frame stays up.
      stage.showError(error instanceof Error ? error.message : String(error));
    }
  }

  function showGallery(): void {
    if (sheet === undefined) return;
    swapMain(renderGallery({
      subjects: sheet.discovery.subjects,
      unmatched: sheet.discovery.unmatched,
      canvas,
      fps: space.fps,
      durationSec: space.durationSec,
      onFocus: focusSubject,
    }));
  }

  function focusSubject(subject: PreviewSubject): void {
    active = subject.component;
    activeKey = subject.key;
    picker.value = subject.component.id;
    draft(subject.key, () => ({ parameters: subject.parameters, content: subject.content }));
    renderRail();
    render();
  }

  function loadSheet(path: string): void {
    void readSheet(path).then((source) => {
      const discovery = discover(path, source);
      sheet = { name: path, discovery };
      // A Film Recipe is not a preview subject; it says how big the frame is.
      const offer = discovery.canvases[0];
      if (offer !== undefined) {
        canvas.width = offer.width;
        canvas.height = offer.height;
        canvas.clearColor = offer.clearColor;
        space.fps = offer.fps;
        widthInput.value = String(offer.width);
        heightInput.value = String(offer.height);
        fpsInput.value = String(offer.fps);
      }
      renderRail();
      showGallery();
    }).catch((error: unknown) => {
      sheet = undefined;
      renderRail();
      stage.showError(error instanceof Error ? error.message : String(error));
    });
  }

  const browser = createBrowser(loadSheet);

  function section(title: string, action?: { label: string; run: () => void }): HTMLElement {
    const element = document.createElement("div");
    element.className = "section";
    const caption = document.createElement("span");
    caption.textContent = title;
    element.append(caption);
    if (action !== undefined) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      element.append(button);
    }
    return element;
  }

  function renderRail(): void {
    const current = currentDraft();
    body.replaceChildren();

    body.append(section("Stylesheet"), browser.element);
    if (sheet !== undefined) {
      const note = document.createElement("div");
      note.className = "sheet-note";
      const count = sheet.discovery.subjects.length;
      note.append(document.createTextNode(`${count} previewable Recipe(s) in `));
      const id = document.createElement("b");
      id.textContent = sheet.discovery.sheetId ?? sheet.name;
      note.append(id);
      body.append(note, section("", { label: "Show all", run: showGallery }));
    }

    body.append(section("Parameters"));
    body.append(buildForm(active.parameters, current.parameters, active.hints ?? {}, schedule));
    body.append(section("Content"));
    body.append(buildForm(active.content, current.content, active.hints ?? {}, schedule));
  }

  picker.addEventListener("input", () => {
    active = componentById(picker.value) ?? active;
    // Choosing from the list leaves any focused Recipe behind.
    activeKey = active.id;
    renderRail();
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

  renderRail();
  render();
}

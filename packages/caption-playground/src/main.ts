import type { CaptionProgram, TimedCaptionProjection } from "@hypit/caption";
import { resolveCaptionProgram } from "@hypit/caption";
import { renderFineCaption } from "@hypit/caption-fine";
import type { CaptionDisplayAtom, CaptionDisplaySequence } from "@hypit/narrative";
import type { CanonicalValue, ValueSchema } from "@hypit/protocol";
import { sealProgramSpace } from "@hypit/program-space";

import type {
  CaptionPlaygroundFailure,
  CaptionPlaygroundFont,
  CaptionPlaygroundSnapshot,
  FontPatch,
  RecipePatch,
} from "./shared.js";
import { renderPreview } from "./preview/render.js";
import { createStage } from "./ui/stage.js";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <header class="topbar">
    <div><strong>Caption Playground</strong><span>real SVML · real SVS · exact fonts</span></div>
    <div class="status" data-status>Compiling…</div>
  </header>
  <main><div data-stage></div><aside data-controls></aside></main>`;
const stage = createStage();
app.querySelector<HTMLElement>("[data-stage]")!.append(stage.element);
const controls = app.querySelector<HTMLElement>("[data-controls]")!;
const status = app.querySelector<HTMLElement>("[data-status]")!;

let snapshot: CaptionPlaygroundSnapshot | undefined;
let requestInFlight = false;
const loadedFontCss = new Set<string>();

function cueProjection(display: CaptionDisplaySequence, program: CaptionProgram, fps: number): TimedCaptionProjection {
  const atomByWord = new Map(display.atoms.flatMap((atom) => atom.wordIds.map((wordId) => [wordId, atom] as const)));
  const cues: TimedCaptionProjection["cues"][number][] = [];
  let cursor = 0;
  for (const run of program.runs) {
    const style = program.styles.find((item) => item.id === run.styleId)!;
    const atoms: CaptionDisplayAtom[] = [];
    for (const wordId of run.wordIds) {
      const atom = atomByWord.get(wordId)!;
      if (atoms.at(-1)?.id !== atom.id) atoms.push(atom);
    }
    const groups: CaptionDisplayAtom[][] = [];
    for (const atom of atoms) {
      const group = groups.at(-1);
      const count = group?.reduce((sum, item) => sum + item.wordIds.length, 0) ?? 0;
      if (group === undefined || (count > 0 && count + atom.wordIds.length > style.planning.cue.maximumWords)) {
        groups.push([atom]);
      } else {
        group.push(atom);
      }
    }
    for (const group of groups) {
      const words = group.reduce((sum, atom) => sum + atom.wordIds.length, 0);
      const duration = Math.max(1, Math.round(words * 0.42 * fps));
      const start = cursor;
      const end = cursor + duration;
      let atomCursor = start;
      let consumedWords = 0;
      const timedAtoms = group.map((atom, index) => {
        consumedWords += atom.wordIds.length;
        const atomEnd = index === group.length - 1
          ? end
          : start + Math.round(duration * consumedWords / words);
        const value = { atomId: atom.id, startFrame: atomCursor, endFrameExclusive: atomEnd };
        atomCursor = atomEnd;
        return value;
      });
      cues.push({
        id: `caption-playground:cue:${cues.length + 1}`,
        styleId: run.styleId,
        startFrame: start,
        endFrameExclusive: end,
        atoms: timedAtoms,
        fields: [],
      });
      cursor = end;
    }
  }
  return { displaySequenceId: display.id, cues };
}

function showPreview(value: CaptionPlaygroundSnapshot): void {
  const program = resolveCaptionProgram(value.display, "caption-playground", value.style, []);
  const projection = cueProjection(value.display, program, value.preview.fps);
  const frameCount = projection.cues.at(-1)?.endFrameExclusive ?? 1;
  const space = sealProgramSpace({
    durationSec: frameCount / value.preview.fps,
    frameRate: { numerator: value.preview.fps, denominator: 1 },
  });
  stage.show(renderPreview({
    id: "caption-playground",
    canvas: { width: value.preview.width, height: value.preview.height, clearColor: "#121216" },
    programSpace: space,
    tracks: [renderFineCaption(projection, program, value.display, space)],
  }));
}

function groupFor(name: string): string {
  if (name.startsWith("cue-") || name === "cue-min-words" || name === "cue-max-words") return "Cue planning & motion";
  if (["x", "y", "width", "anchor-x", "anchor-y", "stack-order", "align", "direction"].includes(name)) return "Placement & layout";
  if (["size", "line-height", "letter-spacing", "word-gap", "text-transform"].includes(name)) return "Typography";
  if (name.startsWith("active-box")) return "Active word box";
  if (name.startsWith("active-underline") || name === "underline" || name.startsWith("underline-")) return "Underline";
  if (name.startsWith("active-")) return "Active word paint & response";
  if (name.startsWith("karaoke")) return "Karaoke";
  if (name.startsWith("atom-")) return "Atom reveal & motion";
  if (name.startsWith("loop")) return "Loop motion";
  if (["background", "border-color", "border-width", "padding", "radius"].includes(name)) return "Cue box";
  return "Base glyph paint";
}

function fieldSchema(schema: ValueSchema, name: string): { readonly schema: ValueSchema; readonly optional: boolean } {
  if (schema.kind !== "object") throw new Error("Fine Caption Recipe schema is not an object");
  const field = schema.fields[name];
  if (field === undefined) throw new Error(`No schema for ${name}`);
  return { schema: field.schema, optional: field.optional === true };
}

function editor(name: string, value: CanonicalValue | undefined, schema: ValueSchema, optional: boolean): HTMLElement {
  const row = document.createElement("label");
  row.className = "property";
  row.innerHTML = `<span>${name}</span>`;
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "property-toggle";
  enabled.checked = value !== undefined;
  if (optional) row.prepend(enabled);
  const control = schema.kind === "string" && schema.enum !== undefined
    ? document.createElement("select")
    : document.createElement("input");
  if (control instanceof HTMLSelectElement && schema.kind === "string") {
    for (const item of schema.enum ?? []) control.add(new Option(item, item));
    control.value = typeof value === "string" ? value : schema.enum?.[0] ?? "";
  } else if (control instanceof HTMLInputElement) {
    control.type = schema.kind === "number" ? "number" : "text";
    if (schema.kind === "number") {
      control.step = schema.integer === true ? "1" : "any";
      if (schema.minimum !== undefined) control.min = String(schema.minimum);
      if (schema.maximum !== undefined) control.max = String(schema.maximum);
    }
    control.value = value === undefined ? "" : String(value);
  }
  control.disabled = optional && value === undefined;
  row.append(control);
  const save = async (): Promise<void> => {
    if (snapshot === undefined || requestInFlight) return;
    const parsed: CanonicalValue = schema.kind === "number" ? Number(control.value) : control.value;
    if (schema.kind === "number" && !Number.isFinite(parsed)) return;
    await patch("/__caption/recipe", {
      name,
      value: parsed,
    } satisfies RecipePatch);
  };
  control.addEventListener("change", () => void save());
  enabled.addEventListener("change", () => {
    if (snapshot === undefined) return;
    control.disabled = !enabled.checked;
    if (!enabled.checked) {
      void patch("/__caption/recipe", {
        name,
        remove: true,
      } satisfies RecipePatch);
    } else {
      if (!control.value) {
        if (schema.kind === "number") control.value = "0";
        else if (schema.kind === "string" && schema.enum !== undefined) control.value = schema.enum[0] ?? "";
        else control.value = "none";
      }
      void save();
    }
  });
  return row;
}

function loadFontCss(font: CaptionPlaygroundFont): void {
  if (loadedFontCss.has(font.id)) return;
  loadedFontCss.add(font.id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/__caption/font-css/${font.id}`;
  document.head.append(link);
}

function fontPanel(value: CaptionPlaygroundSnapshot): HTMLElement {
  const section = document.createElement("section");
  section.className = "font-panel";
  section.innerHTML = `
    <div class="section-heading"><div><h2>Exact font</h2><p>${value.font.file} · ${value.font.id}</p></div></div>
    <div class="font-current"><select data-weight></select><select data-style></select></div>
    <input class="font-search" type="search" placeholder="Search 109 redistributable font families…" />
    <div class="font-grid"></div>`;
  const grid = section.querySelector<HTMLElement>(".font-grid")!;
  const search = section.querySelector<HTMLInputElement>(".font-search")!;
  const weight = section.querySelector<HTMLSelectElement>("[data-weight]")!;
  const style = section.querySelector<HTMLSelectElement>("[data-style]")!;
  const selected = value.fonts.find((font) => font.id === value.font.family);
  for (const item of selected?.weights ?? [value.font.weight]) weight.add(new Option(String(item), String(item)));
  weight.value = String(value.font.weight);
  for (const item of selected?.styles ?? [value.font.style]) style.add(new Option(item, item));
  style.value = value.font.style;

  const choose = (family: CaptionPlaygroundFont, selectedWeight = family.previewWeight, selectedStyle = family.previewStyle): void => {
    void patch("/__caption/font", {
      family: family.id,
      weight: selectedWeight,
      style: selectedStyle,
    } satisfies FontPatch);
  };
  weight.addEventListener("change", () => selected && choose(selected, Number(weight.value), style.value as "normal" | "italic"));
  style.addEventListener("change", () => selected && choose(selected, Number(weight.value), style.value as "normal" | "italic"));

  const cards = value.fonts.map((font) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `font-card${font.id === value.font.family ? " selected" : ""}`;
    button.dataset.search = `${font.label} ${font.id} ${font.category}`.toLowerCase();
    button.innerHTML = `<strong>${font.label}</strong><span>Aa 45% — Caption ✨</span><small>${font.category}</small>`;
    const sample = button.querySelector<HTMLElement>("span")!;
    sample.style.fontFamily = `caption-gallery-${font.id}, sans-serif`;
    sample.style.fontWeight = String(font.previewWeight);
    sample.style.fontStyle = font.previewStyle;
    button.addEventListener("click", () => choose(font));
    grid.append(button);
    return { font, button };
  });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const found = cards.find((item) => item.button === entry.target);
      if (found !== undefined) loadFontCss(found.font);
      observer.unobserve(entry.target);
    }
  }, { root: grid, rootMargin: "180px" });
  cards.forEach(({ button }) => observer.observe(button));
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    cards.forEach(({ button }) => { button.hidden = query.length > 0 && !button.dataset.search!.includes(query); });
  });
  return section;
}

function renderControls(value: CaptionPlaygroundSnapshot): void {
  controls.replaceChildren(fontPanel(value));
  const byGroup = new Map<string, string[]>();
  if (value.recipe.schema.kind !== "object") return;
  for (const name of Object.keys(value.recipe.schema.fields)) {
    const group = groupFor(name);
    const values = byGroup.get(group) ?? [];
    values.push(name);
    byGroup.set(group, values);
  }
  for (const [group, names] of byGroup) {
    const details = document.createElement("details");
    details.open = ["Cue planning & motion", "Placement & layout", "Typography", "Base glyph paint", "Cue box"].includes(group);
    const summary = document.createElement("summary");
    summary.textContent = group;
    details.append(summary);
    const body = document.createElement("div");
    body.className = "property-grid";
    for (const name of names) {
      const declared = fieldSchema(value.recipe.schema, name);
      body.append(editor(name, value.recipe.values[name], declared.schema, declared.optional));
    }
    details.append(body);
    controls.append(details);
  }
}

function applySnapshot(value: CaptionPlaygroundSnapshot): void {
  snapshot = value;
  status.className = "status ok";
  status.textContent = `Watching ${value.recipe.file} · revision ${value.revision}`;
  try { showPreview(value); } catch (error) { stage.showError(error instanceof Error ? error.message : String(error)); }
  renderControls(value);
}

async function patch(path: string, value: RecipePatch | FontPatch): Promise<void> {
  requestInFlight = true;
  status.className = "status";
  status.textContent = "Writing source…";
  try {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(value),
    });
    const result = await response.json() as CaptionPlaygroundSnapshot | { readonly error: string; readonly snapshot?: CaptionPlaygroundSnapshot };
    if (!response.ok) {
      if ("snapshot" in result && result.snapshot !== undefined) applySnapshot(result.snapshot);
      throw new Error("error" in result ? result.error : `HTTP ${response.status}`);
    }
    applySnapshot(result as CaptionPlaygroundSnapshot);
  } catch (error) {
    stage.showError(error instanceof Error ? error.message : String(error));
    status.className = "status error";
    status.textContent = "Source update failed";
  } finally {
    requestInFlight = false;
  }
}

const response = await fetch("/__caption/session");
const initial = await response.json() as CaptionPlaygroundSnapshot | CaptionPlaygroundFailure;
if (response.ok && "style" in initial) applySnapshot(initial);
else {
  const message = "error" in initial ? initial.error : "Caption compiler failed";
  stage.showError(message);
  status.className = "status error";
  status.textContent = "Compile failed";
}

type Hot = { on(event: string, listener: (value: unknown) => void): void };
const hot = (import.meta as ImportMeta & { hot?: Hot }).hot;
hot?.on("caption:snapshot", (value) => applySnapshot(value as CaptionPlaygroundSnapshot));
hot?.on("caption:error", (value) => {
  const failure = value as CaptionPlaygroundFailure;
  stage.showError(failure.error);
  status.className = "status error";
  status.textContent = `Compile failed · revision ${failure.revision}`;
});

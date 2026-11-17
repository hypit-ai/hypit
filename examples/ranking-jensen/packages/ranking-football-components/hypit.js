const packageName = "@hypit-example/ranking-football-components";
const componentSymbol = symbol => ({ package: packageName, symbol });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value, label) {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be a record.`);
  return value;
}

function fields(value, allowed, label) {
  const known = new Set(allowed);
  for (const name of Object.keys(value)) assert(known.has(name), `${label} field ${name} is unknown.`);
}

function text(value, label) {
  assert(typeof value === "string" && value.trim().length > 0 && value.length <= 160, `${label} is invalid.`);
  return value;
}

function color(value, label) {
  assert(typeof value === "string" && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu.test(value), `${label} is invalid.`);
  return value;
}

function exact(value, label) {
  const input = record(value, label);
  fields(input, ["ticks", "timeBase"], label);
  const timeBase = record(input.timeBase, `${label}.timeBase`);
  fields(timeBase, ["denominator", "numerator"], `${label}.timeBase`);
  assert(typeof input.ticks === "string" && /^-?(?:0|[1-9][0-9]*)$/u.test(input.ticks)
      && Number.isSafeInteger(timeBase.numerator) && timeBase.numerator > 0
      && Number.isSafeInteger(timeBase.denominator) && timeBase.denominator > 0,
    `${label} is invalid.`);
  return structuredClone(value);
}

function resolveLayout(item, project) {
  assert(item.picture !== undefined, `Component ${item.id} has no Picture appearance.`);
  const selected = item.picture.layout;
  if (!("ref" in selected)) return structuredClone(selected);
  const shared = project.sharedValues.find(value => value.id === selected.ref);
  assert(shared !== undefined && shared.declaration.kind === "nle"
      && shared.declaration.slot === "picture.layout",
    `Component ${item.id} requires Picture layout ${selected.ref}.`);
  return structuredClone(shared.value);
}

function componentSource(item, context, symbol) {
  const layout = resolveLayout(item, context.project);
  return {
    source: {
      id: `${item.id}:source`,
      implementation: { package: packageName, symbol },
      parameters: {
        value: structuredClone(item.parameters),
        layout: { width: layout.width, height: layout.height },
        media: structuredClone(context.media),
      },
      outputs: { picture: {
        signal: "picture",
        kind: "signal",
        domain: { id: `${item.id}:source-time`, duration: structuredClone(item.duration) },
        spatialDomain: {
          id: `${item.id}:source-space`,
          region: { x: 0, y: 0, width: layout.width, height: layout.height },
        },
      } },
    },
    pictureOutput: "picture",
  };
}

function revealFlashParameters(value, label) {
  const parameters = record(value, label);
  fields(parameters, ["attackFrames", "color", "decayFrames", "glowColor", "holdFrames", "intensity"], label);
  assert(typeof parameters.intensity === "number" && Number.isFinite(parameters.intensity)
      && parameters.intensity >= 0 && parameters.intensity <= 1, `${label}.intensity is invalid.`);
  for (const name of ["attackFrames", "holdFrames", "decayFrames"]) {
    assert(Number.isSafeInteger(parameters[name]) && parameters[name] >= 0, `${label}.${name} is invalid.`);
  }
  return {
    intensity: parameters.intensity,
    attackFrames: parameters.attackFrames,
    holdFrames: parameters.holdFrames,
    decayFrames: parameters.decayFrames,
    color: color(parameters.color, `${label}.color`),
    glowColor: color(parameters.glowColor, `${label}.glowColor`),
  };
}

function boardParameters(value, label) {
  const parameters = record(value, label);
  fields(parameters, ["boardHeightRatio", "entries", "entryMotion", "revealFlash", "rows"], label);
  const entryMotion = parameters.entryMotion ?? "stage-then-place";
  assert(entryMotion === "stage-then-place" || entryMotion === "pop-in-place", `${label}.entryMotion is invalid.`);
  const boardHeightRatio = parameters.boardHeightRatio ?? 0.45;
  assert(typeof boardHeightRatio === "number" && Number.isFinite(boardHeightRatio)
      && boardHeightRatio >= 0.25 && boardHeightRatio <= 0.55, `${label}.boardHeightRatio is invalid.`);
  const revealFlash = parameters.revealFlash === undefined
    ? undefined : revealFlashParameters(parameters.revealFlash, `${label}.revealFlash`);
  assert(Array.isArray(parameters.rows) && parameters.rows.length >= 2 && parameters.rows.length <= 8,
    `${label}.rows is invalid.`);
  const rows = parameters.rows.map((value, index) => {
    const row = record(value, `${label}.rows.${index}`);
    fields(row, ["color", "id", "label"], `${label}.rows.${index}`);
    return {
      id: text(row.id, `${label}.rows.${index}.id`),
      label: text(row.label, `${label}.rows.${index}.label`),
      color: color(row.color, `${label}.rows.${index}.color`),
    };
  });
  assert(new Set(rows.map(row => row.id)).size === rows.length, `${label} repeats a row.`);
  const rowIds = new Set(rows.map(row => row.id));
  assert(Array.isArray(parameters.entries) && parameters.entries.length > 0, `${label}.entries is invalid.`);
  const entries = parameters.entries.map((value, index) => {
    const entry = record(value, `${label}.entries.${index}`);
    fields(entry, ["id", "input", "label", "preset", "tier", "window"], `${label}.entries.${index}`);
    const tier = text(entry.tier, `${label}.entries.${index}.tier`);
    assert(rowIds.has(tier), `${label} references missing tier ${tier}.`);
    assert(typeof entry.preset === "boolean", `${label}.entries.${index}.preset is invalid.`);
    let window;
    if (entry.preset) assert(entry.window === undefined, `${label}.entries.${index} preset cannot have a window.`);
    else {
      const authored = record(entry.window, `${label}.entries.${index}.window`);
      fields(authored, ["end", "start"], `${label}.entries.${index}.window`);
      window = {
        start: exact(authored.start, `${label}.entries.${index}.window.start`),
        end: exact(authored.end, `${label}.entries.${index}.window.end`),
      };
    }
    return {
      id: text(entry.id, `${label}.entries.${index}.id`),
      label: text(entry.label, `${label}.entries.${index}.label`),
      tier,
      input: text(entry.input, `${label}.entries.${index}.input`),
      preset: entry.preset,
      ...(window === undefined ? {} : { window }),
    };
  });
  assert(new Set(entries.map(entry => entry.id)).size === entries.length, `${label} repeats an entry.`);
  assert(new Set(entries.map(entry => entry.input)).size === entries.length, `${label} repeats a Media input.`);
  return { rows, entries, entryMotion, boardHeightRatio, ...(revealFlash === undefined ? {} : { revealFlash }) };
}

function resourceId(source, name) {
  return `${source.id}-${name}`.replace(/[^A-Za-z0-9_.:#-]/gu, "-");
}

function tierBoardVisual(source) {
  const layout = record(source.parameters.layout, `Football Tier Board ${source.id} layout`);
  const media = record(source.parameters.media, `Football Tier Board ${source.id} Media`);
  const parameters = boardParameters(source.parameters.value, `Football Tier Board ${source.id}`);
  const { rows, entries, entryMotion, boardHeightRatio, revealFlash } = parameters;

  const boardHeight = Math.round(layout.height * boardHeightRatio);
  const board = { x: 0, y: layout.height - boardHeight, width: layout.width, height: boardHeight };
  const rowHeight = board.height / rows.length;
  const labelWidth = Math.round(rowHeight * 1.5);
  const gap = Math.max(4, Math.round(rowHeight * 0.03));
  const iconSize = rowHeight - gap * 2;
  const radius = Math.round(rowHeight * 0.12);
  const counts = new Map();
  const placed = entries.map(entry => {
    const row = rows.findIndex(candidate => candidate.id === entry.tier);
    const column = counts.get(entry.tier) ?? 0;
    counts.set(entry.tier, column + 1);
    const final = {
      x: board.x + labelWidth + gap + column * (iconSize + gap),
      y: board.y + Math.round(row * rowHeight + (rowHeight - iconSize) / 2),
      size: iconSize,
    };
    assert(final.x + final.size <= board.x + board.width,
      `Football Tier Board row ${entry.tier} cannot fit Entry ${entry.id}.`);
    return { ...entry, final };
  });

  const dependencies = entries.map(entry => {
    const resolved = media[entry.input];
    assert(resolved !== undefined, `Football Tier Board ${source.id} is missing Media input ${entry.input}.`);
    const picture = resolved.interpretation?.picture;
    assert(picture?.kind === "constant", `Football Tier Board ${source.id} Media input ${entry.input} must be a still Picture.`);
    return {
      id: resourceId(source, entry.input),
      kind: "picture",
      resource: structuredClone(resolved.resource),
      picture: structuredClone(picture.interpretation.picture),
    };
  });

  return {
    dependencies,
    data: {
      entries: placed,
      entryMotion,
      ...(revealFlash === undefined ? {} : { revealFlash }),
      appearFrames: 8,
      moveFrames: 14,
      stage: { centerX: Math.round(layout.width * 0.2), centerY: Math.round(layout.height * 0.3), size: 168 },
    },
    html: `<div data-football-ranking><div data-tier-flash><i data-tier-flash-exposure></i><i data-tier-flash-bloom></i></div><div data-tier-board>${rows.map((row, index) => `<div data-tier-row style="--tier:${row.color};top:${index * rowHeight}px;height:${rowHeight}px"><strong style="width:${labelWidth}px">${row.label}</strong><span style="left:${labelWidth}px"></span></div>`).join("")}</div>${placed.map(entry => `<div data-player="${entry.id}" style="left:${entry.final.x}px;top:${entry.final.y}px;width:${entry.final.size}px;height:${entry.final.size}px"><img src="hypit-dependency://${encodeURIComponent(resourceId(source, entry.input))}"/></div>`).join("")}</div>`,
    css: `:scope>[data-football-ranking]{position:absolute;inset:0;overflow:hidden;pointer-events:none}:scope [data-tier-flash]{position:absolute;inset:0;z-index:20;opacity:0;will-change:opacity}:scope [data-tier-flash]>i{position:absolute;inset:0;display:block}:scope [data-tier-flash-exposure]{opacity:.62;mix-blend-mode:screen}:scope [data-tier-flash-bloom]{opacity:.42;mix-blend-mode:screen}:scope [data-tier-board]{position:absolute;z-index:10;left:${board.x}px;top:${board.y}px;width:${board.width}px;height:${board.height}px}:scope [data-tier-row]{position:absolute;left:0;right:0;box-sizing:border-box;border-top:3px solid #111315;border-left:3px solid #111315;border-right:3px solid #111315}:scope [data-tier-row]:last-child{border-bottom:3px solid #111315}:scope [data-tier-row]>strong{position:absolute;inset:0 auto 0 0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border-right:3px solid #111315;background:var(--tier);color:#2c2c2c;font-family:Inter,Arial,sans-serif;font-size:${rowHeight * 0.3}px;font-weight:400;line-height:1}:scope [data-tier-row]>span{position:absolute;inset:0 0 0 auto;background:#2b2b30}:scope [data-player]{position:absolute;overflow:hidden;border-radius:${radius}px;filter:blur(0) drop-shadow(0 7px 10px rgba(0,0,0,.2));transform-origin:center center;will-change:transform,opacity,filter}:scope [data-player]>img{display:block;width:100%;height:100%;object-fit:cover}`,
    setup: `
const elements=new Map([...root.querySelectorAll('[data-player]')].map(element=>[element.getAttribute('data-player'),element]));
const flash=root.querySelector('[data-tier-flash]');
const flashExposure=root.querySelector('[data-tier-flash-exposure]');
const flashBloom=root.querySelector('[data-tier-flash-bloom]');
if(data.revealFlash){flashExposure.style.background=data.revealFlash.glowColor;flashBloom.style.background=data.revealFlash.color;}
const seconds=value=>Number(value.ticks)*value.timeBase.numerator/value.timeBase.denominator;
const fps=typeof context.frameRate==='number'?context.frameRate:context.frameRate.numerator/context.frameRate.denominator;
const clamp=value=>Math.max(0,Math.min(1,value));
const outCubic=value=>1-Math.pow(1-value,3);
const smootherStep=value=>value*value*value*(value*(value*6-15)+10);
const settle=element=>{element.style.opacity='1';element.style.transform='translate(0px,0px) scale(1) rotate(0deg)';element.style.filter='blur(0px) drop-shadow(0 7px 10px rgba(0,0,0,.2))';element.style.zIndex='30';};
return localFrame=>{let flashOpacity=0;for(const entry of data.entries){const element=elements.get(entry.id);if(entry.preset){settle(element);continue;}const startFrame=Math.round(seconds(entry.window.start)*fps);const endFrame=Math.round(seconds(entry.window.end)*fps);
if(data.revealFlash){const flashFrame=localFrame-startFrame,attackEnd=data.revealFlash.attackFrames,holdEnd=attackEnd+data.revealFlash.holdFrames,flashEnd=holdEnd+data.revealFlash.decayFrames;let opacity=0;if(flashFrame>=0&&flashFrame<=flashEnd){if(flashFrame<=attackEnd)opacity=attackEnd===0?data.revealFlash.intensity:data.revealFlash.intensity*flashFrame/attackEnd;else if(flashFrame<=holdEnd)opacity=data.revealFlash.intensity;else if(data.revealFlash.decayFrames>0){const decay=clamp((flashFrame-holdEnd)/data.revealFlash.decayFrames);opacity=data.revealFlash.intensity*Math.pow(1-decay,2.2);}}if(opacity>flashOpacity)flashOpacity=opacity;}
if(localFrame<startFrame){element.style.opacity='0';continue;}if(data.entryMotion==='pop-in-place'){const frame=localFrame-startFrame;if(frame>=data.appearFrames){settle(element);continue;}const progress=clamp(frame/data.appearFrames),eased=outCubic(progress),overshoot=Math.sin(Math.PI*progress)*.1,scale=.68+.32*eased+overshoot;element.style.opacity=String(Math.min(1,progress*4));element.style.transform='translate(0px,0px) scale('+scale+') rotate(0deg)';element.style.filter='blur('+((1-eased)*1.2)+'px) drop-shadow(0 7px 10px rgba(0,0,0,.2))';element.style.zIndex='30';continue;}
if(localFrame>=endFrame){settle(element);continue;}const frame=localFrame-startFrame,duration=endFrame-startFrame,moveStart=Math.max(data.appearFrames,duration-data.moveFrames),stageX=data.stage.centerX-entry.final.size/2,stageY=data.stage.centerY-entry.final.size/2,stageScale=data.stage.size/entry.final.size;let x=stageX,y=stageY,scale=stageScale,opacity=1,blur=0,shadowY=16,shadowBlur=24,shadowOpacity=.3;if(frame<data.appearFrames){const progress=clamp(frame/data.appearFrames),eased=outCubic(progress),overshoot=Math.sin(Math.PI*progress)*.06;scale=stageScale*(.76+.24*eased+overshoot);opacity=Math.min(1,progress*4);blur=(1-eased)*1.6;shadowY=18-2*eased;shadowBlur=28-4*eased;}else if(frame>=moveStart){const progress=clamp((frame-moveStart)/Math.max(1,duration-moveStart)),eased=smootherStep(progress),arc=Math.sin(Math.PI*eased),arcHeight=Math.min(48,Math.max(20,Math.abs(entry.final.y-stageY)*.09));x=stageX+(entry.final.x-stageX)*eased;y=stageY+(entry.final.y-stageY)*eased-arcHeight*arc;scale=stageScale+(1-stageScale)*eased+.025*arc;shadowY=16-8*eased;shadowBlur=24-12*eased;shadowOpacity=.3-.1*eased;}element.style.opacity=String(opacity);element.style.transform='translate('+(x-entry.final.x)+'px,'+(y-entry.final.y)+'px) scale('+scale+') rotate(0deg)';element.style.filter='blur('+blur+'px) drop-shadow(0 '+shadowY+'px '+shadowBlur+'px rgba(0,0,0,'+shadowOpacity+'))';element.style.zIndex='25';}flash.style.opacity=String(flashOpacity);};`,
  };
}

function titleParameters(value, label) {
  const parameters = record(value, label);
  fields(parameters, ["first", "second", "top"], label);
  const top = parameters.top ?? 42;
  assert(typeof top === "number" && Number.isFinite(top) && top >= 0 && top <= 400, `${label}.top is invalid.`);
  return { first: text(parameters.first, `${label}.first`), second: text(parameters.second, `${label}.second`), top };
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function titleVisual(source) {
  const value = titleParameters(source.parameters.value, `Football Reference Title ${source.id}`);
  return {
    html: `<div data-reference-title><div>${escapeHtml(value.first)}</div><div>${escapeHtml(value.second)}</div></div>`,
    css: `:scope>[data-reference-title]{position:absolute;left:0;right:0;top:${value.top}px;height:94px;box-sizing:border-box;padding:5px 20px 4px;background:#f4f2e8;color:#070707;font-family:Arial Black,Montserrat,Arial,Apple Color Emoji,Segoe UI Emoji,sans-serif;font-size:42px;font-weight:900;letter-spacing:-1.2px;line-height:1.02;text-align:center;white-space:nowrap}:scope>[data-reference-title]>div{height:43px}`,
  };
}

function flashVisual(source) {
  const value = revealFlashParameters(source.parameters.value, `Football Reveal Flash ${source.id}`);
  return {
    data: { flash: value },
    html: `<div data-reveal-flash><i data-reveal-flash-exposure></i><i data-reveal-flash-color></i></div>`,
    css: `:scope>[data-reveal-flash]{position:absolute;inset:0;opacity:0;pointer-events:none;will-change:opacity}:scope [data-reveal-flash]>i{position:absolute;inset:0;display:block}:scope [data-reveal-flash-exposure]{opacity:.62;mix-blend-mode:screen}:scope [data-reveal-flash-color]{opacity:.42;mix-blend-mode:screen}`,
    setup: `const flash=root.querySelector('[data-reveal-flash]');root.querySelector('[data-reveal-flash-exposure]').style.background=data.flash.glowColor;root.querySelector('[data-reveal-flash-color]').style.background=data.flash.color;const clamp=value=>Math.max(0,Math.min(1,value));return localFrame=>{const attackEnd=data.flash.attackFrames,holdEnd=attackEnd+data.flash.holdFrames,flashEnd=holdEnd+data.flash.decayFrames;let opacity=0;if(localFrame>=0&&localFrame<=flashEnd){if(localFrame<=attackEnd)opacity=attackEnd===0?data.flash.intensity:data.flash.intensity*localFrame/attackEnd;else if(localFrame<=holdEnd)opacity=data.flash.intensity;else if(data.flash.decayFrames>0){const decay=clamp((localFrame-holdEnd)/data.flash.decayFrames);opacity=data.flash.intensity*Math.pow(1-decay,2.2);}}flash.style.opacity=String(opacity);};`,
  };
}

function boardTimeline(context) {
  const value = boardParameters(context.item.parameters, `Football Tier Board ${context.item.id}`);
  return {
    title: context.item.name ?? "Tier board",
    layers: [{ kind: "text", text: `${value.entries.length} entries · ${value.rows.length} tiers` }],
  };
}

function titleTimeline(context) {
  const value = titleParameters(context.item.parameters, `Football Reference Title ${context.item.id}`);
  return { title: `${value.first} ${value.second}`, layers: [{ kind: "text", text: value.first }] };
}

function boardInspector(context) {
  const value = boardParameters(context.item.parameters, `Football Tier Board ${context.item.id}`);
  const tierOptions = value.rows.map(row => ({ value: row.id, label: row.label }));
  return [{
    id: "board",
    label: "Tier board",
    domain: "how",
    fields: [{
      id: "board-height",
      label: "Board height",
      control: "number",
      value: value.boardHeightRatio,
      minimum: 0.25,
      maximum: 0.55,
      step: 0.01,
      operation: next => ({ kind: "board-height.set", value: next }),
    }, {
      id: "entry-motion",
      label: "Entry motion",
      control: "select",
      value: value.entryMotion,
      options: [
        { value: "stage-then-place", label: "Stage then place" },
        { value: "pop-in-place", label: "Pop in place" },
      ],
      operation: next => ({ kind: "entry-motion.set", value: next }),
    }],
    collections: [{
      id: "rows",
      label: "Tiers",
      rows: value.rows.map(row => ({
        id: row.id,
        label: row.label,
        fields: [{
          id: `row:${row.id}:label`,
          label: "Label",
          control: "text",
          value: row.label,
          operation: next => ({ kind: "row.label.set", row: row.id, value: next }),
        }, {
          id: `row:${row.id}:color`,
          label: "Color",
          control: "color",
          value: row.color,
          operation: next => ({ kind: "row.color.set", row: row.id, value: next }),
        }],
      })),
    }, {
      id: "entries",
      label: "Entries",
      rows: value.entries.map(entry => ({
        id: entry.id,
        label: entry.label,
        fields: [{
          id: `entry:${entry.id}:label`,
          label: "Label",
          control: "text",
          value: entry.label,
          operation: next => ({ kind: "entry.label.set", entry: entry.id, value: next }),
        }, {
          id: `entry:${entry.id}:tier`,
          label: "Tier",
          control: "select",
          value: entry.tier,
          options: tierOptions,
          operation: next => ({ kind: "entry.tier.set", entry: entry.id, value: next }),
        }, {
          id: `entry:${entry.id}:input`,
          label: "Media input",
          control: "readout",
          value: context.item.media?.[entry.input]?.path ?? entry.input,
        }, {
          id: `entry:${entry.id}:timing`,
          label: "Timing",
          control: "readout",
          value: entry.preset ? "Preset" : "Timed",
        }],
      })),
    }],
  }];
}

function titleInspector(context) {
  const value = titleParameters(context.item.parameters, `Football Reference Title ${context.item.id}`);
  return [{
    id: "title",
    label: "Reference title",
    domain: "how",
    fields: [{ id: "first", label: "First line", control: "text", value: value.first,
      operation: next => ({ kind: "title.set", field: "first", value: next }) },
    { id: "second", label: "Second line", control: "text", value: value.second,
      operation: next => ({ kind: "title.set", field: "second", value: next }) },
    { id: "top", label: "Top", control: "number", value: value.top, minimum: 0, maximum: 400, step: 1,
      operation: next => ({ kind: "title.set", field: "top", value: next }) }],
  }];
}

function flashInspector(context) {
  const value = revealFlashParameters(context.item.parameters, `Football Reveal Flash ${context.item.id}`);
  return [{
    id: "flash",
    label: "Reveal flash",
    domain: "how",
    fields: [
      ["intensity", "Intensity", "number", { minimum: 0, maximum: 1, step: 0.01 }],
      ["attackFrames", "Attack", "number", { minimum: 0, step: 1, unit: "frames" }],
      ["holdFrames", "Hold", "number", { minimum: 0, step: 1, unit: "frames" }],
      ["decayFrames", "Decay", "number", { minimum: 0, step: 1, unit: "frames" }],
      ["color", "Color", "color", {}],
      ["glowColor", "Glow", "color", {}],
    ].map(([field, label, control, options]) => ({
      id: field,
      label,
      control,
      value: value[field],
      ...options,
      operation: next => ({ kind: "flash.set", field, value: next }),
    })),
  }];
}

function editComponentParameters(operation, context) {
  const parameters = structuredClone(record(context.item.parameters, `Component ${context.item.id} parameters`));
  const selected = record(operation, `Component ${context.item.id} operation`);
  if (context.item.component.symbol === "tier-board") {
    if (selected.kind === "board-height.set") parameters.boardHeightRatio = selected.value;
    else if (selected.kind === "entry-motion.set") parameters.entryMotion = selected.value;
    else if (selected.kind === "row.label.set" || selected.kind === "row.color.set") {
      const row = parameters.rows?.find(value => record(value, "Tier row").id === selected.row);
      if (row === undefined) throw new Error(`Tier board has no row ${selected.row}.`);
      row[selected.kind === "row.label.set" ? "label" : "color"] = selected.value;
    } else if (selected.kind === "entry.label.set" || selected.kind === "entry.tier.set") {
      const entry = parameters.entries?.find(value => record(value, "Tier entry").id === selected.entry);
      if (entry === undefined) throw new Error(`Tier board has no entry ${selected.entry}.`);
      entry[selected.kind === "entry.label.set" ? "label" : "tier"] = selected.value;
    } else throw new Error(`Tier board operation ${selected.kind} is unavailable.`);
    boardParameters(parameters, `Football Tier Board ${context.item.id}`);
    return parameters;
  }
  if (context.item.component.symbol === "reference-title") {
    if (selected.kind !== "title.set" || !["first", "second", "top"].includes(selected.field)) {
      throw new Error(`Reference title operation ${selected.kind} is unavailable.`);
    }
    parameters[selected.field] = selected.value;
    titleParameters(parameters, `Football Reference Title ${context.item.id}`);
    return parameters;
  }
  if (context.item.component.symbol === "reveal-flash") {
    if (selected.kind !== "flash.set"
        || !["intensity", "attackFrames", "holdFrames", "decayFrames", "color", "glowColor"].includes(selected.field)) {
      throw new Error(`Reveal flash operation ${selected.kind} is unavailable.`);
    }
    parameters[selected.field] = selected.value;
    revealFlashParameters(parameters, `Football Reveal Flash ${context.item.id}`);
    return parameters;
  }
  throw new Error(`Component ${context.item.component.symbol} has no parameter authoring.`);
}

export const hypitPackage = {
  package: packageName,
  contributions: [
    {
      kind: "hypit.nle-timeline-presentation",
      value: {
        kind: "hypit.nle-timeline-presentation",
        package: packageName,
        components: [
          { component: componentSymbol("tier-board"), displayName: "Tier board", tone: "violet",
            chrome: "group", heightPx: 72, project: boardTimeline },
          { component: componentSymbol("reference-title"), displayName: "Reference title", tone: "magenta",
            chrome: "standard", project: titleTimeline },
          { component: componentSymbol("reveal-flash"), displayName: "Reveal flash", tone: "orange",
            chrome: "compact" },
        ],
        adjusts: [],
      },
    },
    {
      kind: "hypit.nle-inspector-presentation",
      value: {
        kind: "hypit.nle-inspector-presentation",
        package: packageName,
        components: [
          { component: componentSymbol("tier-board"), project: boardInspector },
          { component: componentSymbol("reference-title"), project: titleInspector },
          { component: componentSymbol("reveal-flash"), project: flashInspector },
        ],
        componentValues: [],
        operators: [],
      },
    },
    {
      kind: "hypit.nle-authoring",
      value: {
        kind: "hypit.nle-authoring",
        package: packageName,
        components: [
          { component: componentSymbol("tier-board"), editParameters: editComponentParameters },
          { component: componentSymbol("reference-title"), editParameters: editComponentParameters },
          { component: componentSymbol("reveal-flash"), editParameters: editComponentParameters },
        ],
        componentValues: [],
        operators: [],
      },
    },
    {
      kind: "hypit.nle-lowering",
      value: { components: [
        { symbol: "tier-board", resolve: (item, context) => componentSource(item, context, "tier-board") },
        { symbol: "reference-title", resolve: (item, context) => componentSource(item, context, "reference-title") },
        { symbol: "reveal-flash", resolve: (item, context) => componentSource(item, context, "reveal-flash") },
      ] },
    },
    {
      kind: "hypit.audiovisual-html",
      value: { sources: [
        { symbol: "tier-board", compile: tierBoardVisual },
        { symbol: "reference-title", compile: titleVisual },
        { symbol: "reveal-flash", compile: flashVisual },
      ] },
    },
  ],
  catalog: [],
};

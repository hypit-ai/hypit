const packageName = "@hypit/picture-effects";
const symbol = name => ({ package: packageName, symbol: name });
const controlledFields = {
  transform: [
    ["translateX", "Translate X", {}],
    ["translateY", "Translate Y", {}],
    ["scaleX", "Scale X", { step: 0.01 }],
    ["scaleY", "Scale Y", { step: 0.01 }],
    ["rotationDegrees", "Rotation", { step: 1, unit: "deg" }],
    ["originX", "Origin X", { minimum: 0, maximum: 1, step: 0.01 }],
    ["originY", "Origin Y", { minimum: 0, maximum: 1, step: 0.01 }],
  ],
  filter: [
    ["opacity", "Opacity", { minimum: 0, maximum: 1, step: 0.01 }],
    ["blurRadius", "Blur", { minimum: 0, step: 0.1, unit: "px" }],
    ["brightness", "Brightness", { minimum: 0, step: 0.01 }],
    ["contrast", "Contrast", { minimum: 0, step: 0.01 }],
    ["saturation", "Saturation", { minimum: 0, step: 0.01 }],
    ["hue", "Hue", { step: 1, unit: "deg" }],
    ["grayscale", "Grayscale", { minimum: 0, maximum: 1, step: 0.01 }],
    ["sepia", "Sepia", { minimum: 0, maximum: 1, step: 0.01 }],
    ["invert", "Invert", { minimum: 0, maximum: 1, step: 0.01 }],
  ],
};
const interpolationOptions = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in/out" },
];

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function exactLabel(value) {
  const exact = record(value, "Picture effect keyframe time");
  const base = record(exact.timeBase, "Picture effect keyframe time base");
  return `${exact.ticks} × ${base.numerator}/${base.denominator} s`;
}

function controlledStates(parameters, processId) {
  if (parameters.kind === "constant") {
    return [{ id: "state", label: "State", state: record(parameters.state, `${processId} state`) }];
  }
  if (parameters.kind !== "keyframes" || !Array.isArray(parameters.keyframes)
      || parameters.keyframes.length === 0) {
    throw new Error(`Picture effect ${processId} parameters are invalid.`);
  }
  return parameters.keyframes.map((keyframe, index) => {
    const value = record(keyframe, `${processId} keyframe ${index + 1}`);
    return {
      id: `keyframe-${index}`,
      label: `Keyframe ${index + 1}`,
      at: exactLabel(value.at),
      state: record(value.state, `${processId} keyframe ${index + 1} state`),
      index,
    };
  });
}

function controlledInspector(kind, context) {
  const parameters = record(context.parameters, `${context.process.id} parameters`);
  const fields = [{ id: "kind", label: "Mode", control: "readout", value: String(parameters.kind) }];
  if (parameters.kind === "keyframes") {
    const interpolation = record(parameters.interpolation, `${context.process.id} interpolation`);
    fields.push({
      id: "interpolation",
      label: "Interpolation",
      control: "select",
      value: String(interpolation.kind),
      options: interpolationOptions,
      operation: value => ({ kind: "interpolation.set", value }),
    });
  }
  for (const entry of controlledStates(parameters, context.process.id)) {
    if (entry.at !== undefined) {
      fields.push({ id: `${entry.id}:at`, label: `${entry.label} time`, control: "readout", value: entry.at });
    }
    for (const [field, label, options] of controlledFields[kind]) {
      const value = entry.state[field];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      fields.push({
        id: `${entry.id}:${field}`,
        label: `${entry.label} ${label}`,
        control: "number",
        value,
        ...options,
        operation: next => ({
          kind: "state.set",
          ...(entry.index === undefined ? {} : { keyframe: entry.index }),
          field,
          value: next,
        }),
      });
    }
  }
  return [{
    id: "parameters",
    label: `${kind === "transform" ? "Transform" : "Filter"} · ${context.process.id}`,
    domain: "how",
    fields,
  }];
}

function frameInspector(context) {
  const parameters = record(context.parameters, `${context.process.id} parameters`);
  const treatment = record(parameters.treatment ?? parameters, `${context.process.id} treatment`);
  const clip = treatment.clip === undefined ? undefined : record(treatment.clip, `${context.process.id} clip`);
  const shadows = treatment.shadows === undefined ? [] : treatment.shadows;
  if (!Array.isArray(shadows)) throw new Error(`Picture effect ${context.process.id} shadows are invalid.`);
  return [{
    id: "parameters",
    label: `Frame · ${context.process.id}`,
    domain: "how",
    fields: [
      { id: "clip", label: "Clip", control: "readout", value: String(clip?.kind ?? "none") },
      { id: "shadows", label: "Shadows", control: "readout", value: shadows.length },
      { id: "border", label: "Border", control: "readout", value: treatment.border === undefined ? "none" : "configured" },
    ],
  }];
}

function editControlledParameters(operation, context) {
  const parameters = structuredClone(record(context.parameters, `${context.process.id} parameters`));
  const selected = record(operation, `${context.process.id} operation`);
  if (selected.kind === "interpolation.set") {
    if (parameters.kind !== "keyframes"
        || !interpolationOptions.some(option => option.value === selected.value)) {
      throw new Error(`Picture effect ${context.process.id} interpolation operation is invalid.`);
    }
    parameters.interpolation = { kind: selected.value };
    return parameters;
  }
  if (selected.kind !== "state.set" || typeof selected.field !== "string"
      || typeof selected.value !== "number" || !Number.isFinite(selected.value)) {
    throw new Error(`Picture effect ${context.process.id} state operation is invalid.`);
  }
  const allowed = controlledFields[context.process.operator.symbol]?.some(([field]) => field === selected.field);
  if (allowed !== true) throw new Error(`Picture effect ${context.process.id} field ${selected.field} is unavailable.`);
  let state;
  if (parameters.kind === "constant" && selected.keyframe === undefined) {
    state = record(parameters.state, `${context.process.id} state`);
  } else if (parameters.kind === "keyframes" && Number.isSafeInteger(selected.keyframe)
      && selected.keyframe >= 0 && selected.keyframe < parameters.keyframes.length) {
    state = record(parameters.keyframes[selected.keyframe].state,
      `${context.process.id} keyframe ${selected.keyframe + 1} state`);
  } else {
    throw new Error(`Picture effect ${context.process.id} state address is invalid.`);
  }
  state[selected.field] = selected.value;
  return parameters;
}
const helpers = `
const seconds=v=>Number(v.ticks)*v.timeBase.numerator/v.timeBase.denominator;
const control=(name,frame)=>seconds(context.controlPosition(name,frame)||{ticks:'0',timeBase:{numerator:1,denominator:1}});
const ease=(x,kind)=>kind==='ease-in'?x*x:kind==='ease-out'?1-(1-x)*(1-x):kind==='ease-in-out'?(x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2):x;
const valueAt=(p,frame)=>{
 if(p.kind==='constant') return p.state||p;
 const frames=p.keyframes; const t=control('control',frame);
 if(t<=seconds(frames[0].at)) return frames[0].state;
 for(let i=0;i<frames.length-1;i++){const a=frames[i],b=frames[i+1],ta=seconds(a.at),tb=seconds(b.at);if(t<=tb){const q=ease((t-ta)/(tb-ta),p.interpolation?.kind);const out={};for(const k of Object.keys(a.state))out[k]=typeof a.state[k]==='number'?a.state[k]+(b.state[k]-a.state[k])*q:a.state[k];return out;}}
 return frames[frames.length-1].state;
};`;

const transformVisual = parameters => ({html:'<div data-transform>{{input:signal}}</div>',data:parameters,css:':scope>[data-transform]{position:absolute;inset:0;transform-origin:0 0}',setup:helpers+`
const element=root.querySelector('[data-transform]');return frame=>{const s=valueAt(data,frame),ox=(s.originX??.5)*context.width,oy=(s.originY??.5)*context.height;element.style.transformOrigin=ox+'px '+oy+'px';element.style.transform='translate('+(s.translateX||0)+'px,'+(s.translateY||0)+'px) rotate('+(s.rotationDegrees||0)+'deg) scale('+(s.scaleX??1)+','+(s.scaleY??1)+')';};`});
const filterVisual = parameters => ({html:'<div data-filter>{{input:signal}}</div>',data:parameters,css:':scope>[data-filter]{position:absolute;inset:0}',setup:helpers+`
const element=root.querySelector('[data-filter]');return frame=>{const s=valueAt(data,frame);element.style.opacity=String(s.opacity??1);element.style.filter='blur('+(s.blurRadius||0)+'px) brightness('+(s.brightness??1)+') contrast('+(s.contrast??1)+') saturate('+(s.saturation??1)+') hue-rotate('+(s.hue||0)+'deg) grayscale('+(s.grayscale||0)+') sepia('+(s.sepia||0)+') invert('+(s.invert||0)+')';};`});
const frameVisual = parameters => {const t=parameters.treatment||parameters;const shadows=(t.shadows||[]).map(shadow=>`drop-shadow(${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blurPx}px ${shadow.color})`).join(' ');return {html:'<div data-frame>{{input:signal}}</div>',css:`:scope>[data-frame]{position:absolute;inset:0;${t.clip?.kind==='rounded'?`overflow:hidden;border-radius:${t.clip.radiusPx}px;`:''}${shadows?`filter:${shadows};`:''}${t.border?`border:${t.border.widthPx}px solid ${t.border.color};`:''}}`};};
const transitionVisual = (parameters, duration) => ({html:'<div data-outgoing>{{input:outgoing}}</div><div data-incoming>{{input:incoming}}</div>',data:{...parameters,domainDuration:duration},css:':scope>[data-outgoing],:scope>[data-incoming]{position:absolute;inset:0}',setup:helpers+`
const outgoing=root.querySelector('[data-outgoing]'),incoming=root.querySelector('[data-incoming]'),duration=seconds(data.domainDuration);return frame=>{let p=Math.max(0,Math.min(1,control('progress',frame)/Math.max(.000001,duration)));p=ease(p,data.easing);outgoing.style.opacity=String(1-p);incoming.style.opacity=String(p);};`});

const matteEllipse = symbol("matte-ellipse");
const ellipseImage = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="white"/></svg>',
)}`;

export const hypitPackage = {
  package: packageName,
  contributions: [
    { kind: "hypit.nle-component-definition", value: {
      kind: "hypit.nle-component-definition",
      package: packageName,
      components: [{ component: matteEllipse, role: "picture", sourceTime: () => ({ kind: "constant" }) }],
    } },
    { kind: "hypit.nle-authoring", value: {
      kind: "hypit.nle-authoring",
      package: packageName,
      components: [],
      componentValues: [],
      operators: [
        { operator: symbol("transform"), editParameters: editControlledParameters },
        { operator: symbol("filter"), editParameters: editControlledParameters },
      ],
      transitions: [{ operator: symbol("transition"), editParameters(operation, { transition }) {
        if (operation.kind !== "easing.set" || !interpolationOptions.some(option => option.value === operation.value)) {
          throw new Error(`Crossfade ${transition.id} easing is invalid.`);
        }
        return { ...transition.parameters, easing: operation.value };
      } }],
    } },
    { kind: "hypit.nle-inspector-presentation", value: {
      kind: "hypit.nle-inspector-presentation",
      package: packageName,
      components: [],
      componentValues: [],
      operators: [
        { operator: symbol("frame"), project: frameInspector },
        { operator: symbol("transform"), project: context => controlledInspector("transform", context) },
        { operator: symbol("filter"), project: context => controlledInspector("filter", context) },
      ],
      transitions: [{ operator: symbol("transition"), project: ({ transition }) => [{
        id: "parameters", label: "Crossfade", domain: "how",
        fields: [{ id: "easing", label: "Easing", control: "select", value: transition.parameters.easing ?? "linear",
          options: interpolationOptions, operation: value => ({ kind: "easing.set", value }) }],
      }] }],
    } },
    { kind: "hypit.nle-render", value: {
      components: [{ symbol: matteEllipse.symbol, render: () => ({
        region: { x: 0, y: 0, width: 100, height: 100 },
        visual: {
          html: `<img src="${ellipseImage}" alt="">`,
          css: ':scope > img { position: absolute; inset: 0; width: 100%; height: 100%; }',
        },
      }) }],
      pictureProcesses: [
        { symbol: "frame", render: (_process, { parameters }) => ({ visual: frameVisual(parameters) }) },
        { symbol: "transform", render: (_process, { parameters }) => ({
          controls: ["control"], visual: transformVisual(parameters),
        }) },
        { symbol: "filter", render: (_process, { parameters }) => ({
          controls: ["control"], visual: filterVisual(parameters),
        }) },
      ],
      transitions: [{ symbol: "transition", render: (transition, { domain }) => ({
        controls: ["progress"], visual: transitionVisual(transition.parameters, domain.duration),
      }) }],
    } },
  ],
  catalog: [
    { id: "crossfade", kind: "hypit.nle-transition", title: "Crossfade", value: {
      operator: symbol("transition"), parameters: { kind: "cross-dissolve", easing: "linear" },
      duration: { ticks: "1", timeBase: { numerator: 1, denominator: 3 } },
    } },
    { id: "transform", kind: "hypit.nle-process", title: "Transform", value: {
      medium: "picture", operator: symbol("transform"),
      parameters: { kind: "constant", state: {
        translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0, originX: 0.5, originY: 0.5,
      } },
    } },
    { id: "warm-film", kind: "hypit.nle-adjust", title: "淡暖胶片", value: {
      medium: "picture", role: "filter", operator: symbol("filter"),
      parameters: { kind: "constant", state: { brightness: 1.025, contrast: 1.055, saturation: 0.9, sepia: 0.12 } },
      duration: { ticks: "5", timeBase: { numerator: 1, denominator: 1 } },
    } },
    { id: "filter", kind: "hypit.nle-process", title: "Picture adjustments", value: {
      medium: "picture", operator: symbol("filter"),
      parameters: { kind: "constant", state: {
        opacity: 1, blurRadius: 0, brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0,
      } },
    } },
  ],
};

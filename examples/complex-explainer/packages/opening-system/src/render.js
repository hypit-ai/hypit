import { palette } from "@explainer/visual-language";
import { flagSetup } from "./flag-cloth.js";
import { sealPresentVisualTrack } from "@hypit/composition";
import { htmlVisual } from "@hypit/html-program";
import { preparedVisualSource } from "@hypit/media";
import { assertTemporalWindowFor, composeTemporalMaps } from "@hypit/temporal";
import { preparedSampling } from "./frame-sampling.js";

const digits = {
  0: ["11111", "10001", "10001", "10001", "10001", "10001", "11111"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "11111"],
  2: ["11111", "00001", "00001", "11111", "10000", "10000", "11111"],
  3: ["11111", "00001", "00001", "01111", "00001", "00001", "11111"],
  4: ["10001", "10001", "10001", "11111", "00001", "00001", "00001"],
  5: ["11111", "10000", "10000", "11111", "00001", "00001", "11111"],
  6: ["11111", "10000", "10000", "11111", "10001", "10001", "11111"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["11111", "10001", "10001", "11111", "10001", "10001", "11111"],
  9: ["11111", "10001", "10001", "11111", "00001", "00001", "11111"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
};
const dotSvg = `<svg class="clock" viewBox="0 0 25 7" aria-label="Timer"></svg>`;
const dotSetup = `const patterns=data.digits, clock=root.querySelector('.clock');let previous='';
const showClock=(seconds)=>{const n=Math.max(0,Math.floor(Math.abs(seconds))),str=Math.floor(n/60)+':'+String(n%60).padStart(2,'0');if(str===previous)return;previous=str;let x=0,html='';for(const ch of str){const p=patterns[ch];for(let y=0;y<7;y++)for(let c=0;c<p[y].length;c++)if(p[y][c]==='1')html+='<rect x="'+(x+c)+'" y="'+y+'" width=".79" height=".79" rx=".035"/>';x+=p[0].length+1;}clock.setAttribute('viewBox','0 0 '+(x-1)+' 7');clock.innerHTML=html;};`;
const style = (obj) =>
  Object.entries(obj).map(([name, value]) => ({ name, value }));
function text(id, value, font, size, color) {
  return {
    id,
    kind: "text",
    text: value,
    fonts: [font],
    style: style({
      "font-size": size + "px",
      "line-height": 1.2,
      color,
      "white-space": "nowrap",
    }),
  };
}
function track(timeline, within, window, o, program, children = [], presents) {
  assertTemporalWindowFor(window, { subjectId: o.id, timeline: timeline });
  return sealPresentVisualTrack({
    id: o.id,
    timelineId: timeline.id,

    presents: presents ?? [
      {
        id: o.id,
        span: window.span,
        root: {
          id: "scene",
          kind: "program",
          program,
          style: style({
            position: "absolute",
            left: within.xPx + "px",
            top: within.yPx + "px",
            width: within.widthPx + "px",
            height: within.heightPx + "px",
          }),
          slots: children.map((element) => ({ name: element.id, element })),
        },
      },
    ],
  });
}
export function renderTitle(timeline, within, window, font, o, bounce) {
  const w = within.widthPx;
  const letters = Array.from(o.title);
  return track(
    timeline,
    within,
    window,
    o,
    htmlVisual({
      html: `
<div class="time">${dotSvg}</div
><div class="titlebox"
  ><div class="titlebar"><i></i><i></i><i></i><span>HYPIT.EXE</span><b>×</b></div
  ><canvas class="pixel-world" width="216" height="116"></canvas><div class="eyebrow">{{subtitle}}</div><div class="headline">${letters.map((_, i) => `<span class="title-letter">{{letter-${i}}}</span>`).join("")}</div
  ><svg class="spark" viewBox="0 0 7 7">
    <path
      d="M3 0h1v2h1v1h2v1H5v1H4v2H3V5H2V4H0V3h2V2h1Z"
      fill="${palette.pink}"
      stroke="${palette.ink}"
      stroke-width=".2"
    /></svg><div class="pixel-trim"><i></i><i></i><i></i><i></i></div><span class="window-grip">▰▰▰</span>
></div>
`,
      css: `:scope{pointer-events:none;color:${palette.ink}}.time{position:absolute;left:32%;top:${o.timerY * 100}%;width:36%;color:#ffe6f4;filter:drop-shadow(3px 4px 0 ${palette.ink}) drop-shadow(0 0 5px #fff1fa) drop-shadow(0 0 17px #ff58b4)}.clock{width:100%;fill:currentColor;overflow:visible;stroke:#73314f;stroke-width:.10;paint-order:stroke fill}.titlebox{position:absolute;left:10%;top:${o.titleY * 100}%;width:80%;height:27%;background:#fff3f9;border:5px solid ${palette.ink};border-radius:16px;box-shadow:13px 15px 0 ${palette.ink}}.titlebar{height:46px;display:flex;align-items:center;gap:9px;padding:0 16px;border-bottom:4px solid ${palette.ink};background:#f9a4cc;border-radius:11px 11px 0 0;font:20px Menlo,monospace}.titlebar i{width:13px;height:13px;background:#fdf4fa;border:2px solid ${palette.ink}}.titlebar i:nth-child(2){background:#b7dfc8}.titlebar i:nth-child(3){background:#d4baf6}.titlebar span{margin-left:12px}.titlebar b{margin-left:auto;font-size:32px}.pixel-world{position:absolute;left:0;top:50px;width:100%;height:calc(100% - 50px);border-radius:0 0 10px 10px;image-rendering:pixelated}.eyebrow{position:absolute;top:20%;left:0;width:100%;display:flex;justify-content:center}.eyebrow>*{color:${palette.ink}!important;-webkit-text-stroke:0!important}.headline{position:absolute;top:39%;left:0;width:100%;display:flex;justify-content:center}.title-letter{display:inline-block;will-change:transform}.title-letter>*{color:${palette.pink}!important;-webkit-text-stroke:3px ${palette.ink};paint-order:stroke fill;filter:drop-shadow(6px 6px 0 ${palette.ink})}.spark{position:absolute;width:54px;height:54px;right:35px;bottom:40px;image-rendering:pixelated}.pixel-trim{position:absolute;left:30px;bottom:35px;display:flex;gap:9px}.pixel-trim i{width:12px;height:12px;border:2px solid ${palette.ink};background:#f8a1cb}.pixel-trim i:nth-child(2){background:#cbb6ed}.pixel-trim i:nth-child(3){background:#bde3c7}.window-grip{position:absolute;right:12px;bottom:6px;font:11px monospace;letter-spacing:2px;color:#b687a2}`,
      data: { digits, seconds: o.seconds, fps: timeline.frameRate.numerator / timeline.frameRate.denominator, bounce: bounce.frame - window.span.startFrame },
      setup: dotSetup + `showClock(data.seconds);
const world=root.querySelector('.pixel-world').getContext('2d'),letters=[...root.querySelectorAll('.title-letter')];
world.imageSmoothingEnabled=false;
return frame=>{
 const t=frame/data.fps;
 world.fillStyle='#fff3f9';world.fillRect(0,0,216,116);
 // The road recedes to a clear central horizon; scenery stays at its sides.
 world.fillStyle='#f1d7ea';for(let i=0;i<5;i++){const x=9+i*48;world.fillRect(x,8+(i%2)*6,18,3);world.fillRect(x+4,5+(i%2)*6,9,3);}
 // Elevated valley walls flank a low clear center behind the title.
 for(let side of [-1,1])for(let x=0;x<72;x+=3){const k=x/72,high=56+Math.floor(k*k*47),px=side<0?x:213-x;world.fillStyle='#d7cee9';world.fillRect(px,high,3,116-high);world.fillStyle='#d7b6e4';world.fillRect(px,high+6,3,110-high);}
 const horizon=99;
 for(let y=horizon;y<116;y++){
  const depth=(y-horizon)/(116-horizon),half=5+depth*70;
  world.fillStyle='#d7dfbd';world.fillRect(0,y,216,1);
  world.fillStyle='#d9b6d7';world.fillRect(Math.floor(108-half),y,Math.ceil(half*2),1);
  world.fillStyle='#fff0f7';world.fillRect(Math.floor(108-half),y,Math.max(1,depth*3),1);world.fillRect(Math.floor(108+half),y,Math.max(1,depth*3),1);
  const stripe=((1/Math.max(.02,depth)-t*2.3)%2+2)%2;
  if(stripe<.85){world.fillStyle='#fff5fc';world.fillRect(Math.floor(108-depth*2),y,Math.max(1,depth*4),1);}
 }
 for(let i=0;i<7;i++){
  const p=((i/7+t*.22)%1),d=p*p,y=horizon+d*17,size=2+d*10;
  for(const side of [-1,1]){const x=108+side*(70+d*45);world.fillStyle='#bd8dad';world.fillRect(Math.floor(x-size*.15),Math.floor(y-size*.7),Math.max(1,size*.3),Math.ceil(size*.7));world.fillStyle=i%2?'#f5a4c9':'#b7cda9';world.fillRect(Math.floor(x-size*.6),Math.floor(y-size*1.7),Math.ceil(size*1.2),Math.ceil(size));world.fillRect(Math.floor(x-size*.3),Math.floor(y-size*2),Math.ceil(size*.6),Math.ceil(size*.3));}
 }
 letters.forEach((letter,i)=>{
  const age=(frame-data.bounce)/data.fps-i*.085,q=age/.42;
  const jump=q>=0&&q<1?Math.sin(q*Math.PI):0;
  letter.style.transform='translateY('+(-26*jump)+'px) rotate('+(-4*jump)+'deg) scale('+(1+.055*jump)+')';
 });
};`,
    }),
    [
      ...letters.map((letter, i) => text(`letter-${i}`, letter, font, w * o.titleSize, o.color)),
      text("subtitle", o.subtitle, font, w * 0.078, `${palette.ink}`),
    ],
  );
}

export function renderTimer(timeline, within, window, font, o, logo, stop) {
  const fps = timeline.frameRate.numerator / timeline.frameRate.denominator;
  return track(
    timeline,
    within,
    window,
    o,
    htmlVisual({
      html: `
<div class="badge"
  ><div class="pennant"><canvas class="flag-canvas"></canvas></div><div class="backplate"></div
  ><div class="plaque"><svg class="plaque-outline" viewBox="0 0 300 115" preserveAspectRatio="none"><path d="M-3 2H276L298 113H-3Z" fill="${palette.pink}" stroke="${palette.ink}" stroke-width="4" stroke-linejoin="round"/></svg><div class="topic">{{title}}</div><div class="sub">{{subtitle}}</div></div
  ><div class="readout">${dotSvg}</div></div
><div class="logo-resource">{{flag-logo}}</div>
`,
      css: `:scope{pointer-events:none}.badge{position:absolute;left:${o.x * 100}%;top:${o.y * 100}%;width:${o.width * 100}%;height:10.6%;color:#edf6ff;filter:drop-shadow(0 3px 3px #0007)}.backplate{position:absolute;z-index:0;left:-4%;top:-13%;width:80%;height:110%;border:3px solid ${palette.ink};border-radius:2px 5px 12px 2px;transform:skewX(10deg);background:#fff0f7;box-shadow:5px 6px 0 ${palette.ink}}.plaque{position:absolute;z-index:2;inset:0 0 43%;overflow:visible}.plaque-outline{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(5px 6px 0 ${palette.ink})}.topic{position:absolute;top:12%;left:8%;width:78%;display:flex;justify-content:center}.sub{position:absolute;top:73%;left:8%;width:78%;display:flex;justify-content:center;opacity:.64;letter-spacing:.06em}.readout{position:absolute;z-index:3;top:67%;left:26%;width:45%;filter:none}.clock{width:100%;fill:currentColor;overflow:visible}.pennant{position:absolute;z-index:1;bottom:89%;left:19%;height:76%;width:69%}.flag-canvas{display:block;width:100%;height:100%;image-rendering:pixelated}.logo-resource{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}`,
      data: {
        digits,
        seconds: o.seconds,
        fps,
        entrance: o.entranceFrames,
        stop: stop.frame-window.span.startFrame,
        flagAmplitude: o.flagAmplitude,
        flagSpeed: o.flagSpeed,
        flagColor: o.flagColor,
      },
      setup:
        dotSetup +
        flagSetup +
        `const badge=root.querySelector('.badge'),readout=root.querySelector('.readout');return frame=>{const p=Math.max(0,Math.min(1,frame/data.entrance)),e=1-Math.pow(1-p,3);badge.style.transform='translateX('+(-125*(1-e))+'%)';const held=frame>=data.stop,remain=data.seconds-Math.floor(Math.min(frame,data.stop,2*data.seconds*data.fps)/data.fps);showClock(held?data.seconds:remain);readout.style.color=held?'#e83f5f':remain<0?'#df3685':'${palette.ink}';const q=Math.max(0,Math.min(1,(frame-data.stop)/18)),flash=held?Math.sin(q*Math.PI):0;readout.style.filter='drop-shadow(0 0 '+(flash*22)+'px #ff2452)';badge.style.filter='drop-shadow(0 0 '+(flash*22)+'px #ff3e66)';drawFlag(frame);};`,
    }),
    [
      text(
        "title",
        o.title,
        font,
        within.widthPx * o.width * 0.16,
        `${palette.ink}`,
      ),
      text(
        "subtitle",
        o.subtitle,
        font,
        within.widthPx * o.width * 0.067,
        `${palette.ink}`,
      ),
      {
        id: "flag-logo",
        kind: "image",
        artifact: logo,
        style: [],
      },
    ],
  );
}
export function renderStage(timeline, within, window, items, o) {
  const presents = [];
  for (const [index, item] of items.entries()) {
    const start = Math.max(window.span.startFrame, item.window.span.startFrame),
      end = Math.min(
        window.span.endFrameExclusive,
        item.window.span.endFrameExclusive,
      );
    if (end <= start) continue;
    const w = within.widthPx,
      h = within.heightPx;
    const artifact = item.media?.source ?? item.image;
    if (!artifact) throw Error("Stage video needs prepared visual media.");
    let sampling;
    if (item.media) {
      if (!item.media.visual) throw Error("Stage video needs a selected visual member.");
      sampling = composeTemporalMaps(preparedSampling(`${o.id}:${item.id ?? index}`, timeline.frameRate, end - start,
        item.media.domain, [
          {
            target: { startFrame: 0, endFrameExclusive: end - start },
            sourceAtStartFrame: item.sourceStart + start - item.window.span.startFrame,
            rate: { numerator: 1, denominator: 1 },
          },
        ]), item.media.visual.map);
    }
    const children = ["back", "front"].map((id, i) => ({
      id,
      kind: item.media ? "video" : "image",
      ...(item.media ? { source: preparedVisualSource(item.media) } : { artifact }),
      muted: true,
      ...(sampling ? { sampling } : {}),
      style: style({
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        "object-fit": i === 0 ? "cover" : o.fit,
      }),
    }));
    const program = htmlVisual({
      html: `
<div class="back">{{back}}</div><div class="shade"></div
><div class="front"
  ><div class="aperture"><div class="content">{{front}}</div></div></div
>
`,
      css: `:scope{background:#070a10;overflow:hidden}.back{position:absolute;inset:-8%;filter:blur(${(o.blur * w) / 1080}px) brightness(${o.brightness});transform:scale(${o.zoom})}.shade{position:absolute;inset:0;background:linear-gradient(180deg,#0001 0%,transparent 40%,#000a 86%,#000d 100%)}.front{position:absolute;left:${o.x * 100}%;top:${o.y * 100}%;width:${o.width * 100}%;height:${o.height * 100}%;overflow:hidden;border-radius:${o.radius}px;filter:drop-shadow(0 9px 20px #0004)}.aperture{position:absolute;inset:0;overflow:hidden}.content{position:absolute;inset:0;transform-origin:center}`,
      data: {
        fit: o.fit,
        rate: o.pushRate,
        fps: timeline.frameRate.numerator / timeline.frameRate.denominator,
        offset: start - item.window.span.startFrame,
      },
      setup: `const content=root.querySelector('.content'),front=root.querySelector('.front'),aperture=root.querySelector('.aperture'),media=content.querySelector('img,video');return frame=>{if(data.fit==='contain'){const w=media?.naturalWidth||media?.videoWidth,h=media?.naturalHeight||media?.videoHeight;if(w&&h){const scale=Math.min(front.clientWidth/w,front.clientHeight/h);aperture.style.inset='auto';aperture.style.width=w*scale+'px';aperture.style.height=h*scale+'px';aperture.style.left=(front.clientWidth-w*scale)/2+'px';aperture.style.top=(front.clientHeight-h*scale)/2+'px';}}content.style.transform='scale('+(1+(frame+data.offset)/data.fps*data.rate)+')';};`,
    });
    presents.push({
      id: `${o.id}.${item.id}`,
      subjectId: item.id,
      span: { startFrame: start, endFrameExclusive: end },
      root: {
        id: "scene",
        kind: "program",
        program,
        style: style({
          position: "absolute",
          inset: 0,
          width: w + "px",
          height: h + "px",
        }),
        slots: children.map((element) => ({ name: element.id, element })),
      },
    });
  }
  return track(timeline, within, window, o, undefined, [], presents);
}

// An independent screen texture: the author's stack places it above picture and below graphics.
export function renderVeil(timeline, within, window, o) {
  const cell = (o.cell * within.widthPx) / 1080;
  const patterns = {
    mesh: `repeating-conic-gradient(from 45deg,rgba(255,255,255,.52) 0% 25%,rgba(0,0,0,.55) 0% 50%)`,
    dots: `radial-gradient(circle,rgba(0,0,0,.8) 0 22%,transparent 26%)`,
    hatch: `repeating-linear-gradient(-45deg,rgba(255,255,255,.35) 0 1px,transparent 1px ${cell}px)`,
  };
  return track(
    timeline,
    within,
    window,
    o,
    htmlVisual({
      html: '<div class="wash"></div><div class="pattern"></div>',
      css: `:scope{pointer-events:none}.wash,.pattern{position:absolute;inset:0}.wash{background:${o.tint};opacity:${o.shade}}.pattern{background-image:${patterns[o.pattern]};background-size:${cell}px ${cell}px;opacity:${o.amount}}`,
      data: {
        length: window.span.endFrameExclusive - window.span.startFrame,
        fade: o.fadeFrames,
      },
      setup: `return frame=>{const f=data.fade;root.style.opacity=String(f?Math.max(0,Math.min(1,frame/f,(data.length-1-frame)/f)):1);};`,
    }),
  );
}

export function renderFlag(timeline, within, window, o, logo) {
 return track(timeline, within, window, o, htmlVisual({
  html: '<div class="floor-cloth"><canvas class="flag-canvas"></canvas></div><div class="logo-resource">{{flag-logo}}</div>',
  css: `:scope{pointer-events:none}.floor-cloth{position:absolute;left:${o.x*100}%;top:${o.y*100}%;width:${o.width*100}%;height:${o.height*100}%;filter:none}.flag-canvas{display:block;width:100%;height:100%;image-rendering:pixelated}.logo-resource{position:absolute;opacity:0;width:1px;height:1px}`,
  data: {fps:timeline.frameRate.numerator/timeline.frameRate.denominator,flagPose:'floor',flagColor:o.flagColor,flagAmplitude:o.flagAmplitude,flagSpeed:o.flagSpeed},
  setup: flagSetup+`const cloth=root.querySelector('.floor-cloth');return frame=>{cloth.style.opacity=Math.min(1,frame/12);drawFlag(frame);};`
 }), [{id:'flag-logo',kind:'image',artifact:logo,style:[]}]);
}

import { css } from "./styles.js";
import { animation } from "./animation.js";
import { scene } from "../../shared/scene.js";
import { bar, pointer, workCss, workSetup } from "../../shared/workshop-language.js";
import {
  studioBar,
  inspector,
  librarySide,
  faceless,
  studioCss,
  portraitMotion,
} from "../../shared/studio-art.js";
import { hypitSymbol } from "../../shared/brand-marks.js";
const wordBank = (name, words, widths) =>
  `<div class="word-bank bank-${name}">${words.map((word, i) => `<span class="word" style="width:${widths[i]}px">${word}</span>`).join("")}</div>`;
const line = (cls, label, body) =>
  `<div class="semantic-row ${cls}"><b>${label}</b><div class="semantic-row-body">${body}</div></div>`;
export function renderSemanticWorkshop(t, c, w, font, o, events, m) {
  const html = `
<div class="work-ground"></div
><div class="semantic-studio hs-window"
  >${studioBar()}${librarySide()}<div class="hs-preview-label hs-tab">Preview</div
  ><div class="hs-preview-matte"></div>${inspector()}<div class="semantic-person"
    >${faceless(1)}<div class="mini-result">#1 Hypit</div></div
  ></div
><div class="semantic-board work-window"
  >${bar("Hypit · Timeline")}${line("seconds", "TIME", "<span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span><span>5s</span>")}${line("segments", "SEGMENT", "<i>HOST · introduction</i>")}${line("words", "WORDS", wordBank("original", ["榜单", "在", "第一名", "翻开", "，", "产品图", "在", "Hypit", "飞进来"], [82, 45, 125, 82, 30, 125, 45, 98, 124]) + wordBank("revised", ["今天的", "第一名", "揭晓", "，", "它就是", "Hypit", "。", "一起", "看看"], [95, 100, 100, 24, 100, 95, 24, 65, 120]))}${line("anchors", "ANCHORS", '<i class="selected-words">@reveal</i><i class="semantic-moment"></i>')}<div
    class="effect-lane"
    ><b>MG</b><div class="effect-window"><span>榜单揭晓</span><i></i></div></div
  ><div class="semantic-playhead"></div><div class="hs-handle"></div
></div>
<div class="semantic-preview work-window"
  >${bar("Preview")}<div class="preview-rank"><b>#1</b><span>Hypit</span>${hypitSymbol}</div
  ><div class="preview-tiles"><i></i><i></i><i></i></div
></div>
<div class="semantic-examples"
  ><div class="rank-example"
    ><div class="rank-heading">AI VIDEO TOOLS</div
    ><div class="rank-slot first"
      ><div class="rank-front">01　?</div
      ><div class="rank-back">01 <span>${hypitSymbol}</span><b>Hypit</b></div></div
    ><div class="rank-slot"
      ><span class="rank-number">02</span><span class="rank-icon">{{creatify}}</span
      ><b>Creatify</b></div
    ><div class="rank-slot"
      ><span class="rank-number">03</span><span class="rank-icon">{{higgsfield}}</span
      ><b>Higgsfield</b></div
    ></div
  ><div class="sentence-example"
    ><div class="blank-brand"></div><div class="claim">is the <b>#1</b><br />AI video tool</div
    ><div class="flying-brand">${hypitSymbol}</div><div class="pixel-stars">✦　✧　✦</div></div
  ></div
>
<div class="rewrite-sheet work-window"
  >${bar("Script + Voice")}<div class="rewrite-old"
    >榜单在 <b>第一名</b> 翻开，<br />产品图在 <b>Hypit</b> 飞进来。</div
  ><div class="rewrite-new">今天的 <b>第一名</b> 揭晓，<br />它就是 <b>Hypit</b>。一起看看！</div
  ><div class="voice-shape">${Array.from({ length: 85 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div><div class="voice-chip">♫　新的配音</div></div
>
<div class="script-source work-window"
  >${bar("main.svml")}<pre><span>&lt;script id="story"&gt;</span><br>  &lt;intro&gt;<br>    &lt;HOST&gt; 今天的 <em>@winner</em> 第一名<em>@/winner</em>，<br>    就是 <em>@product!</em> Hypit。<br>  &lt;/intro&gt;<br><span>&lt;/script&gt;</span><br><br><span>&lt;visual:Track</span> timeline={program.timeline}<span>&gt;</span><br>  <span>&lt;visual:Clip</span> media={product.media}<br>    frame={layout.product} fit="cover"<br>    at=<em>{story.moment.product}</em> for="2s"<span>/&gt;</span><br><span>&lt;/visual:Track&gt;</span></pre></div
>${pointer}`;
  return scene(t, c, w, font, o, html, workCss + studioCss + css, workSetup + animation, events, {
    creatify: { image: m.creatify },
    higgsfield: { image: m.higgsfield },
  });
}

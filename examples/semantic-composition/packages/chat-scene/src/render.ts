import { sealVisualTrack } from "hypit/composition";
import type { VisualElement } from "hypit/composition";
import { browserProgram } from "hypit/hyperframes";
import type { FontStackRef } from "hypit/media";
import type { ProgramSpace } from "hypit/program-space";
import type { CanvasSpace } from "hypit/spatial";
import { assertTemporalWindowFor } from "hypit/temporal";
import type { TemporalInstant, TemporalWindow } from "hypit/temporal";

export type Message = { id: string; sender: string; text: string; side: "left" | "right"; at: TemporalInstant };
export type ChatOptions = { id: string; title: string; entranceFrames: number };

/** Layout, arrival and scrolling share one visual component; timing is already resolved. */
export function renderChat(space: ProgramSpace, canvas: CanvasSpace, window: TemporalWindow,
  font: FontStackRef, messages: readonly Message[], options: ChatOptions) {
  assertTemporalWindowFor(window, { subjectId: options.id, space });
  if (!Number.isSafeInteger(options.entranceFrames) || options.entranceFrames < 1) throw new Error("Chat entrance-frames must be a positive integer.");
  if (messages.some(message => message.at.frame < window.span.startFrame || message.at.frame >= window.span.endFrameExclusive)) throw new Error("Chat messages must appear inside the scene's window.");
  let order = 0;
  const text = (id: string, value: string, size: number, color: string): VisualElement => ({
    id, kind: "text", parent: "chat", order: ++order, text: value, fonts: font.faces,
    style: [{ name: "font-size", value: `${size}px` }, { name: "line-height", value: 1.3 }, { name: "color", value: color }],
  });
  const children = [text("title", options.title, 30, "#f6ead9"), text("subtitle", "A small change of plan", 16, "#b8c6c5"),
    ...messages.flatMap((message, index) => [text(`sender-${index}`, message.sender, 16, "#a9b8bd"), text(`text-${index}`, message.text, 27, "#f4efe6")])];
  const program = browserProgram({
    html: `<header><div class="status"></div><div>{{title}}<div class="subtitle">{{subtitle}}</div></div></header>
      <div class="viewport"><div class="messages">${messages.map((message, index) => `<article class="${message.side}" data-message="${index}">
      <div class="sender">{{sender-${index}}}</div><div class="bubble">{{text-${index}}}</div></article>`).join("")}</div></div>
      <footer><div class="dots"><i></i><i></i><i></i></div></footer>`,
    css: `:scope{background:#142b32;overflow:hidden}
      header{position:absolute;inset:0 0 auto;padding:48px 38px 32px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #35505a;background:#1c353e}
      .status{width:17px;height:17px;border-radius:50%;background:#abda82;box-shadow:0 0 0 7px #304b43}
      .subtitle{margin-top:6px}.viewport{position:absolute;inset:164px 32px 96px;overflow:hidden}
      .messages{position:relative}article{margin:0 0 28px;max-width:84%;transform-origin:left bottom}
      article.right{margin-left:auto;transform-origin:right bottom}.sender{margin:0 10px 8px}
      .right .sender{text-align:right}.bubble{padding:20px 23px;border-radius:23px 23px 23px 5px;background:#304953;box-shadow:0 6px 0 #10262d}
      .right .bubble{background:#47694d;border-radius:23px 23px 5px 23px}footer{position:absolute;inset:auto 0 0;height:90px;background:#1c353e}
      .dots{display:flex;gap:9px;margin:35px 40px}.dots i{width:10px;height:10px;background:#a6b8b9;border-radius:50%}`,
    data: { times: messages.map(message => message.at.frame - window.span.startFrame), entrance: options.entranceFrames },
    setup: `const cards=[...root.querySelectorAll('article')], list=root.querySelector('.messages'), viewport=root.querySelector('.viewport'), dots=root.querySelector('.dots');
      return frame=>{
        let last=-1;
        cards.forEach((card,i)=>{
          const age=frame-data.times[i], visible=age>=0;
          card.style.display=visible?'block':'none';
          if(visible){last=i;const t=Math.min(1,age/data.entrance), p=1-Math.pow(1-t,3);
            card.style.opacity=String(p);card.style.transform='translateY('+(18*(1-p))+'px) scale('+(0.96+0.04*p)+')';}
        });
        const bottom=last<0?0:cards[last].offsetTop+cards[last].offsetHeight;
        const previous=last<1?0:cards[last-1].offsetTop+cards[last-1].offsetHeight;
        const t=last<0?1:Math.max(0,Math.min(1,(frame-data.times[last])/data.entrance));
        const before=Math.max(0,previous-viewport.clientHeight), after=Math.max(0,bottom-viewport.clientHeight);
        list.style.transform='translateY('+(-(before+(after-before)*(1-Math.pow(1-t,3))))+'px)';
        dots.style.opacity=last===cards.length-1?'0':'1';
        [...dots.children].forEach((dot,i)=>dot.style.transform='translateY('+(-3*(1+Math.sin(frame*.18-i)))+'px)');
      };`,
  });
  return sealVisualTrack({ id: options.id, programSpaceId: space.id, visualIr: "hypit.visual-ir@1",
    presents: [{ id: options.id, span: window.span, stacking: { order: 0, tieBreak: options.id },
      elements: [{ id: "chat", kind: "program", order: 0, program,
        style: [{ name: "position", value: "absolute" }, { name: "inset", value: 0 },
          { name: "width", value: `${canvas.widthPx}px` }, { name: "height", value: `${canvas.heightPx}px` }] }, ...children] }] });
}

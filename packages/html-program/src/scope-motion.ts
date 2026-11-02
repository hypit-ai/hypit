import { animationClockRuntime } from "./animation-clock.js";
import type { VisualScopeMotion, VisualScopeTransform } from '@hypit/composition';

export function scopeMotionScript(entries: readonly { readonly id: string; readonly transform?: VisualScopeTransform; readonly motion: VisualScopeMotion }[]): string {
  return `(() => {
    ${animationClockRuntime}
    const entries = ${JSON.stringify(entries).replaceAll('<', '\\u003c')}.map(entry => ({ ...entry, element: document.getElementById(entry.id) }));
    const ease = (value, easing) => {
      if (!easing || easing === 'linear') return value;
      const [x1,y1,x2,y2] = easing === 'ease-in' ? [.42,0,1,1] : easing === 'ease-out' ? [0,0,.58,1] : [.42,0,.58,1];
      const coordinate = (t,a,b) => 3*(1-t)**2*t*a + 3*(1-t)*t*t*b + t**3;
      let low=0, high=1;
      for(let i=0;i<32;i++){ const mid=(low+high)/2; if(coordinate(mid,x1,x2)<value) low=mid; else high=mid; }
      return coordinate((low+high)/2,y1,y2);
    };
    const sample = (keys,frame) => {
      if(frame<=keys[0].frame) return keys[0].value;
      const right=keys.findIndex(key=>key.frame>frame);
      if(right<0) return keys[keys.length-1].value;
      const a=keys[right-1], b=keys[right];
      return a.value+(b.value-a.value)*ease((frame-a.frame)/(b.frame-a.frame),a.easing);
    };
    const apply = frame => {
      for(const entry of entries){
        const pose={x:0,y:0,scaleX:1,scaleY:1,rotation:0,opacity:1,originX:.5,originY:.5,...entry.transform};
        for(const channel of entry.motion.channels) pose[channel.property]=sample(channel.keyframes,Math.max(0,Math.min(htmlAnimationDuration(entry.motion.clock)-1,htmlAnimationFrame(entry.motion.clock,frame))));
        entry.element.style.transform='translate('+pose.x+'px,'+pose.y+'px) rotate('+pose.rotation+'deg) scale('+pose.scaleX+','+pose.scaleY+')';
        entry.element.style.transformOrigin=(pose.originX*100)+'% '+(pose.originY*100)+'%';
        entry.element.style.opacity=String(pose.opacity);
      }
    };
    apply(0);
    window.addEventListener('hypit-frame',event=>apply(event.detail.frame));
  })();`;
}

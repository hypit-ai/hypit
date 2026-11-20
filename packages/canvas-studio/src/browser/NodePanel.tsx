import type { CSSProperties, ReactNode } from 'react';
import { NodeToolbar, Position, useStore } from '@xyflow/react';

export function NodePanel({ nodeId, children }: { nodeId: string; children: ReactNode }) {
  const [x,y,width,height,viewportWidth,viewportHeight,dragging] = useStore(state => {
    const node = state.nodeLookup.get(nodeId), [panX,panY,zoom] = state.transform;
    return [
      (node?.internals.positionAbsolute.x ?? 0)*zoom+panX,
      (node?.internals.positionAbsolute.y ?? 0)*zoom+panY,
      (node?.measured.width ?? 0)*zoom,
      (node?.measured.height ?? 0)*zoom,
      state.width,state.height,
      node?.dragging ? 1 : 0,
    ] as const;
  }, (before,after)=>before.every((value,index)=>value===after[index]));
  // The panel sits 20px below its node, 680px wide, clear of the 72px tool rail. It grows out of the node's centre line.
  const gap=20, inset=12, leftInset=72;
  const panelWidth=Math.max(160,Math.min(680,viewportWidth-leftInset-inset));
  const below=viewportHeight-y-height-gap-inset, above=y-gap-inset;
  const position=below>=280 || below>=above ? Position.Bottom : Position.Top;
  const available=position===Position.Bottom ? below : above;
  const center=x+width/2;
  const left=Math.min(Math.max(center-panelWidth/2,leftInset),viewportWidth-panelWidth-inset);
  // The panel steps aside while its node is dragged.
  const visible=!dragging && width>0 && height>0 && x+width>0 && x<viewportWidth && y+height>0 && y<viewportHeight;
  return <NodeToolbar nodeId={nodeId} isVisible position={position} offset={gap} className="graph-node-panel nodrag nopan nowheel"
    aria-hidden={!visible} style={{'--node-panel-origin':`${center-left}px ${position===Position.Bottom ? '0%' : '100%'}`,width:panelWidth,marginLeft:left-(center-panelWidth/2),maxHeight:Math.max(140,Math.min(440,available)),zIndex:20,visibility:visible?'visible':'hidden',opacity:visible?1:0} as CSSProperties}>
    {children}
  </NodeToolbar>;
}

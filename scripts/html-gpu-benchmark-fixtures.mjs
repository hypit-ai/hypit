import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sealComposition, sealVisualTrack } from '../packages/composition/src/index.ts';
import { sealTimeline } from '../packages/timeline/src/index.ts';
import { compileHtmlProgram, htmlVisual } from '../packages/html-program/src/index.ts';

export async function loadProject(directory) {
  const program = JSON.parse(await readFile(resolve(directory, 'output/program.json'), 'utf8'));
  const paths = JSON.parse(await readFile(resolve(directory, 'output/resources.json'), 'utf8'));
  const blobs = await Promise.all(program.artifacts.map(async ({ artifact }) => {
    if (!paths[artifact.resource]) throw Error('Missing project resource: ' + artifact.resource);
    return [artifact, await readFile(resolve(directory, paths[artifact.resource]))];
  }));
  return { program, blobs };
}

export async function loadFixtures(videoDirectory, mgDirectory) {
const video = await loadProject(videoDirectory), motion = await loadProject(mgDirectory);
const blobs = video.blobs, mg = motion.program;
function tiled(layers,width=1920,height=1080,frames=600,aligned=false,accuracy=false){const rate={numerator:30,denominator:1},videos=blobs.filter(([a])=>a.mediaType==='video/mp4').map(([a])=>a),cols=Math.ceil(Math.sqrt(layers)),rows=Math.ceil(layers/cols),w=Math.floor(width/cols),h=Math.floor(height/rows);const style=(l,t,w,h)=>Object.entries({position:'absolute',left:l+'px',top:t+'px',width:w+'px',height:h+'px'}).map(([name,value])=>({name,value}));
const elements=[{id:'root',order:0,kind:'box',style:style(0,0,width,height)}];
for(let i=0;i<layers;i++)elements.push({id:'v'+i,parent:'root',order:i+1,kind:'video',artifact:videos[i%videos.length],style:style(i%cols*w,Math.floor(i/cols)*h,w,h),sourceTime:{sourceFrameRate:rate,sourceFrameCount:360,pieces:[{target:{startFrame:0,endFrameExclusive:frames},sourceAtStart:{numerator:aligned?0:i*23,denominator:1},rate:{numerator:!aligned&&i%3===0?-1:1,denominator:1},wrap:{startFrame:0,endFrameExclusive:360}}]}});
const graphics=htmlVisual({html:`<canvas width="${width}" height="${height}"></canvas>`,setup:`const ctx=root.querySelector('canvas').getContext('2d');return frame=>{ctx.clearRect(0,0,${width},${height});for(let i=0;i<128;i++){ctx.fillStyle=i%2?'#17a589':'#316ac5';ctx.fillRect((i*29+frame*5)%${width},(i*47+frame*2)%${accuracy?300:height},12,12);}for(let i=0;i<16;i++){ctx.fillStyle=(frame>>i&1)?'#fff':'#000';ctx.fillRect(${accuracy?width-320:0}+i*20,${height-16},20,16);}};`});
elements.push({id:'mg',parent:'root',order:layers+1,kind:'program',style:style(0,0,width,height),program:graphics});
return compileHtmlProgram(sealComposition({id:'tile',canvas:{width,height,clearColor:'#000000'},tracks:[sealVisualTrack({id:'video',visualIr:'hypit.visual-ir@1',timelineId:'tile',presents:[{id:'scene',span:{startFrame:0,endFrameExclusive:frames},order:0,z:0,elements}]})]}),sealTimeline({id:'tile',frameCount:frames,frameRate:rate}));}

const mg4k = { ...mg, canvas: { ...mg.canvas, width: 3840, height: 2160 },
  html: mg.html.replace('</head>', '<style>[data-hypit-program-root]{transform:scale(2);transform-origin:0 0}</style></head>') };
return Object.fromEntries(Object.entries({
  video: video.program, mg, mg4k, staggered: tiled(8), aligned: tiled(8,1920,1080,600,true),
  accuracy: tiled(8,1920,1080,600,false,true), uhd: tiled(4,3840,2160,300),
}).map(([name,program]) => [name, { program, blobs: name.startsWith('mg') ? motion.blobs : blobs }]));
}

function decode(file, filter, width) {
  const result = spawnSync('ffmpeg', ['-v','error','-i',file,'-vf',filter,'-pix_fmt','gray','-f','rawvideo','pipe:1'],
    { maxBuffer: 32*1024*1024, timeout: 120000 });
  if (result.status !== 0) throw Error('Identifier decode failed: ' + (result.error ?? result.stderr));
  if (result.stdout.length % width) throw Error('Truncated identifier decode');
  return result.stdout;
}

// The supplied benchmark projects encode source frame IDs in the bottom-left of each source,
// and timeline IDs in the output. Coordinates match the 1080p fixtures used in PR #437.
export function verifyIdentifiers(file, kind, count) {
  const errors = [], checks = [];
  const record = (frame, channel, actual, expected) => {
    if (actual !== expected) { if (errors.length < 20) errors.push({frame,channel,actual,expected}); }
    return actual !== expected ? 1 : 0;
  };
  let mismatches = 0, observations = 0;
  if (kind === 'accuracy') {
    const branches = Array.from({length:9},(_,i)=>`[s${i}]crop=320:8:${i<8?(i%3)*640:1600}:${i<8?Math.floor(i/3)*360+350:1068}[c${i}]`);
    const graph = `[0:v]split=9${branches.map((_,i)=>`[s${i}]`).join('')};${branches.join(';')};${branches.map((_,i)=>`[c${i}]`).join('')}vstack=inputs=9,format=gray[out]`;
    const r = spawnSync('ffmpeg',['-v','error','-i',file,'-filter_complex',graph,'-map','[out]','-f','rawvideo','pipe:1'],{maxBuffer:32*1024*1024,timeout:120000});
    if (r.status !== 0) throw Error('Layer identifier decode failed: '+(r.error ?? r.stderr));
    const frames = r.stdout.length/(320*72);
    if (frames !== count) throw Error(`Identifier frame count ${frames}, expected ${count}`);
    for(let f=0;f<frames;f++)for(let layer=0;layer<9;layer++) {
      let actual=0;
      for(let bit=0;bit<(layer===8?16:10);bit++) {
        const x=layer===8?bit*20+10:Math.floor((bit+.5)*32/3), values=[];
        for(let y=1;y<7;y++)for(let dx=-2;dx<=2;dx++)values.push(r.stdout[f*320*72+(layer*8+y)*320+x+dx]);
        values.sort((a,b)=>a-b); if(values[Math.floor(values.length/2)]>128)actual|=1<<bit;
      }
      const expected=layer===8?f:((layer*23+(layer%3===0?-f:f))%360+360)%360;
      mismatches+=record(f,layer,actual,expected); observations++;
    }
  } else {
    const channels = kind === 'video' ? [
      ['timeline','crop=160:8:0:1072',10,f=>f],
      ['source-a','crop=214:16:64:920',10,f=>f<150?f:f<300?449-f:f<450?120:60+Math.floor((f-450)*1.5)%60],
      ['source-b','crop=80:6:1376:484',10,f=>f%360],
    ] : [['timeline','crop=160:8:0:1072',10,f=>f]];
    for(const [channel,crop,bits,expected] of channels) {
      const raw=decode(file,crop+`,scale=${bits}:1:flags=area`,bits), frames=raw.length/bits;
      if(frames!==count)throw Error(`Identifier frame count ${frames}, expected ${count}`);
      for(let f=0;f<frames;f++){let actual=0;for(let bit=0;bit<bits;bit++)if(raw[f*bits+bit]>128)actual|=1<<bit;
        mismatches+=record(f,channel,actual,expected(f)); observations++;}
      checks.push({channel,frames});
    }
  }
  return {observations,mismatches,examples:errors,channels:checks};
}

import { readFile, writeFile, mkdir, rename, rm, statfs } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { cpus, totalmem, release } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const { values: args } = parseArgs({options:{
  'video-project':{type:'string'}, 'mg-project':{type:'string'}, out:{type:'string',default:'dist/html-gpu-benchmark'},
  repetitions:{type:'string',default:'5'}, job:{type:'string'}, help:{type:'boolean'},
}});
if(args.help){console.log('node --import tsx scripts/benchmark-html-gpu.mjs --video-project <dir> --mg-project <dir> [--out <dir>] [--repetitions 5]');process.exit(0);}
const MiB=1024**2, script=fileURLToPath(import.meta.url);
async function json(file,value){await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(value,null,2));await rename(file+'.tmp',file);}
function command(binary,argv){const r=spawnSync(binary,argv,{encoding:'utf8',timeout:10000,maxBuffer:4*MiB});if(r.status!==0)throw Error(`${binary}: ${r.error??r.stderr}`);return r.stdout.trim();}
function alive(pid){try{process.kill(pid,0);return true;}catch{return false;}}

if(args.job){
  const job=JSON.parse(await readFile(args.job,'utf8'));
  const { loadFixtures, verifyIdentifiers }=await import('./html-gpu-benchmark-fixtures.mjs');
  const { MemoryResourceStore }=await import('../packages/executor/src/resources.ts');
  const { rasterizeHtmlProgram, resolveExecutionOptions }=await import('../packages/provider-html-local/src/render.ts');
  const fixtures=await loadFixtures(job.videoProject,job.mgProject), controllers=new Set(), pids=new Set();
  const interrupted=()=>{for(const controller of controllers)controller.abort(Error('Benchmark interrupted'));};
  process.on('SIGTERM',interrupted);process.on('SIGINT',interrupted);
  const event=phase=>console.log('BENCH_EVENT '+JSON.stringify({phase}));
  async function render(item){
    const fixture=fixtures[item.doc], resources=new MemoryResourceStore(), diagnostics=[], controller=new AbortController();
    for(const [artifact,bytes]of fixture.blobs)await resources.write(artifact,bytes);
    controllers.add(controller);let fired=false,visual,error,file,verification;
    const ownPids=new Set();
    const began=performance.now(), effective=resolveExecutionOptions(item.config??{});
    try{
      visual=await rasterizeHtmlProgram({program:fixture.program,...(item.range?{range:item.range}:{})},{
        resources,renderer:'electron',processTimeoutMs:180000,initializationTimeoutMs:30000,frameTimeoutMs:30000,
        ...item.config,signal:controller.signal,
        onDiagnostic:async d=>diagnostics.push(d),
        onProgress:e=>{
          if(e.browserPid){pids.add(e.browserPid);ownPids.add(e.browserPid);}
          if(item.action&&!fired&&e.phase==='worker-progress'&&e.completed>10){fired=true;
            if(item.action==='cancel')controller.abort(Error('Benchmark cancellation'));
            else if(ownPids.size)process.kill([...ownPids].at(-1),'SIGKILL');
          }
        },
      });
    }catch(e){error=String(e);}finally{controllers.delete(controller);}
    const seconds=(performance.now()-began)/1000;
    if(visual&&item.verify){file=resolve(job.directory,item.id+'.mp4');await writeFile(file,await resources.get(visual.artifact.resource));}
    const videoStats=diagnostics.flatMap(d=>[...d.message.matchAll(/video: (\{[^\n]+\})/g)].map(m=>JSON.parse(m[1])));
    return {id:item.id,doc:item.doc,group:item.group,config:item.config??{},
      effective:{sourceMiB:effective.maxDecodedSourceBytes/MiB,pendingMiB:effective.maxPendingFrameBytes/MiB,workers:effective.workers},
      seconds,frames:visual?.frameCount,bytes:visual?.artifact.size,error,action:item.action,actionTriggered:fired,
      file,verifyKind:item.verify,verification,diagnostics,videoStats};
  }
  let result;
  try{
    event('export');const began=performance.now();
    const exports=await Promise.all(job.items.map(render)), seconds=(performance.now()-began)/1000;
    event('verification');
    for(const item of exports)if(item.file){
      try{item.verification=verifyIdentifiers(item.file,item.verifyKind,item.frames);}
      catch(e){item.verification={error:String(e)};}
    }
    await delay(1500);
    const survivors=[...pids].filter(alive);
    const passed=exports.every(r=>r.action?r.actionTriggered&&!!r.error:!r.error&&r.frames>0)
      &&exports.every(r=>!r.verifyKind||(r.verification&&!r.verification.error&&r.verification.mismatches===0))&&survivors.length===0;
    result={id:job.id,passed,seconds,exports,survivors};
  }catch(e){result={id:job.id,passed:false,error:String(e)};}
  await json(job.resultFile,result);event('done');process.exitCode=result.passed?0:1;
}else{
  if(process.platform!=='darwin')throw Error('This measurement runner requires macOS process and memory tools.');
  if(!args['video-project']||!args['mg-project'])throw Error('Provide --video-project and --mg-project; see --help.');
  const reps=Number(args.repetitions);if(!Number.isInteger(reps)||reps<5)throw Error('Use at least five repetitions.');
  const directory=resolve(args.out),videoProject=resolve(args['video-project']),mgProject=resolve(args['mg-project']);
  await mkdir(directory,{recursive:true});
  const lock=resolve(directory,'runner.lock');
  try{await mkdir(lock);}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(resolve(lock,'pid'),'utf8').catch(()=>0));if(alive(pid)&&pid>0)throw Error('Benchmark already running: '+pid);await rm(lock,{recursive:true,force:true});await mkdir(lock);}
  await writeFile(resolve(lock,'pid'),String(process.pid));
  let stopping=false,current;
  const stop=()=>{stopping=true;if(current)try{process.kill(-current,'SIGTERM');}catch{}};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  try{
    command('ffmpeg',['-version']);command('ffprobe',['-version']);
    const { loadProject }=await import('./html-gpu-benchmark-fixtures.mjs');
    const fingerprint=createHash('sha256');
    fingerprint.update(command('git',['rev-parse','HEAD']));fingerprint.update(command('git',['diff','HEAD','--']));
    for(const file of [script,resolve(root,'scripts/html-gpu-benchmark-fixtures.mjs')])fingerprint.update(await readFile(file));
    for(const project of [videoProject,mgProject]){const data=await loadProject(project);fingerprint.update(JSON.stringify(data.program));for(const [artifact,bytes]of data.blobs){fingerprint.update(artifact.resource);fingerprint.update(bytes);}}
    fingerprint.update(String(reps));const identity=fingerprint.digest('hex'),stateFile=resolve(directory,'state.json');
    let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(state&&state.identity!==identity)throw Error('Source, fixtures or repetition count changed. Select a fresh --out directory.');
    state??={identity,head:command('git',['rev-parse','HEAD']),dirty:!!command('git',['status','--porcelain']),
      startedAt:new Date().toISOString(),host:{platform:process.platform,release:release(),cpu:cpus()[0]?.model,totalMemoryMiB:totalmem()/MiB,node:process.version},
      videoProject,mgProject,repetitions:reps,results:[]};
    let readUsage;
    try{const {default:koffi}=await import('koffi');readUsage=koffi.load('/usr/lib/libproc.dylib').func('int proc_pid_rusage(int pid, int flavor, void *buffer)');}catch{}
    function processes(rootPid, observed) {
      const raw=spawnSync('ps',['-axo','pid=,ppid=,pgid=,rss=,stat=,lstart=,comm='],{encoding:'utf8',env:{...process.env,LC_ALL:'C'}});
      if(raw.status!==0)throw Error('Process sampler failed: '+raw.stderr);
      const rows=raw.stdout.split('\n').flatMap(line=>{
        const m=line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.*)$/);
        if(!m||m[5].startsWith('Z'))return[];
        return[{pid:+m[1],ppid:+m[2],pgid:+m[3],rssMiB:+m[4]/1024,started:m[6],command:Buffer.from(m[7]).toString()}];
      });
      const owned=new Set([rootPid]);
      for(const row of rows){const old=observed.get(row.pid);if(old&&old.started===row.started&&old.command===row.command)owned.add(row.pid);}
      for(let i=0;i<32;i++){const size=owned.size;for(const row of rows)if(owned.has(row.ppid))owned.add(row.pid);if(size===owned.size)break;}
      return rows.filter(row=>owned.has(row.pid)).map(row=>{
        observed.set(row.pid,{started:row.started,command:row.command});
        row.footprintMiB=null;if(readUsage){const b=Buffer.alloc(96);if(readUsage(row.pid,0,b)===0)row.footprintMiB=Number(b.readBigUInt64LE(72))/MiB;}
        return row;
      });
    }
    function stats(){return{at:new Date().toISOString(),swap:command('sysctl',['vm.swapusage']),thermal:command('pmset',['-g','therm'])};}
    const median=xs=>{xs=[...xs].sort((a,b)=>a-b);return xs.length%2?xs[Math.floor(xs.length/2)]:(xs[xs.length/2-1]+xs[xs.length/2])/2;};
    async function summarize(){
      const groups={};
      for(const result of state.results)for(const item of result.exports??[])if(item.group){
        const key=item.group+' / '+JSON.stringify(item.config);(groups[key]??=[]).push({...item,passed:result.passed,peakRssMiB:result.peakRssMiB,peakFootprintMiB:result.peakFootprintMiB});}
      const rows=Object.entries(groups).map(([key,all])=>{const good=all.filter(x=>x.passed),times=good.map(x=>x.seconds);return{key,completed:good.length,failed:all.length-good.length,
        medianSeconds:times.length?median(times):null,minSeconds:times.length?Math.min(...times):null,maxSeconds:times.length?Math.max(...times):null,
        medianPeakRssMiB:good.length?median(good.map(x=>x.peakRssMiB)):null,medianPeakFootprintMiB:good.length&&readUsage?median(good.map(x=>x.peakFootprintMiB)):null,
        decoderStarts:good.map(x=>x.videoStats?.reduce((s,v)=>s+v.decoderStarts,0)),
      };});
      const summary={status:state.status??'running',head:state.head,host:state.host,repetitions:reps,completedJobs:state.results.length,
        failedJobs:state.results.filter(r=>!r.passed).map(r=>r.id),rows};
      await json(resolve(directory,'summary.json'),summary);
      const f=n=>n==null?'n/a':n.toFixed(3);
      await writeFile(resolve(directory,'REPORT.md'),`# HTML GPU benchmark\n\nStatus: ${summary.status}. Head: ${state.head}. Repetitions: ${reps}.\n\nExport seconds include Provider preparation, capture, encode, mux, full decode validation and storage. Independent frame-ID checks run afterward. Memory is sampled every 250 ms across the isolated export host and its descendants during export, including resource setup during the export phase. Normal desktop activity remains uncontrolled. RSS and macOS physical footprint are distinct from retained sample allocation and exclusive GPU memory. Each job uses a fresh Node process; managed Electron download caches persist.\n\n| Group and configuration | Completed | Failed | Median seconds | Range, seconds | Median peak RSS, MiB | Median peak physical footprint, MiB |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.map(r=>`| ${r.key} | ${r.completed} | ${r.failed} | ${f(r.medianSeconds)} | ${f(r.minSeconds)} to ${f(r.maxSeconds)} | ${f(r.medianPeakRssMiB)} | ${f(r.medianPeakFootprintMiB)} |`).join('\n')}\n\nFailed jobs: ${summary.failedJobs.join(', ')||'none'}. Full diagnostics, frame-ID observations, resource samples, environment snapshots and process cleanup results are in state.json and jobs/. The 4K cases use 1080p sources or scaled MG with authored Canvas raster resolutions.\n`);
      await json(stateFile,state);
    }
    async function run(id,items){
      if(stopping)return;
      if(state.results.some(r=>r.id===id))return;
      const space=await statfs(directory);if(space.bavail*space.bsize<2*1024**3)throw Error('Less than 2 GiB disk space available. Resume after freeing space.');
      const jobDir=resolve(directory,'jobs',id);await mkdir(jobDir,{recursive:true});
      const resultFile=resolve(jobDir,'result.json'),jobFile=resolve(jobDir,'job.json');
      await json(jobFile,{id,items,directory:jobDir,resultFile,videoProject,mgProject});
      const before=stats(),samples=[],log=createWriteStream(resolve(jobDir,'output.log'));let phase='startup',timedOut=false,closed=false;const observed=new Map();
      const child=spawn(process.execPath,['--expose-gc','--import','tsx',script,'--job',jobFile],{cwd:root,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_NO_WARNINGS:'1'}});
      current=child.pid;console.log('START',id);let buffer='';
      child.stdout.on('data',chunk=>{log.write(chunk);buffer+=chunk.toString();let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line.startsWith('BENCH_EVENT '))phase=JSON.parse(line.slice(12)).phase;}});
      child.stderr.on('data',chunk=>log.write(chunk));
      const timer=setInterval(()=>{try{const rows=processes(child.pid,observed);samples.push({ms:Date.now(),phase,processes:rows,rssMiB:rows.reduce((s,r)=>s+r.rssMiB,0),footprintMiB:readUsage?rows.reduce((s,r)=>s+(r.footprintMiB??0),0):null});}catch(e){log.write(String(e)+'\n');}},250);
      const timeout=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGTERM');}catch{}},300000);
      const force=setTimeout(()=>{if(!closed)try{process.kill(-child.pid,'SIGKILL');}catch{}},315000);
      let code,signal,spawnError;
      await new Promise(done=>{child.on('error',e=>{spawnError=String(e);done();});child.on('close',(c,s)=>{code=c;signal=s;closed=true;done();});});
      clearInterval(timer);clearTimeout(timeout);clearTimeout(force);current=undefined;log.end();
      let remaining=child.pid?processes(child.pid,observed):[];
      for(let n=0;remaining.length&&n<10;n++){await delay(200);remaining=processes(child.pid,observed);}
      const leaked=remaining;
      if(remaining.length){for(const row of remaining)try{process.kill(row.pid,'SIGTERM');}catch{}await delay(1000);for(const row of processes(child.pid,observed))try{process.kill(row.pid,'SIGKILL');}catch{}}
      let result;try{result=JSON.parse(await readFile(resultFile,'utf8'));}catch{result={id,passed:false,error:'Child did not write a result'};}
      const captured=samples.filter(s=>s.phase==='export');
      Object.assign(result,{code,signal,spawnError,timedOut,interrupted:stopping,before,after:stats(),leaked,
        peakRssMiB:Math.max(0,...captured.map(s=>s.rssMiB)),peakFootprintMiB:readUsage?Math.max(0,...captured.map(s=>s.footprintMiB)):null});
      result.passed=!!result.passed&&code===0&&!timedOut&&!stopping&&!leaked.length;
      await json(resolve(jobDir,'samples.json'),samples);
      if(!stopping)state.results.push(result);else state.lastInterrupted=result;
      await summarize();console.log('DONE',id,result.passed?'PASS':'FAIL',result.seconds?.toFixed(2));
    }
    const item=(id,doc,config,group,verify)=>({id,doc,config,group,verify});
    const repeat=async(group,doc,configs)=>{for(let r=0;r<reps&&!stopping;r++)for(let i=0;i<configs.length;i++){const k=(i+r)%configs.length,id=`${group}-c${k}-r${r+1}`;await run(id,[item(id,doc,configs[k],group)]);}};
    state.status='running';await summarize();
    await run('warmup',[{id:'warmup',doc:'video',config:{},range:{startFrame:0,endFrameExclusive:120}}]);
    await run('accuracy-defaults',[item('accuracy-defaults','accuracy',{},undefined,'accuracy')]);
    await run('defaults-video',[item('defaults-video','video',{},'defaults','video')]);
    await run('mg-defaults',[item('mg-defaults','mg',{},undefined,'mg')]);
    if(!stopping&&state.results.some(r=>['accuracy-defaults','defaults-video','mg-defaults'].includes(r.id)&&!r.passed)){state.status='preflight_failed';await summarize();throw Error('Frame-ID preflight failed; see the saved report.');}
    await repeat('source','staggered',[
      {workers:1,maxDecodedSourceBytes:1024*MiB,maxPendingFrameBytes:256*MiB},
      {},{workers:1,maxDecodedSourceBytes:3072*MiB,maxPendingFrameBytes:128*MiB},
      {workers:1,maxDecodedSourceBytes:4096*MiB,maxPendingFrameBytes:128*MiB},
    ]);
    await repeat('queue','mg',[128,256,512].map(n=>({workers:4,maxPendingFrameBytes:n*MiB})));
    const workerOptions=[1,2,3,4,6,8,'auto'];
    for(const workers of workerOptions)await run('workers-screen-'+workers,[item('workers-screen-'+workers,'mg',{workers},'workers')]);
    const ranked=state.results.flatMap(r=>r.passed?(r.exports??[]):[]).filter(r=>r.group==='workers'&&r.id.startsWith('workers-screen-')).sort((a,b)=>a.seconds-b.seconds);
    const finalists=[];for(const row of ranked)if(!finalists.some(c=>c.workers===row.config.workers)&&finalists.length<2)finalists.push(row.config);
    state.workerFinalists=finalists;await summarize();
    for(let r=1;r<reps&&!stopping;r++)for(let i=0;i<finalists.length;i++){const config=finalists[(r+i)%finalists.length],id=`workers-final-${config.workers}-r${r+1}`;await run(id,[item(id,'mg',config,'workers')]);}
    for(const config of finalists){const id='accuracy-workers-'+config.workers;await run(id,[item(id,'mg',config,undefined,'mg')]);}
    for(const workers of [2,4])await run('video-workers-'+workers,[item('video-workers-'+workers,'staggered',{workers},'video-workers')]);
    for(const doc of ['aligned','mg4k','uhd'])await run('defaults-'+doc,[item('defaults-'+doc,doc,{},'defaults')]);
    const queueRuns=state.results.filter(r=>r.passed).flatMap(r=>r.exports??[]).filter(r=>r.group==='queue');
    const queueGroups=Object.entries(Object.groupBy(queueRuns,r=>JSON.stringify(r.config))).filter(([,v])=>v.length===reps).sort((a,b)=>median(a[1].map(x=>x.seconds))-median(b[1].map(x=>x.seconds)));
    if(queueGroups.length)await run('accuracy-queue-fastest',[item('accuracy-queue-fastest','mg',JSON.parse(queueGroups[0][0]),undefined,'mg')]);
    await run('accuracy-low-cache',[{...item('accuracy-low-cache','accuracy',{maxDecodedSourceBytes:32*MiB},undefined,'accuracy'),range:{startFrame:0,endFrameExclusive:120}}]);
    await run('accuracy-small-queue',[{...item('accuracy-small-queue','mg',{workers:4,maxPendingFrameBytes:1},undefined,'mg'),range:{startFrame:0,endFrameExclusive:120}}]);
    const bestSource=state.results.filter(r=>r.passed).flatMap(r=>r.exports??[]).filter(r=>r.group==='source');
    const sourceGroups=Object.groupBy(bestSource,r=>JSON.stringify(r.config));
    const rankedSource=Object.entries(sourceGroups).filter(([,v])=>v.length===reps).sort((a,b)=>median(a[1].map(x=>x.seconds))-median(b[1].map(x=>x.seconds)));
    if(rankedSource.length)await run('accuracy-fastest',[item('accuracy-fastest','accuracy',JSON.parse(rankedSource[0][0]),undefined,'accuracy')]);
    for(const n of [2,4])await run('concurrent-'+n,Array.from({length:n},(_,i)=>item(`concurrent-${n}-${i}`,'video',{},undefined,'video')));
    await run('concurrent-faults',[
      item('fault-peer','video',{},undefined,'video'),
      {...item('fault-cancel','mg',{}),action:'cancel'},
      {...item('fault-crash','video',{}),action:'crash'},
    ]);
    await run('recovery',[item('recovery','video',{},undefined,'video')]);
    state.status=stopping?'interrupted':state.results.some(r=>!r.passed)?'completed_with_failures':'completed';state.finishedAt=new Date().toISOString();await summarize();
    console.log('REPORT',resolve(directory,'REPORT.md'));if(state.status!=='completed')process.exitCode=1;
  }finally{await rm(lock,{recursive:true,force:true});}
}

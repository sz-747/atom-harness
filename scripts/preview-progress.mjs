// Offline presentation fixture using Pi's real extension loader, tool rows and TUI.
// No provider calls, project operations, personal configuration or credentials.
import {execSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const globalModules=execSync('npm root -g',{encoding:'utf8'}).trim();
const pi=[join(root,'node_modules'),globalModules].map(base=>join(base,'@earendil-works/pi-coding-agent')).find(base=>existsSync(join(base,'dist/index.js')));
if(!pi)throw Error('Install Pi before running the progress preview.');
const {ToolExecutionComponent}=await import(pathToFileURL(join(pi,'dist/index.js')));
const {loadExtensions}=await import(pathToFileURL(join(pi,'dist/core/extensions/loader.js')));
const {initTheme}=await import(pathToFileURL(join(pi,'dist/modes/interactive/theme/theme.js')));
const {TuiMainScreen,ProcessTerminal,truncateToWidth,matchesKey,Key}=await import(pathToFileURL(join(pi,'node_modules/@earendil-works/pi-tui/dist/index.js')));
const scratch=mkdtempSync(join(tmpdir(),'atom-progress-preview-')),previous=process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR=scratch;writeFileSync(join(scratch,'calm'),'on\n');initTheme('dark',false);
const loaded=await loadExtensions([join(root,'.pi/extensions/calm/index.ts')],root);
if(loaded.errors.length)throw Error(loaded.errors.map(e=>e.error).join('\n'));
const extension=loaded.extensions[0],tool=extension.tools.get('work_progress').definition,rows=[];
const ctx={mode:'tui',sessionManager:{getBranch:()=>[]},ui:{setWidget(){},setWorkingVisible(){},getToolsExpanded:()=>false,setToolsExpanded(){},notify(){}}};
const emit=async(name,event={})=>{for(const h of extension.handlers.get(name)??[])await h(event,ctx)};
await emit('session_start');
let tui,expanded=false,closed=false;
const timers=[];
const row=(name,id,args={})=>{const item=new ToolExecutionComponent(name,id,args,{},undefined,{requestRender:()=>tui?.requestRender()},root);rows.push(item);return item};
const progress=async(id,data)=>{row('work_progress',id,data);await tool.execute(id,data)};
const data={id:'inspect',title:'Find the cause of the connection failure',status:'working',summary:'Compare the saved request records.'};
const next={id:'repair',title:'Add bounded recovery',status:'working',summary:'Update recovery and check cancellation behavior.'};
const render=width=>[
 'Atom - outcome-oriented progress',
 'SIMULATED FIXTURE | no model calls or project file changes',
 '',
 ...rows.flatMap(r=>r.render(width)),
 '',
 'Ctrl+O: expand operation details   Q: close preview',
].map(line=>truncateToWidth(line,width));
const finish=async()=>{if(closed)return;closed=true;for(const t of timers)clearTimeout(t);await emit('session_shutdown');tui?.stop();if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;rmSync(scratch,{recursive:true,force:true});};
await progress('inspect-start',data);
await emit('tool_execution_start',{toolCallId:'read-log',toolName:'read',args:{path:'request-log.json'}});
const log=row('read','read-log',{path:'request-log.json'});log.markExecutionStarted();
const completeInspection=async()=>{
 log.updateResult({content:[{type:'text',text:'Synthetic evidence: connection failure followed by missing recovery.'}],details:{},isError:false});
 await emit('tool_execution_end',{toolCallId:'read-log',toolName:'read',isError:false});
 await progress('inspect-result',{...data,status:'done',summary:'Found a missing recovery step. Findings recorded; live behavior unverified.'});
 await progress('repair-start',next);
 await emit('tool_execution_start',{toolCallId:'edit-recovery',toolName:'edit',args:{path:'recovery.ts'}});
 const edit=row('edit','edit-recovery',{path:'recovery.ts'});edit.markExecutionStarted();
};
if(process.argv.includes('--plain')){
 await completeInspection();console.log(render(100).map(stripVTControlCharacters).join('\n'));await finish();
}else{
 if(!process.stdin.isTTY||!process.stdout.isTTY){await finish();throw Error('Use --plain without an interactive terminal.');}
 tui=new TuiMainScreen(new ProcessTerminal());
 tui.addChild({render,invalidate(){}});
 tui.addInputListener(input=>{
  if(matchesKey(input,'q')||matchesKey(input,'Q')||matchesKey(input,Key.ctrl('c'))){void finish();return {consume:true};}
  if(matchesKey(input,Key.ctrl('o'))){expanded=!expanded;for(const r of rows)r.setExpanded(expanded);tui.requestRender();return {consume:true};}
 });
 tui.start();
 timers.push(setTimeout(()=>{void completeInspection().then(()=>tui.requestRender());},1500));
 process.once('SIGTERM',()=>{void finish()});
}

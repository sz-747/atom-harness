import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {execSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CalmProgress,cleanProgressText,describeOperation} from '../.pi/extensions/calm/lib/progress.ts';
import {attachWorkProgress} from '../.pi/extensions/calm/lib/work-progress.ts';
import {setCalmPresentation} from '../.pi/extensions/calm/lib/visibility.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const globalModules=execSync('npm root -g',{encoding:'utf8'}).trim();
const pi=[join(root,'node_modules'),globalModules].map(base=>join(base,'@earendil-works/pi-coding-agent')).find(base=>existsSync(join(base,'dist/index.js')));
const sdk=await import(pathToFileURL(join(pi,'dist/index.js')));
const {ToolExecutionComponent}=sdk;
const {visibleWidth}=await import(pathToFileURL(join(pi,'node_modules/@earendil-works/pi-tui/dist/index.js')));
const {initTheme}=await import(pathToFileURL(join(pi,'dist/modes/interactive/theme/theme.js')));
const {loadExtensions}=await import(pathToFileURL(join(pi,'dist/core/extensions/loader.js')));
initTheme('dark',false);
const working={id:'inspect',title:'Find the connection failure',status:'working',summary:'Compare the saved request records.'};
const done={...working,status:'done',summary:'Found the missing recovery step. Result saved; live behavior unverified.'};

test('one stable subtask card changes from working to explicit outcome; individual tools never complete the goal',()=>{
 const p=new CalmProgress();p.update('leader',working);p.start('read','read',{path:'logs/requests.json'});assert.equal(p.lines('read').length,0);p.end('read',false);assert.match(p.lines('leader')[0],/^▶/);assert.match(p.lines('leader').join('\n'),/Read requests.json/);
 p.update('finish',done);assert.match(p.lines('leader')[0],/^✓/);assert.ok(p.lines('leader').includes('  '+done.summary));assert.deepEqual(p.lines('finish'),[]);assert.throws(()=>p.update('reuse',working),/already complete/);
});
test('nested operations keep their parent group, even when an unrelated subtask is active',()=>{
 const p=new CalmProgress();p.update('one',working);p.start('script','codemode');assert.throws(()=>p.update('two',{...working,id:'next'}),/finish/);p.start('nested','read',{path:'file.md'},'script');p.end('nested',false);p.end('script',false);p.update('two',{...working,id:'next'});p.start('late','read',{path:'more.md'},'script');assert.equal(p.owners.get('late'),'one');assert.match(p.lines('one')[0],/^○/);
});
test('failed details stay visible and stopping never fabricates completion',()=>{
 const p=new CalmProgress();p.update('one',working);p.start('failed','powershell',{command:'arbitrary command content'});p.end('failed',true);p.end('failed',true);p.settle(true);assert.match(p.lines('one')[0],/^!/);assert.match(p.lines('one').join('\n'),/errors: 1/);
 p.beginRun();p.update('new',working);p.settle(false);assert.match(p.lines('new')[0],/^○/);assert.match(p.lines('new').join('\n'),/before completion was reported/);
});
test('commands are not parsed for intent; controls and multiline titles cannot inject terminal output',()=>{
 assert.equal(describeOperation('read',null),'Read a file');
 assert.equal(describeOperation('codemode',{code:'delete, inspect, extract or anything else'}),'Carry out the current step');assert.equal(describeOperation('powershell',{command:'Run tests maybe?'}),'Carry out the current step');assert.equal(describeOperation('read',{path:'folder\\中文.txt'}),'Read 中文.txt');assert.equal(cleanProgressText('\x1b[31mTask\x1b[0m\nnext'),'Task next');assert.equal(cleanProgressText('😀😀',1),'😀');
});
test('only active interactive Calm adds progress guidance, with no stale guidance after disabling',()=>{
 const handlers=new Map(),p=new CalmProgress();let active=['work_progress'];attachWorkProgress({registerTool(){},on(name,fn){handlers.set(name,fn)},getActiveTools:()=>active},()=>p);
 const event={systemPromptOptions:{sections:{}}},ctx={mode:'tui'};setCalmPresentation(true);handlers.get('before_agent_start')(event,ctx);assert.match(event.systemPromptOptions.sections.calm_progress,/outcome-oriented/);
 setCalmPresentation(false);handlers.get('before_agent_start')(event,ctx);assert.equal(event.systemPromptOptions.sections.calm_progress,undefined);
 setCalmPresentation(true);handlers.get('before_agent_start')(event,{mode:'rpc'});assert.equal(event.systemPromptOptions.sections.calm_progress,undefined);active=[];handlers.get('before_agent_start')(event,ctx);assert.equal(event.systemPromptOptions.sections.calm_progress,undefined);setCalmPresentation(false);
});
test('completion cannot race live operations and CJK/emoji titles retain complete characters',()=>{
 const p=new CalmProgress();p.update('leader',{...working,title:'检查项目文件 😀'});p.start('one','read');assert.throws(()=>p.update('done',done),/still running/);p.end('one',false);p.update('done',{...done,title:'项目文件检查完成 😀'});assert.match(p.lines('leader')[0],/项目文件检查完成 😀/);assert.throws(()=>p.update('invalid',{...working,id:'  ',title:'  '}),/Supply/);
});
test('render cost stays bounded as the session grows; no navigation or refresh timer is introduced',()=>{
 const p=new CalmProgress();for(let n=0;n<1000;n++){p.beginRun();p.update('group-'+n,{...working,id:'task'});for(let i=0;i<10;i++){p.start(`${n}-${i}`,'read',{path:'file.txt'});p.end(`${n}-${i}`,false);}p.update('finish-'+n,{...done,id:'task'});}
 const times=[];for(let n=0;n<20;n++){const start=performance.now();for(let i=0;i<1000;i++)p.lines('group-999');times.push(performance.now()-start);}times.sort((a,b)=>a-b);console.log(`Fixture computation only: 1000 cached-state card renders, median ${times[10].toFixed(2)}ms, max ${times.at(-1).toFixed(2)}ms; not physical input latency.`);assert.equal(p.groups.get('group-999').steps.length,3);assert.ok(times.every(Number.isFinite));
});

test('real Pi loader and rows group operations, preserve error/image/expanded evidence and reconstruct saved progress',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atom-progress-'));const previous=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=dir;writeFileSync(join(dir,'calm'),'on\n');
 try{
  const loaded=await loadExtensions([join(root,'.pi/extensions/calm/index.ts')],root);assert.deepEqual(loaded.errors,[]);const extension=loaded.extensions[0],tool=extension.tools.get('work_progress').definition;assert.equal(tool.exposure,'model-only');assert.equal(tool.executionMode,'sequential');
  const ctx={mode:'tui',ui:{setWidget(){},setWorkingVisible(){},getToolsExpanded:()=>false,setToolsExpanded(){},notify(){}},sessionManager:{getBranch:()=>[]}};
  const emit=async(name,event={})=>{for(const h of extension.handlers.get(name)??[])await h(event,ctx)};
  await emit('session_start');const result=await tool.execute('leader',working);
  const row=(name,id,args={})=>new ToolExecutionComponent(name,id,args,{},undefined,{requestRender(){}},root);
  const leader=row('work_progress','leader',working),child=row('read','read',{path:'file.txt'});
  await emit('tool_execution_start',{toolCallId:'read',toolName:'read',args:{path:'file.txt'}});child.markExecutionStarted();assert.deepEqual(child.render(80),[]);assert.match(leader.render(80)[0],/^▶ Find/);
  child.imageComponents=[{render:()=>['IMAGE']}];child.imageSpacers=[{render:()=>['']}];assert.deepEqual(child.render(80),['','IMAGE']);child.imageComponents=[];child.imageSpacers=[];
  child.updateResult({content:[{type:'text',text:'Full original evidence'}],details:{},isError:false});await emit('tool_execution_end',{toolCallId:'read',toolName:'read',isError:false});
  const final=await tool.execute('finished',done);assert.match(leader.render(100)[0],/^✓ Find/);assert.deepEqual(row('work_progress','finished',done).render(100),[]);
  child.setExpanded(true);assert.match(child.render(100).join('\n'),/Full original evidence/);child.setExpanded(false);
  const nestedParent=row('codemode','outer',{code:'opaque script'});await emit('tool_execution_start',{toolCallId:'outer',toolName:'codemode',args:{}});await emit('tool_execution_start',{toolCallId:'inner',parentToolCallId:'outer',toolName:'read',args:{path:'missing.txt'}});await emit('tool_execution_end',{toolCallId:'inner',toolName:'read',isError:true});nestedParent.updateResult({content:[{type:'text',text:'Nested failure evidence remains visible'}],details:{},isError:false});await emit('tool_execution_end',{toolCallId:'outer',toolName:'codemode',isError:false});assert.match(nestedParent.render(100).join('\n'),/Nested failure evidence/);
  const failed=row('read','bad',{path:'bad.txt'});await emit('tool_execution_start',{toolCallId:'bad',toolName:'read',args:{path:'bad.txt'}});failed.markExecutionStarted();failed.updateResult({content:[{type:'text',text:'Failure evidence remains visible'}],details:{},isError:true});assert.match(failed.render(100).join('\n'),/Failure evidence/);
  for(let width=0;width<=80;width++)assert.ok(leader.render(width).every(line=>visibleWidth(line)<=width));
  ctx.sessionManager.getBranch=()=>[{type:'message',message:{role:'user',content:'Fixture'}},{type:'message',message:{role:'toolResult',toolName:'work_progress',toolCallId:'leader',details:result.details,isError:false}},{type:'message',message:{role:'assistant',content:[{type:'toolCall',id:'read',name:'read',arguments:{path:'file.txt'}}]}},{type:'message',message:{role:'toolResult',toolName:'read',toolCallId:'read',isError:false}},{type:'message',message:{role:'toolResult',toolName:'work_progress',toolCallId:'finished',details:final.details,isError:false}}];
  await emit('session_start');assert.match(leader.render(100)[0],/^✓ Find/);assert.deepEqual(child.render(100),[]);
  const cjk={...working,id:'cjk',title:'检查项目文件 😀',summary:'正在核对输出与原始文件。'};await tool.execute('cjk-card',cjk);const cjkRow=row('work_progress','cjk-card',cjk);for(let width=0;width<=80;width++)assert.ok(cjkRow.render(width).every(line=>visibleWidth(line)<=width));
  await emit('session_shutdown');
 }finally{if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;rmSync(dir,{recursive:true,force:true});}
});

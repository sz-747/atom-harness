import test from 'node:test';
import assert from 'node:assert/strict';
import {execSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const globalModules=execSync('npm root -g',{encoding:'utf8'}).trim();
const pi=[join(root,'node_modules'),globalModules].map(base=>join(base,'@earendil-works/pi-coding-agent')).find(base=>existsSync(join(base,'dist/index.js')));
const sdk=await import(pathToFileURL(join(pi,'dist/index.js')));

test('native Pi executes progress/write/result flow without extra providers, and preserves the artifact and metadata',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'atom-progress-flow-')),previous={agent:process.env.PI_CODING_AGENT_DIR,offline:process.env.PI_OFFLINE};
 process.env.PI_CODING_AGENT_DIR=dir;process.env.PI_OFFLINE='1';writeFileSync(join(dir,'calm'),'on\n');
 let session;
 try{
  const settingsManager=sdk.SettingsManager.inMemory({compaction:{enabled:false},retry:{enabled:false}});
  const loader=new sdk.DefaultResourceLoader({cwd:dir,agentDir:dir,settingsManager,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,additionalExtensionPaths:[join(root,'.pi/extensions/calm/index.ts')],agentsFilesOverride:()=>({agentsFiles:[]}),systemPromptOverride:()=> 'Synthetic local flow, no provider calls.'});await loader.reload();
  const modelRuntime=await sdk.ModelRuntime.create({authPath:join(dir,'auth.json'),modelsPath:join(dir,'models.json')});
  const model={id:'fixture',name:'Fixture',provider:'fixture',api:'openai-codex-responses',baseUrl:'http://127.0.0.1:1',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:100000,maxTokens:1000};
  modelRuntime.registerProvider('fixture',{api:'openai-codex-responses',apiKey:'local-fixture-not-a-credential',models:[model]});
  ({session}=await sdk.createAgentSession({cwd:dir,agentDir:dir,model,modelRuntime,resourceLoader:loader,sessionManager:sdk.SessionManager.inMemory(dir),settingsManager,tools:['work_progress','write']}));
  const progress={id:'artifact',title:'Create a small report',status:'working',summary:'Write the requested output file.'};
  const calls=[[{name:'work_progress',arguments:progress},{name:'write',arguments:{path:join(dir,'output.txt'),content:'deterministic fixture output\n'}}],[{name:'work_progress',arguments:{...progress,status:'done',summary:'Created output.txt. Independent readback is pending.'}}]];
  const usage={input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
  let index=0;const inputs=[],events=[],errors=[];
  session.agent.streamFunction=(_model,context)=>{
   inputs.push(context);const call=calls[index++],message={role:'assistant',api:model.api,provider:model.provider,model:model.id,usage,timestamp:Date.now(),stopReason:call?'toolUse':'stop',content:call?call.map((c,n)=>({type:'toolCall',id:`fixture-${index}-${n}`,...c})):[{type:'text',text:'Fixture complete; readback pending.'}]};
   return {async *[Symbol.asyncIterator](){yield {type:'done',reason:message.stopReason,message}},result:async()=>message};
  };
  session.subscribe(event=>events.push(event.type));
  await session.bindExtensions({mode:'tui',uiContext:{setWidget(){},setWorkingVisible(){},getToolsExpanded:()=>false,setToolsExpanded(){},notify(){}},onError:error=>errors.push(error)});
  await session.prompt('Create the synthetic output and report its limits.');
  assert.deepEqual(errors,[]);assert.equal(index,3);assert.equal(events.filter(e=>e==='agent_settled').length,1);
  assert.equal(readFileSync(join(dir,'output.txt'),'utf8'),'deterministic fixture output\n');
  const results=session.messages.filter(m=>m.role==='toolResult');assert.deepEqual(results.map(m=>m.toolName),['work_progress','write','work_progress']);assert.ok(results.every(m=>!m.isError));
  assert.equal(results[0].details.calmProgress.status,'working');assert.equal(results[2].details.calmProgress.status,'done');assert.match(results[2].details.calmProgress.summary,/pending/);
  assert.ok(JSON.stringify(inputs[0].messages).includes('outcome-oriented subtask title'),'Active Calm adds only the explicit presentation guidance');
  assert.equal(readFileSync(join(dir,'auth.json'),'utf8').includes('local-fixture-not-a-credential'),false,'The synthetic provider key is not persisted');
 }finally{
  session?.dispose();for(const [name,value] of [['PI_CODING_AGENT_DIR',previous.agent],['PI_OFFLINE',previous.offline]])if(value===undefined)delete process.env[name];else process.env[name]=value;
  rmSync(dir,{recursive:true,force:true});
 }
});

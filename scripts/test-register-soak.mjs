// Owns a disposable database and loopback server; never accepts an existing DB or URL.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,openSync,closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openDatabase} from '../selfhost/sqlite.mjs';
import {backupDatabase} from '../selfhost/backup.mjs';
import {restoreDatabase,releaseRestoredDatabase} from '../selfhost/restore.mjs';
import {inspectDatabase} from '../selfhost/verify.mjs';
process.env.BASAR_TEAM_PIN_KEY='f5'.repeat(32); // Disposable fixture key.
const seconds=Number(process.env.SOAK_SECONDS||3600),seed=Number(process.env.SOAK_SEED_SALES||10000),cadence=Number(process.env.SOAK_CADENCE_MS||10000);
assert.ok(Number.isInteger(seconds)&&seconds>=10&&seconds<=14400);assert.ok(Number.isInteger(seed)&&seed>=0&&seed<=100000);assert.ok(Number.isInteger(cadence)&&cadence>=100&&cadence<=60000);
const tmp=mkdtempSync(join(tmpdir(),'basar-soak-')),database=join(tmp,'source.sqlite'),log=join(tmp,'server.log');
const basePath=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath;
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const origin='http://127.0.0.1:'+port,endpoint=origin+basePath+'/api/basar';let server,cookie,eventId,failed;const tills=[],sessions=[],staffIds=[],receipts=[],voided=new Set(),postTimes=[],readTimes=[],statuses={};
const tillCash=new Map(),sellerGross=new Map();let replays=0,movements=0,phaseSix=0,phaseTwelve=0,sold=seed;
const report={status:'running',startedAt:new Date().toISOString(),workload:{seconds,seededSales:seed,primaryClients:6,reserveClients:12,realTills:6,cadenceMs:cadence,itemsPerSale:5},runtime:{node:process.version,sqlite:process.versions.sqlite,platform:process.platform,revision:process.env.BASAR_REVISION||'unrecorded'}};
for(const name of ['cpu.max','memory.max']){try{report.runtime[name]=readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();}catch{}}
const save=()=>{if(process.env.SOAK_REPORT)writeFileSync(process.env.SOAK_REPORT,JSON.stringify({...report,progress:{newSales:receipts.length,duplicateReplays:replays,voids:voided.size,updatedAt:new Date().toISOString()}},null,2)+'\n');};
async function start(path=database){const fd=openSync(log,'a');server=spawn(process.execPath,['selfhost/start.mjs'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',BASAR_DATABASE:path,BASAR_PUBLIC_ORIGIN:origin,NEXT_PUBLIC_BASE_PATH:basePath,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore',fd,fd]});closeSync(fd);for(let n=0;n<150;n++){if(server.exitCode!==null)throw new Error('Isolated server exited');try{if((await fetch(endpoint,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await delay(100);}throw new Error('Isolated server startup timed out');}
async function stop(){if(!server||server.exitCode!==null||server.signalCode!==null)return;const exited=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),5000);await exited;clearTimeout(timeout);}
async function request(action,p={},session=cookie){const start=performance.now(),r=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session}:{})},body:JSON.stringify({entryFormat:'tenths-v1',action,eventId,operationId:crypto.randomUUID(),...p}),signal:AbortSignal.timeout(20000)});return {r,data:await r.json(),ms:performance.now()-start};}
async function command(action,p={},session=cookie){const response=await request(action,p,session);assert.equal(response.r.status,200,action+': '+JSON.stringify(response.data));return response.data;}
async function state(session=cookie){const start=performance.now(),r=await fetch(endpoint+'?view=register&event='+eventId,{headers:{Cookie:session},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const text=await r.text();readTimes.push(performance.now()-start);const data=JSON.parse(text);assert.ok(data.sales.length<=50);return {data,bytes:Buffer.byteLength(text)};}
function addGoods(items,sign=1){for(const item of items)sellerGross.set(item.seller,(sellerGross.get(item.seller)||0)+sign*item.price);}
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?Math.round(sorted[Math.ceil(sorted.length*p)-1]*10)/10:null;};
try{
 await start();const logged=await request('demo',{staffId:'demo-leitung'},null);assert.equal(logged.r.status,200);cookie=logged.r.headers.get('set-cookie').split(';')[0];
 eventId=(await command('createEvent',{eventId:'demo-fruehjahr',name:'Isolated Ubuntu soak '+crypto.randomUUID(),date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:6})).eventId;
 for(let number=1;number<=6;number++){const id=(await command('openTill',{number,opening:10000})).tillId;tills.push(id);tillCash.set(id,10000);}
 for(let n=0;n<12;n++){const id=crypto.randomUUID(),pin=String(3000+n);await command('addStaff',{operationId:id,name:'Synthetic cashier '+n,role:'cashier',tillNumber:n%6+1,pin});const login=await request('login',{staffId:id,pin},null);assert.equal(login.r.status,200);sessions.push(login.r.headers.get('set-cookie').split(';')[0]);staffIds.push(id);}
 await stop();let db=openDatabase(database);db.sqlite.exec('BEGIN IMMEDIATE');
 const insert=db.sqlite.prepare('INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,donation,received,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'),operation=db.sqlite.prepare("INSERT INTO operations(id,event_id,staff_id,action,result,created_at) VALUES(?,?,?,'sale',?,?)"),audit=db.sqlite.prepare("INSERT INTO audit(id,event_id,action,detail,staff_name,created_at) VALUES(?,?,'Verkauf','Synthetic fixture','Fixture',?)");
 for(let n=1;n<=seed;n++){const till=tills[(n-1)%6],id=crypto.randomUUID(),items=Array.from({length:5},(_,k)=>({id:crypto.randomUUID(),seller:(n+k)%150+1,price:100})),time=new Date().toISOString();insert.run(id,eventId,till,'fixture','Fixture',n,JSON.stringify(items),500,5,1000,time);operation.run(crypto.randomUUID(),eventId,'fixture',JSON.stringify({saleId:id,number:n,total:500,donation:5,received:1000,change:495}),time);audit.run(crypto.randomUUID(),eventId,time);tillCash.set(till,tillCash.get(till)+505);addGoods(items);}
 db.sqlite.prepare('UPDATE events SET version=version+? WHERE id=?').run(seed,eventId);db.sqlite.exec('COMMIT');db.close();await start();
 const initial=await state();assert.equal(initial.data.summary.count,seed);report.initialSnapshotBytes=initial.bytes;save();
 const started=performance.now(),deadline=started+seconds*1000;let lastSnapshot=started,lastManager=started,lastVoid=started,snapshotFile;
 const clients=Array.from({length:12},(_,n)=>(async()=>{if(n>=6)while(performance.now()<started+seconds*750&&!failed)await delay(1000);if(failed)return;let round=0;while(performance.now()<deadline&&!failed){const at=performance.now();try{
  const tillId=tills[n%6],items=Array.from({length:5},()=>({id:crypto.randomUUID(),seller:n+1,price:100+50*n})),payload={operationId:crypto.randomUUID(),tillId,items,received:5000,donation:5,instanceEpoch:'initial'};
  const result=await request('sale',payload,sessions[n]);statuses[result.r.status]=(statuses[result.r.status]||0)+1;postTimes.push(result.ms);assert.equal(result.r.status,200,JSON.stringify(result.data));assert.equal(result.data.change,5000-5*(100+50*n)-5);
  receipts.push({payload,result:result.data,client:n});sold++;addGoods(items);tillCash.set(tillId,tillCash.get(tillId)+5*(100+50*n)+5);if(performance.now()-started<seconds*750)phaseSix++;else phaseTwelve++;
  if(round++%10===0){const replay=await request('sale',payload,sessions[n]);assert.equal(replay.r.status,200);assert.deepEqual(replay.data,result.data);replays++;}
  await state(sessions[n]);
 }catch(error){failed=error;break;}await delay(Math.max(0,cadence-(performance.now()-at)));}})());
 while(performance.now()<deadline&&!failed){await delay(Math.min(1000,Math.max(1,deadline-performance.now())));try{
  if(performance.now()-lastManager>30000){lastManager=performance.now();await command('movement',{tillId:tills[0],amount:100,reason:'Synthetic soak cash in'});tillCash.set(tills[0],tillCash.get(tills[0])+100);movements++;await command('movement',{tillId:tills[0],amount:-100,reason:'Synthetic soak cash out'});tillCash.set(tills[0],tillCash.get(tills[0])-100);movements++;}
  if(performance.now()-lastVoid>120000&&receipts.length){lastVoid=performance.now();const row=receipts.find(r=>!voided.has(r.result.saleId));await command('void',{saleId:row.result.saleId,reason:'Synthetic soak refund'});voided.add(row.result.saleId);addGoods(row.payload.items,-1);tillCash.set(row.payload.tillId,tillCash.get(row.payload.tillId)-row.result.payable);}
  if(performance.now()-lastSnapshot>300000){lastSnapshot=performance.now();snapshotFile=join(tmp,'during-load-'+crypto.randomUUID()+'.sqlite');await backupDatabase(database,snapshotFile);inspectDatabase(snapshotFile);}
  save();
 }catch(error){failed=error;}}
 await Promise.all(clients);if(failed)throw failed;
 const beforeClose=await state();assert.equal(beforeClose.data.summary.count,sold-voided.size);for(const till of tills)assert.equal(beforeClose.data.summary.tillBalances[till],tillCash.get(till));
 await command('eventStatus',{status:'settlement'});
 for(const tillId of tills)await command('closeTill',{tillId,counted:tillCash.get(tillId),note:'Independent synthetic ledger'});
 let payoutCount=0,payoutCents=0,payoutRoundingCents=0,poolBalance=[...tillCash.values()].reduce((sum,value)=>sum+value,0);
 for(const [seller,gross] of [...sellerGross].sort(([a],[b])=>a-b)){if(!gross)continue;const commission=Math.floor((gross*1500+5000)/10000),unrounded=gross-commission,rounding=unrounded%10,net=unrounded-rounding;await command('payout',{seller});poolBalance-=net;payoutCount++;payoutCents+=net;payoutRoundingCents+=rounding;}
 assert.equal((await state()).data.pool.balance,poolBalance);await command('eventStatus',{status:'closed'});

 await stop();await start();const replay=await request('sale',receipts.at(-1).payload,sessions[receipts.at(-1).client]);assert.equal(replay.r.status,200);assert.deepEqual(replay.data,receipts.at(-1).result);replays++;await stop();
 db=openDatabase(database);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sales WHERE event_id=?').get(eventId).n,sold);assert.equal(db.sqlite.prepare('SELECT COUNT(DISTINCT number) n FROM sales WHERE event_id=?').get(eventId).n,sold);assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM operations WHERE event_id=? AND action='sale'").get(eventId).n,sold);assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE event_id=? AND action='Verkauf'").get(eventId).n,sold);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM payouts WHERE event_id=?').get(eventId).n,payoutCount);assert.equal(db.sqlite.prepare('SELECT SUM(net) n FROM payouts WHERE event_id=?').get(eventId).n,payoutCents);for(const till of db.sqlite.prepare('SELECT * FROM till_sessions WHERE event_id=?').all(eventId)){assert.equal(till.expected,tillCash.get(till.id));assert.equal(till.counted,tillCash.get(till.id));}db.close();
 const verified=inspectDatabase(database);const backup=join(tmp,'restore-source.sqlite');await backupDatabase(database,backup);const restored=join(tmp,'restore-drill.sqlite'),restore=await restoreDatabase(backup,restored);
 await start(restored);const first=receipts[0];assert.equal((await request('sale',first.payload,sessions[first.client])).r.status,401);const restoredLogin=await request('login',{staffId:staffIds[first.client],pin:String(3000+first.client)},null);assert.equal(restoredLogin.r.status,200);const restoredSession=restoredLogin.r.headers.get('set-cookie').split(';')[0];assert.equal((await request('sale',first.payload,restoredSession)).data.code,'WRITE_PAUSED');await stop();releaseRestoredDatabase(restored,restore.epoch);await start(restored);assert.equal((await request('sale',first.payload,restoredSession)).data.code,'RESTORE_REVIEW_REQUIRED');await stop();
 report.status='passed';report.finishedAt=new Date().toISOString();report.results={statuses,measuredSeconds:Math.round((performance.now()-started)/1000),newSales:receipts.length,phaseSixSales:phaseSix,phaseTwelveSales:phaseTwelve,persistedSales:sold,duplicateReplays:replays,voids:voided.size,movements,payoutCount,payoutCents,payoutRoundingCents,poolBalance,postMs:{p50:percentile(postTimes,.5),p95:percentile(postTimes,.95),p99:percentile(postTimes,.99),max:Math.round(Math.max(...postTimes))},refreshP95Ms:percentile(readTimes,.95),finalSnapshotBytes:beforeClose.bytes,integrity:verified.integrity,restartReplay:true,restorePaused:true,oldTabletFence:true,restoredSessionsInvalidated:true,independentTillBalances:Object.fromEntries(tillCash)};
 report.limitations=['Synthetic HTTP clients; no physical tablets, WLAN or HTTPS proxy','Driver and app share the available runtime resources; see cgroup limits where recorded','Six tills; six active clients followed by twelve reserve clients','Clock duration and response targets are evidence for this workload only; organizer forecast and physical acceptance remain open'];save();console.log(JSON.stringify(report,null,2));
}catch(error){report.status='failed';report.failure=error.message;report.finishedAt=new Date().toISOString();save();throw error;}finally{await stop();rmSync(tmp,{recursive:true,force:true});}

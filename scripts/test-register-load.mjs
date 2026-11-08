// Disposable HTTP load check: never accepts an external URL or an existing database.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync, readFileSync, rmSync, writeFileSync, openSync, closeSync} from 'node:fs';
import {tmpdir, cpus, totalmem} from 'node:os';
import {join, resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {openDatabase} from '../selfhost/sqlite.mjs';

const seedCount = Number(process.env.LOAD_SEED_SALES ?? 5000);
const perRegister = Number(process.env.LOAD_SALES_PER_REGISTER ?? 100);
for (const n of [seedCount, perRegister]) assert.ok(Number.isSafeInteger(n) && n>=0 && n<=100000, 'Invalid workload size');
assert.ok(perRegister>0);
const basePath = JSON.parse(readFileSync('.next/required-server-files.json', 'utf8')).config.basePath;
const tmp = mkdtempSync(join(tmpdir(), 'basar-http-load-'));
const database = join(tmp, 'basar.sqlite');
const log = join(tmp, 'server.log');
const listener = createServer();
await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve)});
const port = listener.address().port;
await new Promise(resolve=>listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const endpoint = origin+basePath+'/api/basar';
let server, cookie, eventId;
const statuses = {}, latency = [], refreshLatency = [];
let replays = 0;
const request = async (action, payload={}, session=cookie) => {
  const start = performance.now();
  const r = await fetch(endpoint, {method:'POST', headers:{Origin:origin,'Content-Type':'application/json', ...(session?{Cookie:session}:{})}, body:JSON.stringify({action,...payload}), signal:AbortSignal.timeout(30000)});
  const data = await r.json();
  return {r,data,ms:performance.now()-start};
};
const command = async (action, payload={}, session=cookie) => {
  const result = await request(action, {operationId:crypto.randomUUID(),eventId,...payload}, session);
  assert.equal(result.r.status,200,JSON.stringify({action,status:result.r.status,data:result.data}));
  return result.data;
};
const state = async session => {
  const start = performance.now();
  const r = await fetch(endpoint+'?event='+eventId,{headers:{Cookie:session||cookie},signal:AbortSignal.timeout(30000)});
  assert.equal(r.status,200);
  const text = await r.text();
  return {data:JSON.parse(text),bytes:Buffer.byteLength(text),ms:performance.now()-start};
};
async function startServer() {
  const fd = openSync(log,'a');
  server = spawn(process.execPath,['selfhost/start.mjs'],{env:{...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(port),BASAR_DATABASE:database,BASAR_PUBLIC_ORIGIN:origin,NEXT_PUBLIC_BASE_PATH:basePath,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore',fd,fd]});
  closeSync(fd);
  server.on('error',()=>{});
  for (let n=0;n<100;n++) {
    if (server.exitCode!==null || server.signalCode!==null) throw new Error('Server exited: '+readFileSync(log,'utf8'));
    try { const r = await fetch(endpoint,{signal:AbortSignal.timeout(1000)}); if(r.ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Server did not become ready: '+readFileSync(log,'utf8'));
}
async function stopServer() {
  if(!server || server.exitCode!==null || server.signalCode!==null) return;
  const stopped = new Promise(resolve=>server.once('exit',resolve));
  server.kill('SIGTERM');
  const timer=setTimeout(()=>server.kill('SIGKILL'),5000);
  await stopped; clearTimeout(timer);
}
function percentile(values,p) { const sorted=[...values].sort((a,b)=>a-b); return Math.round(sorted[Math.ceil(sorted.length*p)-1]*10)/10; }
try {
  await startServer();
  const logged = await request('demo',{staffId:'demo-leitung'},null);
  assert.equal(logged.r.status,200);
  cookie=logged.r.headers.get('set-cookie').split(';')[0];
  const created=await command('createEvent',{eventId:'demo-fruehjahr',name:'Disposable six-register HTTP test',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:6});
  eventId=created.eventId;
  const tills=[];
  for(let number=1;number<=6;number++) tills.push((await command('openTill',{number,opening:10000})).tillId);
  const sessions=[];
  for(let n=0;n<6;n++) {
    const result=await request('demo',{staffId:'demo-kasse'},null);
    assert.equal(result.r.status,200);
    sessions.push(result.r.headers.get('set-cookie').split(';')[0]);
  }
  // Seed representative history without including fixture creation in the measured workload.
  await stopServer();
  let db=openDatabase(database);
  const insert=db.sqlite.prepare('INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,donation,received,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  db.sqlite.exec('BEGIN IMMEDIATE');
  for(let n=1;n<=seedCount;n++) insert.run(crypto.randomUUID(),eventId,tills[(n-1)%6],'demo-kasse','Cashier',n,JSON.stringify(Array.from({length:5},(_,k)=>({id:crypto.randomUUID(),seller:(n+k)%150+1,price:100}))),500,5,1000,new Date().toISOString());
  db.sqlite.prepare('UPDATE events SET version=version+? WHERE id=?').run(seedCount,eventId);
  db.sqlite.exec('COMMIT'); db.close();
  await startServer();
  const before=await state();
  assert.equal(before.data.sales.length,seedCount);
  const started=performance.now();
  const receipts=[];
  const outcomes=await Promise.allSettled(tills.map(async(tillId,register)=>{
    for(let n=0;n<perRegister;n++) {
      const payload={eventId,tillId,operationId:crypto.randomUUID(),items:Array.from({length:5},()=>({id:crypto.randomUUID(),seller:register+1,price:100+register})),donation:5,received:1000};
      const result=await request('sale',payload,sessions[register]);
      statuses[result.r.status]=(statuses[result.r.status]||0)+1;
      latency.push(result.ms);
      assert.equal(result.r.status,200,JSON.stringify(result.data)); // No hidden retry conceals a conflict.
      const goods=5*(100+register);
      assert.equal(result.data.change,1000-goods-5);
      receipts.push({payload,result:result.data});
      if(n%10===0) {
        // Deliberately ignore the first result at the client and replay its exact command.
        const replay=await request('sale',payload,sessions[register]);
        assert.equal(replay.r.status,200); assert.deepEqual(replay.data,result.data); replays++;
      }
      const refresh=await state(sessions[register]);
      refreshLatency.push(refresh.ms); // Browser also refreshes after each mutation.
    }
  }));
  for(const outcome of outcomes) if(outcome.status==='rejected') throw outcome.reason;
  const elapsed=performance.now()-started;
  await stopServer(); await startServer();
  const after=await state();
  const expected=seedCount+6*perRegister;
  assert.equal(after.data.sales.length,expected);
  assert.equal(new Set(after.data.sales.map(s=>s.number)).size,expected);
  const byId=new Map(after.data.sales.map(s=>[s.id,s]));
  for(const receipt of receipts) {
    const sale=byId.get(receipt.result.saleId); assert.ok(sale);
    assert.equal(sale.total,receipt.result.total); assert.equal(sale.donation,5);
  }
  const expectedTotal=seedCount*505+perRegister*3105;
  assert.equal(after.data.sales.reduce((sum,s)=>sum+s.total+s.donation,0),expectedTotal);
  // Replay a previously acknowledged command after a server restart.
  const replay=await request('sale',receipts[0].payload,sessions[0]);
  assert.equal(replay.r.status,200);assert.deepEqual(replay.data,receipts[0].result);replays++;
  await stopServer();
  db=openDatabase(database);
  assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM operations WHERE event_id=? AND action='sale'").get(eventId).n,6*perRegister);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM audit WHERE event_id=? AND action='Verkauf'").get(eventId).n,6*perRegister);
  db.close();
  const report={timestamp:new Date().toISOString(),runtime:{node:process.version,sqlite:process.versions.sqlite,platform:process.platform,arch:process.arch,logicalCpus:cpus().length,memoryBytes:totalmem()},workload:{registers:6,seededSales:seedCount,itemsPerSale:5,newSales:6*perRegister,duplicateReplays:replays,refreshAfterEachSale:true},results:{statuses,elapsedSeconds:Math.round(elapsed)/1000,salesPerSecond:Math.round(6*perRegister/elapsed*10000)/10,postMs:{p50:percentile(latency,.5),p95:percentile(latency,.95),max:Math.round(Math.max(...latency)*10)/10},refreshMs:{p95:percentile(refreshLatency,.95)},finalStateBytes:after.bytes,persistedSales:expected,ledgerCents:expectedTotal,restartReplay:true,integrityCheck:'ok'},limitations:['Local single-process Next.js/SQLite, not a browser or D1 test','No production CPU/memory quota or reverse proxy','No Wi-Fi fault, power cut, disk-full or browser storage fault injection','Six sessions share the training cashier identity','Seed history bypasses API; measured new sales use HTTP']};
  if(process.env.LOAD_REPORT) writeFileSync(resolve(process.env.LOAD_REPORT),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {
  await stopServer(); rmSync(tmp,{recursive:true,force:true});
}

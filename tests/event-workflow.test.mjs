import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'vite';
import {openDatabase} from '../selfhost/sqlite.mjs';
import {migrateDatabase} from '../selfhost/migrations.mjs';
import {inspectDatabase,fileHash} from '../selfhost/verify.mjs';
import {restoreDatabase} from '../selfhost/restore.mjs';
import {parseItemPrice,sellerClaim} from '../lib/basar/domain.ts';

const tmp=mkdtempSync(join(tmpdir(),'basar-event-workflow-'));
const priorKey=process.env.BASAR_TEAM_PIN_KEY;process.env.BASAR_TEAM_PIN_KEY='a4'.repeat(32); // Public synthetic test key only.
await build({configFile:false,logLevel:'error',resolve:{alias:{'@':resolve('.')}},build:{lib:{entry:{service:resolve('lib/basar/service.ts'),route:resolve('app/api/basar/route.ts')},formats:['es'],fileName:(_format,name)=>name+'.mjs'},outDir:tmp,emptyOutDir:false,minify:false}});
const {bootstrap,mutate,readState,readRegisterState,readTeam,login,auth,operationStatus}=await import(join(tmp,'service.mjs'));
const {POST}=await import(join(tmp,'route.mjs'));
const path=join(tmp,'events.sqlite'),db=openDatabase(path);globalThis.__basarDB=db;migrateDatabase(db);await bootstrap();
const person=id=>db.sqlite.prepare('SELECT id,name,role,event_id,till_number,auth_version FROM staff WHERE id=?').get(id);
const manager=person('demo-leitung');
const command=(eventId,action,p={},user=manager)=>mutate(action,{eventId,operationId:crypto.randomUUID(),...p},user);
const event=async(name,tillCount=2)=>(await command('demo-fruehjahr','createEvent',{name,date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount})).eventId;
const cashier=async(eventId,number,name='Synthetic cashier')=>{const id=crypto.randomUUID();await command(eventId,'addStaff',{operationId:id,name,role:'cashier',tillNumber:number,pin:'4826'});return person(id);};
after(()=>{db.close();rmSync(tmp,{recursive:true,force:true});if(priorKey===undefined)delete process.env.BASAR_TEAM_PIN_KEY;else process.env.BASAR_TEAM_PIN_KEY=priorKey;});

test('item input uses exact tenths of euros and only fifty-cent price steps; payout rounding is separate',()=>{
  assert.equal(parseItemPrice('5'),50);assert.equal(parseItemPrice('25'),250);assert.equal(parseItemPrice('100000'),1000000);
  for(const value of ['','0','1','7','2,50','25.0','-5','Infinity','100005'])assert.equal(parseItemPrice(value),null,value);
  for(let gross=50;gross<10000;gross+=50){const claim=sellerClaim(gross,1500,'pool');assert.equal(claim.net%10,0);assert.equal(claim.commission+claim.rounding+claim.net,gross);assert.ok(claim.rounding>=0&&claim.rounding<=9);}
  assert.deepEqual(sellerClaim(650,1500,'pool'),{commission:98,rounding:2,net:550});
  assert.deepEqual(sellerClaim(650,1500,'till'),{commission:98,rounding:0,net:552});
});

test('cashier scope restricts full exports, register totals, history/search, event selection and sale/open commands',async()=>{
  const id=await event('Scope isolation'),other=await event('Other event');
  const one=(await command(id,'openTill',{number:1,opening:10000})).tillId,two=(await command(id,'openTill',{number:2,opening:10000})).tillId;
  const actor=await cashier(id,1),second=await cashier(id,2,'Other cashier');
  await command(id,'sale',{tillId:one,items:[{id:crypto.randomUUID(),seller:1,price:650}],received:1000},actor);
  await command(id,'sale',{tillId:two,items:[{id:crypto.randomUUID(),seller:42,price:250}],received:1000},second);
  const compact=await readRegisterState(id,actor),full=await readState(id,actor);
  for(const state of [compact,full]){assert.equal(state.events.length,1);assert.equal(state.event.id,id);assert.equal(state.tills.length,1);assert.equal(state.sales.length,1);assert.equal(state.sales[0].total,650);assert.deepEqual(state.payouts,[]);assert.deepEqual(state.audit,[]);assert.equal(state.pool,undefined);assert.equal(state.staff.length,1);assert.ok(!JSON.stringify(state).includes('pin_cipher'));assert.ok(!JSON.stringify(state).includes('pin_hash'));}
  assert.equal(compact.summary.gross,650);assert.equal(compact.summary.count,1);assert.deepEqual(compact.summary.sellers,[]);
  assert.equal((await readRegisterState(id,actor,{search:'42'})).sales.length,0);
  for(const read of [readState,readRegisterState])await assert.rejects(()=>read(other,actor),error=>error.code==='SCOPE_MISMATCH');
  await assert.rejects(()=>command(id,'sale',{tillId:two,items:[{id:crypto.randomUUID(),seller:1,price:50}],received:1000},actor),error=>error.code==='SCOPE_MISMATCH');
  await assert.rejects(()=>command(id,'openTill',{number:2,opening:0},actor),error=>error.code==='SCOPE_MISMATCH');
  await assert.rejects(()=>operationStatus('sale',{eventId:other,operationId:crypto.randomUUID()},actor),error=>error.code==='SCOPE_MISMATCH');
  await assert.rejects(()=>readTeam(id,actor,true),error=>error.status===403);
  assert.equal((await readState(id,manager)).sales.length,2);
});

test('new sale validation refuses cent prices that bypass the numeric UI without altering the ledger',async()=>{
  const id=await event('Price enforcement'),till=(await command(id,'openTill',{number:1,opening:1000})).tillId;
  for(const price of [1,49,51,125,250.5])await assert.rejects(()=>command(id,'sale',{tillId:till,items:[{id:crypto.randomUUID(),seller:1,price}],received:1000}),/0,50/);
  assert.equal((await readState(id,manager)).sales.length,0);
});

test('HTTP upgrade gate blocks unknown obsolete commands but preserves original outcome lookup and exact replay',async()=>{
 const id=await event('HTTP entry protocol'),till=(await command(id,'openTill',{number:1,opening:1000})).tillId;
 const token=await login(manager.id,'1234',new Request('https://example.test')),oldOrigin=process.env.BASAR_PUBLIC_ORIGIN;process.env.BASAR_PUBLIC_ORIGIN='https://example.test';
 const send=body=>POST(new Request('https://example.test/api/basar',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',Cookie:'basar_session='+token},body:JSON.stringify(body)}));
 const legacy={action:'sale',eventId:id,operationId:crypto.randomUUID(),tillId:till,items:[{id:crypto.randomUUID(),seller:1,price:650}],received:1000};
 try{
  const blocked=await send(legacy);assert.equal(blocked.status,409);const upgrade=await blocked.json();assert.equal(upgrade.code,'CLIENT_UPGRADE_REQUIRED');assert.equal(upgrade.recorded,false);assert.match(upgrade.error,/neu laden/);
  assert.equal(db.sqlite.prepare('SELECT id FROM operations WHERE id=?').get(legacy.operationId),undefined);
  const accepted=await send({...legacy,entryFormat:'tenths-v1'});assert.equal(accepted.status,200);const receipt=await accepted.json();
  const replay=await send(legacy);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),receipt);
  const checked=await send({action:'operationStatus',command:legacy});assert.deepEqual(await checked.json(),{state:'committed',result:receipt});
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sales WHERE event_id=?').get(id).n,1);
 }finally{if(oldOrigin===undefined)delete process.env.BASAR_PUBLIC_ORIGIN;else process.env.BASAR_PUBLIC_ORIGIN=oldOrigin;}
});

test('a team reassignment racing a prepared sale cannot commit with the revoked authorization',async()=>{
  const id=await event('Revocation at commit'),till=(await command(id,'openTill',{number:1,opening:1000})).tillId,actor=await cashier(id,1);
  const originalBatch=db.batch;let release,arrived;
  const paused=new Promise(resolve=>{arrived=resolve}),continueCommit=new Promise(resolve=>{release=resolve});let intercepted=false;
  db.batch=async statements=>{
    if(!intercepted&&statements[0].sql.startsWith('UPDATE events SET version=')){intercepted=true;arrived();await continueCommit;}
    return originalBatch(statements);
  };
  const operationId=crypto.randomUUID();
  const sale=command(id,'sale',{operationId,tillId:till,items:[{id:crypto.randomUUID(),seller:1,price:650}],received:1000},actor);
  const rejected=assert.rejects(()=>sale,error=>error.code==='AUTH_REQUIRED');
  try{await paused;await command(id,'updateStaff',{memberId:actor.id,name:actor.name,role:'cashier',tillNumber:2,pin:'',disabled:false});release();await rejected;}
  finally{release();db.batch=originalBatch;}
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sales WHERE event_id=?').get(id).n,0);
  assert.equal(db.sqlite.prepare('SELECT id FROM operations WHERE id=?').get(operationId),undefined);
});

test('failure writing a pool contribution rolls back closure, revision, audit and operation together',async()=>{
  const id=await event('Pool transfer storage failure'),till=(await command(id,'openTill',{number:1,opening:1000})).tillId;
  await command(id,'eventStatus',{status:'settlement'});const version=db.sqlite.prepare('SELECT version FROM events WHERE id=?').get(id).version;
  db.sqlite.exec("CREATE TRIGGER fixture_reject_pool BEFORE INSERT ON pool_entries BEGIN SELECT RAISE(ABORT,'Synthetic storage failure'); END;");
  const operationId=crypto.randomUUID();
  try{await assert.rejects(()=>command(id,'closeTill',{operationId,tillId:till,counted:1000}),/Synthetic storage failure/);}
  finally{db.sqlite.exec('DROP TRIGGER fixture_reject_pool');}
  assert.equal(db.sqlite.prepare('SELECT closed_at FROM till_sessions WHERE id=?').get(till).closed_at,null);
  assert.equal(db.sqlite.prepare('SELECT version FROM events WHERE id=?').get(id).version,version);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pool_entries WHERE event_id=?').get(id).n,0);
  assert.equal(db.sqlite.prepare('SELECT id FROM operations WHERE id=?').get(operationId),undefined);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM audit WHERE event_id=? AND action='Kassenabschluss'").get(id).n,0);
});

test('counted closures transfer once, payouts wait for all tills, and independent pool/seller accounting balances',async()=>{
  const id=await event('Counted pool and independent settlement');
  const one=(await command(id,'openTill',{number:1,opening:1000})).tillId,two=(await command(id,'openTill',{number:2,opening:1000})).tillId;
  await command(id,'sale',{tillId:one,items:[{id:crypto.randomUUID(),seller:1,price:650}],donation:50,received:1000});
  await command(id,'sale',{tillId:two,items:[{id:crypto.randomUUID(),seller:2,price:50}],received:100});
  await assert.rejects(()=>command(id,'closeTill',{tillId:one,counted:1700}),/Verkaufsphase/);
  await command(id,'eventStatus',{status:'settlement'});
  await assert.rejects(()=>command(id,'openTill',{number:2,opening:0}),/Verkaufsende/);
  const close={eventId:id,operationId:crypto.randomUUID(),tillId:one,counted:1699,note:'Synthetic one-cent count deficit'};
  const closed=await Promise.all(Array.from({length:6},()=>mutate('closeTill',close,manager)));assert.ok(closed.every(row=>row.difference===-1));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM pool_entries WHERE till_id=?').get(one).n,1);
  await assert.rejects(()=>command(id,'payout',{seller:1}),/alle Kassen/);
  await command(id,'closeTill',{tillId:two,counted:1050});
  assert.equal((await readState(id,manager)).pool.balance,2749);
  await command(id,'poolMovement',{amount:-2000,reason:'Return both opening floats'});
  const payouts=await Promise.allSettled([command(id,'payout',{seller:1}),command(id,'payout',{seller:1})]);assert.equal(payouts.filter(row=>row.status==='fulfilled').length,1);
  const pay={eventId:id,operationId:crypto.randomUUID(),seller:2};await mutate('payout',pay,manager);await mutate('payout',pay,manager);
  const state=await readState(id,manager);assert.equal(state.pool.balance,159);assert.equal(state.pool.contributed,2749);assert.equal(state.pool.movements,-2000);assert.equal(state.pool.paid,590);
  const rows=state.payouts.sort((a,b)=>a.seller-b.seller);assert.deepEqual(rows.map(row=>[row.gross,row.commission,row.rounding,row.net,row.funding,row.till_id]),[[650,98,2,550,'pool',null],[50,8,2,40,'pool',null]]);
  assert.equal(rows.reduce((sum,row)=>sum+row.commission+row.rounding+row.net,0),700); // Independent fixture goods total.
  assert.equal(state.pool.balance,106+4+50-1);
  await assert.rejects(()=>command(id,'poolMovement',{amount:-160,reason:'Insufficient cash attempt'}),/nicht genügend/);
  await command(id,'eventStatus',{status:'closed'});await mutate('payout',pay,manager);assert.equal((await readState(id,manager)).pool.balance,159);
  assert.equal(inspectDatabase(path).integrity,'ok');
});

test('event team PINs are encrypted, revealed only explicitly to its managers, and changes revoke sessions',async()=>{
  const id=await event('Event team lifecycle'),other=await event('Other team'),actor=await cashier(id,1);
  const token=await login(actor.id,'4826',new Request('https://example.test')),request=new Request('https://example.test',{headers:{cookie:'basar_session='+token}});
  assert.equal((await auth(request)).event_id,id);
  const ordinary=await readState(id,manager);assert.ok(!JSON.stringify(ordinary).includes('4826'));assert.ok(!JSON.stringify(ordinary).includes('pin_cipher'));
  const hidden=await readTeam(id,manager);assert.equal(hidden.find(row=>row.id===actor.id).pin,undefined);
  assert.equal((await readTeam(id,manager,true)).find(row=>row.id===actor.id).pin,'4826');
  const stored=db.sqlite.prepare('SELECT pin_cipher,pin_hash FROM staff WHERE id=?').get(actor.id);assert.ok(stored.pin_cipher.startsWith('v1:'));assert.ok(!stored.pin_cipher.includes('4826'));assert.ok(!stored.pin_hash.includes('4826'));
  const managerId=crypto.randomUUID();await command(other,'addStaff',{operationId:managerId,name:'Other event manager',role:'manager',pin:'7328'});await assert.rejects(()=>readTeam(id,person(managerId),true),error=>error.status===403);
  await command(id,'updateStaff',{memberId:actor.id,name:'Renamed person',role:'cashier',tillNumber:2,pin:'6842',disabled:false});
  assert.equal(await auth(request),null);await assert.rejects(()=>command(id,'openTill',{number:1,opening:0},actor),error=>error.status===401);
  await assert.rejects(()=>login(actor.id,'4826',request),error=>error.status===401);const newToken=await login(actor.id,'6842',request);assert.equal((await auth(new Request(request,{headers:{cookie:'basar_session='+newToken}}))).till_number,2);
  assert.equal((await readTeam(id,manager,true)).find(row=>row.id===actor.id).pin,'6842');
  const updated=person(actor.id);await command(id,'updateStaff',{memberId:actor.id,name:'Renamed person',role:'cashier',tillNumber:2,pin:'',disabled:true});assert.equal(await auth(new Request(request,{headers:{cookie:'basar_session='+newToken}})),null);
  await assert.rejects(()=>login(updated.id,'6842',request),error=>error.status===401);
});

test('a PIN reset racing an old login cannot create a fresh session after revocation',async t=>{
  const id=await event('PIN reset login race'),actor=await cashier(id,1),derive=crypto.subtle.deriveBits.bind(crypto.subtle);
  let release,arrived,first=true;const paused=new Promise(resolve=>{arrived=resolve}),resume=new Promise(resolve=>{release=resolve});
  const mocked=t.mock.method(crypto.subtle,'deriveBits',async(...args)=>{const result=await derive(...args);if(first){first=false;arrived();await resume;}return result;});
  const oldLogin=login(actor.id,'4826',new Request('https://example.test')),rejected=assert.rejects(()=>oldLogin,error=>error.code==='AUTH_REQUIRED');
  try{await paused;await command(id,'updateStaff',{memberId:actor.id,name:actor.name,role:'cashier',tillNumber:1,pin:'6842',disabled:false});release();await rejected;}
  finally{release();mocked.mock.restore();}
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sessions WHERE staff_id=?').get(actor.id).n,0);
  await assert.rejects(()=>login(actor.id,'4826',new Request('https://example.test')),error=>error.status===401);
  assert.ok(await login(actor.id,'6842',new Request('https://example.test')));
});

test('PIN persistence fails closed without a key and PIN plaintext is never stored in operation outcomes or fingerprints',async()=>{
  const id=await event('Key availability'),operationId=crypto.randomUUID(),key=process.env.BASAR_TEAM_PIN_KEY;delete process.env.BASAR_TEAM_PIN_KEY;
  try{await assert.rejects(()=>command(id,'addStaff',{operationId,name:'Missing key',role:'cashier',tillNumber:1,pin:'7281'}),error=>error.code==='PIN_KEY_MISSING');assert.equal(db.sqlite.prepare('SELECT id FROM staff WHERE id=?').get(operationId),undefined);}
  finally{process.env.BASAR_TEAM_PIN_KEY=key;}
  const retry=crypto.randomUUID();await command(id,'addStaff',{operationId:retry,name:'Protected PIN',role:'cashier',tillNumber:1,pin:'7281'});
  const row=db.sqlite.prepare('SELECT request_hash,result FROM operations WHERE id=?').get(retry);assert.equal(row.request_hash,null);assert.ok(!row.result.includes('7281'));
});

test('restore retains pooled contributions, funding and rounded payouts without changing the original snapshot',async()=>{
  const hash=await fileHash(path),restored=await restoreDatabase(path,join(tmp,'restored.sqlite'));
  assert.equal(restored.writesPaused,true);assert.equal(await fileHash(path),hash);assert.deepEqual(restored.report.pool,inspectDatabase(path).pool);assert.ok(restored.report.counts.pool_entries>=3);
});

test('upgrade preserves legacy cent payouts and original IDs while creating no invented pool cash',()=>{
  const legacy=openDatabase(':memory:');
  for(const file of readdirSync('drizzle').filter(file=>/^000[0-3]_.*\.sql$/.test(file)).sort())legacy.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  legacy.sqlite.exec("INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,created_at) VALUES('old','Legacy','2026-11-01',1500,1,150,1,'old'); INSERT INTO till_sessions(id,event_id,number,opening,opened_at,opened_by) VALUES('t','old',1,1000,'old','Person'); INSERT INTO payouts(id,event_id,seller,gross,commission,net,till_id,staff_name,created_at) VALUES('p','old',42,650,98,552,'t','Person','old');");
  legacy.sqlite.exec('BEGIN IMMEDIATE');legacy.sqlite.exec(readFileSync('drizzle/'+readdirSync('drizzle').find(file=>file.startsWith('0004_')&&file.endsWith('.sql')),'utf8'));legacy.sqlite.exec('COMMIT');
  assert.deepEqual({...legacy.sqlite.prepare('SELECT id,gross,commission,net,rounding,funding,till_id FROM payouts').get()},{id:'p',gross:650,commission:98,net:552,rounding:0,funding:'till',till_id:'t'});
  assert.equal(legacy.sqlite.prepare('SELECT settlement_mode FROM events').get().settlement_mode,'till');assert.equal(legacy.sqlite.prepare('SELECT COUNT(*) n FROM pool_entries').get().n,0);assert.equal(legacy.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);legacy.close();
});

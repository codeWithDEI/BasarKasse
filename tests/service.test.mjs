import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {build} from 'vite';
import {openDatabase} from '../selfhost/sqlite.mjs';
const tmp=mkdtempSync(join(tmpdir(),'basar-test-'));
await build({configFile:false,logLevel:'error',build:{lib:{entry:resolve('lib/basar/service.ts'),formats:['es'],fileName:()=> 'service.mjs'},outDir:tmp,emptyOutDir:false,minify:false}});
const {bootstrap,mutate,readState,readRegisterState,login,auth}=await import(join(tmp,'service.mjs'));
const db=openDatabase(':memory:');globalThis.__basarDB=db;for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));await bootstrap();
const manager={id:'demo-leitung',name:'Kassenleitung',role:'manager'},cashier={id:'demo-kasse',name:'Kassiererin',role:'cashier'};
// Preserve the deployed till/cent policy as an explicit legacy fixture. New policy is tested in event-workflow.test.mjs.
process.env.BASAR_TEAM_PIN_KEY='b6'.repeat(32); // Synthetic test key.
db.sqlite.prepare("UPDATE events SET settlement_mode='till'").run();
const eventId='demo-fruehjahr';const cmd=async(action,p={},user=manager)=>{const result=await mutate(action,{operationId:crypto.randomUUID(),eventId,...p},user);if(action==='createEvent')db.sqlite.prepare("UPDATE events SET settlement_mode='till' WHERE id=?").run(result.eventId);return result;};
const cashierFor=(id,number=1)=>{if(id===eventId)return {...cashier,event_id:id,till_number:1,auth_version:0};const key='fixture-cashier-'+id;db.sqlite.prepare("INSERT OR IGNORE INTO staff(id,name,role,pin_hash,event_id,till_number) SELECT ?,'Legacy fixture cashier','cashier',pin_hash,?,? FROM staff WHERE id='demo-kasse'").run(key,id,number);return {id:key,name:'Legacy fixture cashier',role:'cashier',event_id:id,till_number:number,auth_version:0};};
let tillId;
after(()=>{db.close();rmSync(tmp,{recursive:true,force:true})});
test('PIN-Anmeldung erzeugt eine geschützte Sitzung',async()=>{const r=new Request('https://example.test');await assert.rejects(()=>login(manager.id,'0000',r),/PIN/);const token=await login(manager.id,'1234',r);assert.equal((await auth(new Request('https://example.test',{headers:{cookie:'basar_session='+token}}))).role,'manager')});
test('sessions survive inactivity for the shift, expire at twelve hours, and still reject disabled accounts',async t=>{
 const request=new Request('https://example.test'),issuedAt=Date.now();
 const clock=t.mock.method(Date,'now',()=>issuedAt);
 const token=await login(cashier.id,'1234',request),authenticated=new Request(request,{headers:{cookie:'basar_session='+token}});
 try {
  for(const elapsed of [5*60000,11*3600000+59*60000]){clock.mock.mockImplementation(()=>issuedAt+elapsed);assert.equal((await auth(authenticated)).id,cashier.id);}
  clock.mock.mockImplementation(()=>issuedAt+12*3600000);assert.equal(await auth(authenticated),null);
  clock.mock.mockImplementation(()=>issuedAt+60000);db.sqlite.prepare('UPDATE staff SET disabled=1 WHERE id=?').run(cashier.id);assert.equal(await auth(authenticated),null);
 } finally {db.sqlite.prepare('UPDATE staff SET disabled=0 WHERE id=?').run(cashier.id);clock.mock.restore();}
});
test('Die Kassenleitung kann eine Kasse mit Wechselgeld öffnen',async()=>{const result=await cmd('openTill',{number:1,opening:10000});tillId=result.tillId;assert.equal((await readState(eventId,manager)).tills[0].opening,10000);await assert.rejects(()=>cmd('openTill',{number:1,opening:10000}),/bereits geöffnet/)});
test('Identischer Verkauf wird auch bei gleichzeitigem Senden genau einmal gebucht',async()=>{const p={operationId:crypto.randomUUID(),eventId,tillId,items:[{id:crypto.randomUUID(),seller:42,price:1000},{id:crypto.randomUUID(),seller:7,price:250}],received:2000};const r=await Promise.all([mutate('sale',p,cashierFor(p.eventId)),mutate('sale',p,cashierFor(p.eventId))]);assert.equal(r[0].saleId,r[1].saleId);assert.equal(r[0].change,750);const state=await readState(eventId,manager);assert.equal(state.sales.length,1);assert.equal(state.sales[0].total,1250)});
test('Zwei verschiedene parallele Verkäufe bleiben beide erhalten',async()=>{await Promise.all([cmd('sale',{tillId,items:[{id:crypto.randomUUID(),seller:1,price:100}],received:100},cashier),cmd('sale',{tillId,items:[{id:crypto.randomUUID(),seller:2,price:200}],received:200},cashier)]);const s=await readState(eventId,manager);assert.equal(s.sales.length,3);assert.equal(new Set(s.sales.map(s=>s.number)).size,3)});
test('Kassiererinnen können weder auszahlen noch Einstellungen oder Geldbewegungen ändern',async()=>{for(const action of ['payout','eventStatus','updateEvent','movement','closeTill','addStaff','createEvent','void'])await assert.rejects(()=>cmd(action,{},cashier),/vorbehalten/)});
test('Storno ist nachvollziehbar und wird genau einmal ausgeführt',async()=>{const state=await readState(eventId,manager);const s=state.sales.find(s=>s.total===100);await cmd('void',{saleId:s.id,reason:'Fehler bei der Eingabe'});await assert.rejects(()=>cmd('void',{saleId:s.id,reason:'Noch einmal'}),/bereits storniert/);assert.ok((await readState(eventId,manager)).sales.find(x=>x.id===s.id).voided_at)});
test('Auszahlung erst nach Verkaufsende, danach sind weitere Verkäufe gesperrt',async()=>{await assert.rejects(()=>cmd('payout',{seller:42,tillId}),/Verkaufsphase/);await cmd('eventStatus',{status:'settlement'});await assert.rejects(()=>cmd('sale',{tillId,items:[{id:crypto.randomUUID(),seller:2,price:100}],received:100}),/Verkaufsphase/);await cmd('payout',{seller:42,tillId});const s=await readState(eventId,manager);assert.equal(s.payouts[0].net,850);assert.equal(s.payouts[0].commission,150);await assert.rejects(()=>cmd('payout',{seller:42,tillId}),/Keine offene/);const original=s.sales.find(s=>s.items.some(i=>i.seller===42));await assert.rejects(()=>cmd('void',{saleId:original.id,reason:'zu spät'}),/ausgezahlt/)});
test('Abschluss prüft Differenzen, offene Kassen und offene Verkäuferansprüche',async()=>{await assert.rejects(()=>cmd('eventStatus',{status:'closed'}),/Kassen/);await cmd('payout',{seller:7,tillId});await cmd('payout',{seller:2,tillId});await cmd('movement',{tillId,amount:1000,reason:'Zusätzliches Wechselgeld'});await cmd('movement',{tillId,amount:-500,reason:'Entnahme in Hauptkasse'});const s=await readState(eventId,manager);const {tillBalance}=await import('../lib/basar/domain.ts');const expected=tillBalance(s,s.tills[0]);assert.equal(expected,10718);await assert.rejects(()=>cmd('closeTill',{tillId,counted:expected-1}),/Kassendifferenz/);await cmd('closeTill',{tillId,counted:expected});await cmd('eventStatus',{status:'closed'});assert.equal((await readState(eventId,manager)).event.status,'closed')});
test('SQLite batch rollt fehlgeschlagene Mehrfachbuchungen vollständig zurück',async()=>{await assert.rejects(()=>db.batch([db.prepare('UPDATE events SET name=? WHERE id=?').bind('FALSCH',eventId),db.prepare('INSERT INTO unknown_table VALUES (1)')]));assert.notEqual((await readState(eventId,manager)).event.name,'FALSCH')});

test('Eine konsistente SQLite-Sicherung kann wieder geöffnet werden',async()=>{const source=join(tmp,'source.sqlite'),target=join(tmp,'backup.sqlite');const sourceDb=openDatabase(source);sourceDb.sqlite.exec('CREATE TABLE example(id INTEGER PRIMARY KEY, name TEXT)');sourceDb.sqlite.prepare('INSERT INTO example(name) VALUES(?)').run('Prüfdaten');const {backupDatabase}=await import('../selfhost/backup.mjs');await backupDatabase(source,target);const restored=openDatabase(target);assert.equal(restored.sqlite.prepare('SELECT name FROM example').get().name,'Prüfdaten');restored.close();sourceDb.close()});
test('Aufrunden von 6,50 auf 7 Euro: persistenter Betrag, Rückgeld, Storno und Verkäuferauszahlung stimmen',async()=>{
 const created=await cmd('createEvent',{name:'Aufrundung Test',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:2});
 const id=created.eventId;const run=(action,p={})=>cmd(action,{eventId:id,...p});
 const {tillId:cash}=await run('openTill',{number:1,opening:10000});
 const payload={operationId:crypto.randomUUID(),eventId:id,tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],donation:50,received:1000};
 const results=await Promise.all([mutate('sale',payload,cashierFor(payload.eventId)),mutate('sale',payload,cashierFor(payload.eventId))]);
 assert.equal(results[0].saleId,results[1].saleId);assert.equal(results[0].total,650);assert.equal(results[0].donation,50);assert.equal(results[0].payable,700);assert.equal(results[0].change,300);
 let s=await readState(id,manager);assert.equal(s.sales.length,1);assert.equal(s.sales[0].donation,50);assert.equal(s.sales[0].received,1000);
 for(const donation of [-1,0.5,'50',1000001])await assert.rejects(()=>run('sale',{tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],donation,received:1000}),/Aufrundung/);
 await assert.rejects(()=>run('sale',{tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],donation:50,received:650}),/einschließlich Aufrundung/);
 const ordinary=await run('sale',{tillId:cash,items:[{id:crypto.randomUUID(),seller:43,price:650}],received:1000});assert.equal(ordinary.donation,0);assert.equal(ordinary.change,350);await run('void',{saleId:ordinary.saleId,reason:'Übung ohne Aufrundung'});
 const cancelled=await run('sale',{tillId:cash,items:[{id:crypto.randomUUID(),seller:7,price:200}],donation:100,received:500});assert.equal(cancelled.change,200);await run('void',{saleId:cancelled.saleId,reason:'Gesamten Einkauf mit Trinkgeld zurücknehmen'});
 const {sellerSummaries,tillBalance}=await import('../lib/basar/domain.ts');s=await readState(id,manager);assert.equal(tillBalance(s,s.tills[0]),10700);assert.equal(sellerSummaries(s)[0].gross,650);assert.equal(s.sales.filter(x=>!x.voided_at).reduce((a,x)=>a+x.donation,0),50);
 await run('eventStatus',{status:'settlement'});await run('payout',{seller:42,tillId:cash});s=await readState(id,manager);assert.equal(s.payouts[0].gross,650);assert.equal(s.payouts[0].commission,98);assert.equal(s.payouts[0].net,552);assert.equal(tillBalance(s,s.tills[0]),10148);
 await run('closeTill',{tillId:cash,counted:10148});await run('eventStatus',{status:'closed'});assert.equal((await readState(id,manager)).tills[0].expected,10148);
});
test('Die zusätzliche Spalte erhält bestehende Verkäufe mit Aufrundung null',()=>{
 const old=openDatabase(':memory:');const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();old.sqlite.exec(readFileSync('drizzle/'+files[0],'utf8'));
 old.sqlite.exec("INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,created_at) VALUES('old','Bestehender Basar','2027-03-13',1500,1,150,3,'2026-11-07'); INSERT INTO till_sessions(id,event_id,number,opening,opened_at,opened_by) VALUES('old-till','old',1,10000,'2026-11-07','Test'); INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,received,created_at) VALUES('old-sale','old','old-till','test','Test',1,'[]',650,1000,'2026-11-07');");
 for(const file of files.slice(1))old.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const row=old.sqlite.prepare('SELECT total,donation,received FROM sales WHERE id=?').get('old-sale');assert.equal(row.total,650);assert.equal(row.donation,0);assert.equal(row.received,1000);old.close();
});

test('Storno verlangt verfügbares Bargeld einschließlich Trinkgeld und bleibt bei Ablehnung unverändert',async()=>{
 const created=await cmd('createEvent',{name:'Rückzahlung nach Entnahme',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});
 const run=(action,p={})=>cmd(action,{eventId:created.eventId,...p});
 const {tillId:cash}=await run('openTill',{number:1,opening:0});
 const sale=await run('sale',{tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],donation:50,received:700});
 await run('movement',{tillId:cash,amount:-700,reason:'Entnahme in Hauptkasse'});
 await assert.rejects(()=>run('void',{saleId:sale.saleId,reason:'Einkauf zurückgeben'}),/Rückzahlung/);
 const {tillBalance}=await import('../lib/basar/domain.ts');
 let s=await readState(created.eventId,manager);assert.equal(s.sales[0].voided_at,null);assert.equal(tillBalance(s,s.tills[0]),0);
 await run('movement',{tillId:cash,amount:700,reason:'Bargeld für Rückzahlung'});
 await run('void',{saleId:sale.saleId,reason:'Einkauf zurückgeben'});
 s=await readState(created.eventId,manager);assert.ok(s.sales[0].voided_at);assert.equal(tillBalance(s,s.tills[0]),0);
});

test('Ein geänderter Client-IP-Header umgeht die kontobezogene Anmeldesperre nicht',async()=>{
 const target=await cmd('createEvent',{name:'Login limits event',date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});const id=crypto.randomUUID();await cmd('addStaff',{eventId:target.eventId,operationId:id,name:'Loginbegrenzung Test',pin:'5826',role:'cashier',tillNumber:1});
 for(let n=0;n<10;n++)await assert.rejects(()=>login(id,'0000',new Request('https://example.test',{headers:{'CF-Connecting-IP':'192.0.2.10'}})),/PIN/);
 await assert.rejects(()=>login(id,'5826',new Request('https://example.test',{headers:{'CF-Connecting-IP':'192.0.2.11'}})),e=>e.status===429);
});

test('operation lookup verifies command contents, actor, event and action',async()=>{
 const {operationStatus}=await import(join(tmp,'service.mjs'));
 const {eventId:id}=await cmd('createEvent',{name:'Recovery identity',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});
 const {tillId:cash}=await cmd('openTill',{eventId:id,number:1,opening:10000});
 const p={operationId:crypto.randomUUID(),eventId:id,tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],donation:50,received:1000};
 assert.equal((await operationStatus('sale',p,cashierFor(p.eventId))).state,'not_found');
 const first=await mutate('sale',p,cashierFor(p.eventId));
 assert.deepEqual((await operationStatus('sale',p,cashierFor(p.eventId))).result,first);
 for(const changed of [{...p,received:2000},{...p,donation:100},{...p,eventId:'demo-fruehjahr'}])await assert.rejects(()=>mutate('sale',changed,cashierFor(p.eventId)),e=>['OPERATION_MISMATCH','SCOPE_MISMATCH'].includes(e.code));
 await assert.rejects(()=>operationStatus('sale',p,manager),e=>['OPERATION_MISMATCH','SCOPE_MISMATCH'].includes(e.code));
 await assert.rejects(()=>operationStatus('void',p,cashierFor(p.eventId)),e=>['OPERATION_MISMATCH','SCOPE_MISMATCH'].includes(e.code));
 assert.equal((await readState(id,manager)).sales.length,1);
});
test('a recorded rejection cannot later turn into a successful sale under the same ID',async()=>{
 const {operationStatus}=await import(join(tmp,'service.mjs'));
 const {eventId:id}=await cmd('createEvent',{name:'Durable rejection',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});
 const {tillId:cash}=await cmd('openTill',{eventId:id,number:1,opening:10000});
 const p={operationId:crypto.randomUUID(),eventId:id,tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],received:100};
 await assert.rejects(()=>mutate('sale',p,cashierFor(p.eventId)),e=>e.recorded===true);
 assert.equal((await operationStatus('sale',p,cashierFor(p.eventId))).state,'rejected');
 await assert.rejects(()=>mutate('sale',{...p,received:1000},cashier),e=>['OPERATION_MISMATCH','SCOPE_MISMATCH'].includes(e.code));
 await assert.rejects(()=>mutate('sale',p,cashierFor(p.eventId)),e=>e.recorded===true);
 assert.equal((await readState(id,manager)).sales.length,0);
});
test('legacy sale replay compares the original receipt when no request hash exists',async()=>{
 const {operationStatus}=await import(join(tmp,'service.mjs'));
 const {eventId:id}=await cmd('createEvent',{name:'Legacy recovery',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});
 const {tillId:cash}=await cmd('openTill',{eventId:id,number:1,opening:10000});
 const p={operationId:crypto.randomUUID(),eventId:id,tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],received:1000};
 const result=await mutate('sale',p,cashierFor(p.eventId));db.sqlite.prepare('UPDATE operations SET request_hash=NULL WHERE id=?').run(p.operationId);
 assert.deepEqual((await operationStatus('sale',p,cashierFor(p.eventId))).result,result);
 await assert.rejects(()=>operationStatus('sale',{...p,received:2000},cashierFor(p.eventId)),e=>['OPERATION_MISMATCH','SCOPE_MISMATCH'].includes(e.code));
});
test('sale replay racing end-of-sales has one durable outcome and no partial booking',async()=>{
 const {operationStatus}=await import(join(tmp,'service.mjs'));
 const {eventId:id}=await cmd('createEvent',{name:'Phase and reply race',date:'2027-03-13',commission:1500,sellerMin:1,sellerMax:150,tillCount:1});
 const {tillId:cash}=await cmd('openTill',{eventId:id,number:1,opening:10000});
 const p={operationId:crypto.randomUUID(),eventId:id,tillId:cash,items:[{id:crypto.randomUUID(),seller:42,price:650}],received:1000};
 await Promise.allSettled([cmd('eventStatus',{eventId:id,status:'settlement'}),...Array.from({length:6},()=>mutate('sale',p,cashierFor(p.eventId)))]);
 const outcome=await operationStatus('sale',p,cashierFor(p.eventId));assert.notEqual(outcome.state,'not_found');
 const s=await readState(id,manager);assert.equal(s.sales.length,outcome.state==='committed'?1:0);
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM operations WHERE id=?').get(p.operationId).n,1);
 if(outcome.state==='committed')assert.deepEqual(await mutate('sale',p,cashierFor(p.eventId)),outcome.result);
 else await assert.rejects(()=>mutate('sale',p,cashierFor(p.eventId)),e=>e.recorded===true);
});

test('the recovery migration preserves pre-upgrade operation results',()=>{
 const old=openDatabase(':memory:');const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.slice(0,2))old.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 old.sqlite.prepare('INSERT INTO operations(id,event_id,staff_id,action,result,created_at) VALUES(?,?,?,?,?,?)').run('legacy-operation','legacy-event','legacy-staff','sale','{"saleId":"legacy-sale","number":1}','2026-11-08');
 for(const file of files.slice(2))old.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const row=old.sqlite.prepare('SELECT * FROM operations').get();assert.equal(row.request_hash,null);assert.equal(row.outcome,'committed');assert.equal(JSON.parse(row.result).saleId,'legacy-sale');old.close();
});
test('invalid event creation has a durable rejected outcome so the form can be corrected safely',async()=>{
 const {operationStatus}=await import(join(tmp,'service.mjs'));
 const p={operationId:crypto.randomUUID(),eventId,name:'X',date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:6};
 await assert.rejects(()=>mutate('createEvent',p,manager),e=>e.recorded===true);
 assert.equal((await operationStatus('createEvent',p,manager)).state,'rejected');
 assert.equal(db.sqlite.prepare('SELECT count(*) n FROM events WHERE id=?').get(p.operationId).n,0);
});

test('compact register pages retain whole-event money and sellers while limiting history to fifty receipts',async()=>{
 const id=(await cmd('createEvent',{name:'Paged ledger',date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:1})).eventId;
 const till=(await cmd('openTill',{eventId:id,number:1,opening:10000})).tillId;
 for(let n=0;n<65;n++)await cmd('sale',{eventId:id,tillId:till,items:[{id:crypto.randomUUID(),seller:n%2+1,price:650}],donation:50,received:1000});
 const full=await readState(id,manager),compact=await readRegisterState(id,manager),next=await readRegisterState(id,manager,{before:compact.salesPage.nextBefore});
 assert.equal(compact.sales.length,50);assert.equal(next.sales.length,15);assert.equal(new Set([...compact.sales,...next.sales].map(s=>s.id)).size,65);
 assert.equal(compact.summary.gross,42250);assert.equal(compact.summary.donations,3250);assert.equal(compact.summary.count,65);assert.equal(compact.summary.itemCount,65);assert.equal(compact.summary.tillBalances[till],55500);
 assert.equal(compact.summary.sellers[0].gross,21450);assert.equal(compact.summary.sellers[0].commission,3218);assert.equal(compact.summary.sellers[1].gross,20800);
 assert.equal(full.sales.length,65);assert.equal((await readRegisterState(id,manager,{search:'2'})).sales.every(s=>s.number.toString().includes('2')||s.items.some(i=>i.seller===2)),true);
});
test('SQLite rejects duplicate event receipt and simultaneously open till numbers independently of application validation',async()=>{
 const id=(await cmd('createEvent',{name:'Constraint ledger',date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:1})).eventId;
 const till=(await cmd('openTill',{eventId:id,number:1,opening:10000})).tillId;
 await cmd('sale',{eventId:id,tillId:till,items:[{id:crypto.randomUUID(),seller:1,price:100}],received:100});
 assert.throws(()=>db.sqlite.prepare('INSERT INTO sales SELECT ?,event_id,till_id,staff_id,staff_name,number,items,total,received,created_at,voided_at,voided_by,void_reason,donation FROM sales WHERE event_id=?').run(crypto.randomUUID(),id),/UNIQUE/);
 assert.throws(()=>db.sqlite.prepare('INSERT INTO till_sessions SELECT ?,event_id,number,opening,opened_at,opened_by,closed_at,closed_by,counted,expected,note FROM till_sessions WHERE id=?').run(crypto.randomUUID(),till),/UNIQUE/);
});
test('restored databases block all writes until reconciliation and then reject both legacy and explicit old tablet epochs',async()=>{
 const state=db.sqlite.prepare('SELECT * FROM instance_state WHERE id=1').get();
 try {
  db.sqlite.prepare('UPDATE instance_state SET epoch=?,writes_paused=1 WHERE id=1').run('restored-fixture');
  await assert.rejects(()=>cmd('openTill',{number:1,opening:100}),e=>e.code==='WRITE_PAUSED'&&!e.recorded);
  db.sqlite.prepare('UPDATE instance_state SET writes_paused=0 WHERE id=1').run();
  for(const instanceEpoch of [undefined,'initial'])await assert.rejects(()=>cmd('openTill',{number:1,opening:100,instanceEpoch}),e=>e.code==='RESTORE_REVIEW_REQUIRED'&&!e.recorded);
 } finally {db.sqlite.prepare('UPDATE instance_state SET epoch=?,writes_paused=? WHERE id=1').run(state.epoch,state.writes_paused);}
});

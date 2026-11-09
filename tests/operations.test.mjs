import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync,statSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {openDatabase} from '../selfhost/sqlite.mjs';
import {migrateDatabase} from '../selfhost/migrations.mjs';
import {backupDatabase} from '../selfhost/backup.mjs';
import {restoreDatabase,releaseRestoredDatabase} from '../selfhost/restore.mjs';
import {inspectDatabase,fileHash} from '../selfhost/verify.mjs';
import {snapshot,acknowledge} from '../selfhost/ops-server.mjs';
import {retainedBackups} from '../selfhost/retention.mjs';
import {ageStatus} from '../selfhost/health.mjs';
const tmp=mkdtempSync(join(tmpdir(),'basar-operations-'));after(()=>rmSync(tmp,{recursive:true,force:true}));
function fixture(name) {
 const path=join(tmp,name+'.sqlite'),db=openDatabase(path);migrateDatabase(db);
 db.sqlite.exec("INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,created_at) VALUES('e','Synthetic','2026-11-21',1500,1,150,1,'2026-11-09'); INSERT INTO till_sessions(id,event_id,number,opening,opened_at,opened_by) VALUES('t','e',1,10000,'2026-11-09','Test');");
 db.sqlite.prepare("INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,received,created_at,donation) VALUES('s','e','t','fixture','Test',1,?,650,1000,'2026-11-09',50)").run(JSON.stringify([{id:'i',seller:42,price:650}]));
 return {path,db};
}
test('online WAL backup contains a coherent receipt, is private, and never overwrites an existing backup',async()=>{
 const {path,db}=fixture('backup');const output=join(tmp,'backup-copy.sqlite');
 await backupDatabase(path,output);assert.equal(statSync(output).mode&0o777,0o600);assert.deepEqual(inspectDatabase(output).ledger.e,{sales:1,voids:0,goods:650,donations:50});
 assert.equal(readdirSync(tmp).filter(name=>name.startsWith('backup-copy.sqlite')&&name!=='backup-copy.sqlite').length,0);
 const digest=await fileHash(output);await assert.rejects(()=>backupDatabase(path,output),/exists/);assert.equal(await fileHash(output),digest);db.close();
});
test('restore migrates only a separate copy, starts paused, changes epoch and keeps financial evidence intact',async()=>{
 const {path,db}=fixture('restore');db.close();const hash=await fileHash(path),output=join(tmp,'restored.sqlite');
 const restored=await restoreDatabase(path,output);assert.equal(restored.writesPaused,true);assert.notEqual(restored.epoch,'initial');assert.equal(await fileHash(path),hash);
 assert.throws(()=>releaseRestoredDatabase(output,'wrong-epoch'),/does not match/);releaseRestoredDatabase(output,restored.epoch);
 const copy=openDatabase(output);assert.equal(copy.sqlite.prepare('SELECT writes_paused FROM instance_state WHERE id=1').get().writes_paused,0);copy.close();
 assert.deepEqual(inspectDatabase(output).ledger,inspectDatabase(path).ledger);
});
test('snapshots and Mac acknowledgements are independently hashed; forged acknowledgements cannot turn green',async()=>{
 const {path,db}=fixture('snapshot'),directory=join(tmp,'backups'),state=join(tmp,'state');
 const manifest=await snapshot(path,directory,state);assert.ok(existsSync(join(directory,manifest.name)));await acknowledge(manifest,directory,state);
 assert.equal(JSON.parse(readFileSync(join(state,'mac.json'),'utf8')).sha256,manifest.sha256);
 await assert.rejects(()=>acknowledge({...manifest,sha256:'0'.repeat(64)},directory,state),/does not match/);db.close();
});
test('migration refuses duplicate historical receipt numbers atomically instead of repairing financial evidence',()=>{
 const directory=join(tmp,'old-migrations');mkdirSync(directory);
 for(const name of ['0000_cuddly_tattoo.sql','0001_chilly_doomsday.sql','0002_operation_recovery.sql'])copyFileSync(resolve('drizzle',name),join(directory,name));
 const db=openDatabase(join(tmp,'duplicate.sqlite'));migrateDatabase(db,directory);
 db.sqlite.exec("INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,created_at) VALUES('e','Synthetic','2026-11-21',1500,1,150,1,'2026-11-09'); INSERT INTO till_sessions(id,event_id,number,opening,opened_at,opened_by) VALUES('t','e',1,0,'2026-11-09','Test');");
 const insert=db.sqlite.prepare("INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,received,created_at) VALUES(?,'e','t','fixture','Test',1,'[]',0,0,'2026-11-09')");insert.run('one');insert.run('two');
 assert.throws(()=>migrateDatabase(db),/UNIQUE/);assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM sales').get().n,2);assert.equal(db.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='instance_state'").get(),undefined);db.close();
});
test('retention preserves recent and distinct hourly/daily restore points; stale or missing copies are never green',()=>{
 const day=86400000,now=Date.parse('2026-11-09T12:00:00Z');
 const entries=Array.from({length:100},(_,i)=>({name:String(i),time:now-i*day}));const keep=retainedBackups(entries,{latest:2,hours:3,days:7});assert.equal(keep.size,7);assert.ok(keep.has('0'));assert.ok(keep.has('6'));assert.ok(!keep.has('7'));
 assert.equal(ageStatus(null,now).status,'critical');assert.equal(ageStatus(new Date(now-601000).toISOString(),now).status,'critical');assert.equal(ageStatus(new Date(now-400000).toISOString(),now).status,'warning');assert.equal(ageStatus(new Date(now-60000).toISOString(),now).status,'ok');
});

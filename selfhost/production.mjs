// Offline production provisioning/recovery. Credentials only enter/leave private files, never argv/stdout.
import {existsSync,mkdirSync,readFileSync,writeFileSync,chmodSync,statSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomInt} from 'node:crypto';
import {openDatabase} from './sqlite.mjs';
import {migrateDatabase} from './migrations.mjs';
import {productionVerifier,validProductionCredential,randomToken,digest,encryptPin} from '../lib/basar/credentials.ts';
const financial=['sales','till_sessions','payouts','movements','operations','pool_entries'];
const now=()=>new Date().toISOString();
function privateFile(path,value){mkdirSync(dirname(path),{recursive:true,mode:0o700});const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}chmodSync(path,0o600);}
function existingDatabase(path){if(!existsSync(path))throw new Error('Database does not exist.');return openDatabase(path);}
function installation(db,expected){const row=db.sqlite.prepare('SELECT * FROM installation WHERE id=1').get();if(!row||row.mode!=='production'||(expected&&row.installation_id!==expected))throw new Error('Production installation does not match; refusing to change this database.');return row;}
function emptyFinancial(db){for(const table of financial)if(db.sqlite.prepare('SELECT COUNT(*) n FROM '+table+(table==='operations'?" WHERE action NOT IN ('createEvent','updateEvent','addStaff','updateStaff')":'')).get().n!==0)throw new Error('Prepared production must contain no financial records.');}
function checkConfig(config){
 const e=config.event;if(!e||typeof e.name!=='string'||e.name.trim().length<3||e.name.length>100||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date)))throw new Error('Valid event name/date required.');
 for(const [value,min,max] of [[e.commission,0,10000],[e.sellerMin,1,99999],[e.sellerMax,e.sellerMin,99999],[e.tillCount,1,20]])if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Invalid event configuration.');
 const url=new URL(config.publicUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(!url.hostname.match(/^(localhost|127\.0\.0\.1)$/)&&url.protocol!=='https:'))throw new Error('A public HTTPS application URL is required.');
 if(config.managerName&&(typeof config.managerName!=='string'||config.managerName.trim().length<2||config.managerName.length>60))throw new Error('Manager name must contain 2 to 60 characters.');
 if(config.cashierNames&&(!Array.isArray(config.cashierNames)||config.cashierNames.length!==e.tillCount||config.cashierNames.some(n=>typeof n!=='string'||n.trim().length<2||n.length>60)||new Set(config.cashierNames.map(n=>n.trim().toLowerCase())).size!==e.tillCount))throw new Error('Provide distinct cashier names for every till.');
 if(config.managerPassword&&!validProductionCredential('manager',config.managerPassword))throw new Error('Manager password must contain 15 to 128 characters.');
 if(!/^[a-f0-9]{64}$/i.test(process.env.BASAR_TEAM_PIN_KEY||''))throw new Error('A stable private BASAR_TEAM_PIN_KEY is required.');
}
async function insertDevice(db,{label,kind,eventId=null,tillNumber=null,publicUrl},time=Date.now()){
 const id=crypto.randomUUID(),code=randomToken();
 db.sqlite.prepare('INSERT INTO trusted_devices(id,label,kind,event_id,till_number,registration_hash,registration_expires_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,label,kind,eventId,tillNumber,await digest(code),time+72*3600000,time+8*86400000);
 const url=new URL(publicUrl);url.searchParams.set('setup',id);url.hash=new URLSearchParams({device:code}).toString();
 return {id,label,kind,eventId,tillNumber,enrolmentUrl:url.href,registrationExpiresAt:new Date(time+72*3600000).toISOString()};
}
export async function prepareProduction(databasePath,config,handoverPath){
 checkConfig(config);if(existsSync(databasePath)||existsSync(handoverPath))throw new Error('Destination already exists; refusing to overwrite production or access data.');
 mkdirSync(dirname(databasePath),{recursive:true,mode:0o700});const db=openDatabase(databasePath);migrateDatabase(db);
 const eventId=crypto.randomUUID(),installationId=crypto.randomUUID(),managerId=crypto.randomUUID(),password=config.managerPassword||randomToken().slice(0,24),managerHash=await productionVerifier(password),cashiers=[];
 for(let n=1;n<=config.event.tillCount;n++){
  const id=crypto.randomUUID(),pin=String(randomInt(100000,1000000));cashiers.push({id,name:config.cashierNames?.[n-1]||'Kasse '+n,number:n,hash:await productionVerifier(pin),cipher:await encryptPin(pin,id,eventId)});
 }
 let handover;
 try{
  db.sqlite.exec('BEGIN IMMEDIATE');
  db.sqlite.prepare("UPDATE installation SET installation_id=?,mode='production',phase='prepared',activated_at=NULL WHERE id=1").run(installationId);
  db.sqlite.prepare('UPDATE instance_state SET epoch=?,writes_paused=1 WHERE id=1').run(crypto.randomUUID());
  const e=config.event;db.sqlite.prepare("INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,settlement_mode,status,version,created_at) VALUES(?,?,?,?,?,?,?,'pool','open',0,?)").run(eventId,e.name.trim(),e.date,e.commission,e.sellerMin,e.sellerMax,e.tillCount,now());
  db.sqlite.prepare("INSERT INTO staff(id,name,role,pin_hash,disabled,auth_version) VALUES(?,?,'manager',?,0,0)").run(managerId,config.managerName||'Kassenleitung',managerHash);
  for(const c of cashiers)db.sqlite.prepare("INSERT INTO staff(id,name,role,pin_hash,pin_cipher,disabled,event_id,till_number,auth_version) VALUES(?,?,'cashier',?,?,0,?,?,0)").run(c.id,c.name,c.hash,c.cipher,eventId,c.number);
  db.sqlite.prepare('INSERT INTO audit(id,event_id,action,detail,staff_name,created_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),eventId,'Produktivbasar vorbereitet',e.name.trim(),'System',now());
  const devices=[await insertDevice(db,{label:'Kassenleitung',kind:'management',publicUrl:config.publicUrl})];
  for(const c of cashiers)devices.push(await insertDevice(db,{label:'Kasse '+c.number,kind:'register',eventId,tillNumber:c.number,publicUrl:config.publicUrl}));
  emptyFinancial(db);
  handover={installationId,event:{id:eventId,...e},publicUrl:config.publicUrl,manager:{id:managerId,name:config.managerName||'Kassenleitung',password},cashiers:cashiers.map(c=>({id:c.id,name:c.name,tillNumber:c.number})),devices,createdAt:now(),note:'Private initial manager/device access; cashier PINs remain encrypted in the database and are revealed only in authorized team management.'};
  privateFile(handoverPath,handover);db.sqlite.exec('COMMIT');db.sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');chmodSync(databasePath,0o600);
  return {installationId,eventId,phase:'prepared',cashiers:cashiers.length,devices:devices.length,financialRows:0};
 }catch(error){try{db.sqlite.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}
export function inspectProduction(path){const db=existingDatabase(path);try{const row=installation(db);return {installationId:row.installation_id,mode:row.mode,phase:row.phase,events:db.sqlite.prepare('SELECT id,name,date,commission,seller_min,seller_max,till_count,status FROM events ORDER BY created_at').all(),counts:Object.fromEntries(financial.map(t=>[t,db.sqlite.prepare('SELECT COUNT(*) n FROM '+t).get().n])),demoAccounts:db.sqlite.prepare("SELECT COUNT(*) n FROM staff WHERE id LIKE 'demo-%'").get().n,paused:!!db.sqlite.prepare('SELECT writes_paused FROM instance_state WHERE id=1').get().writes_paused,integrity:db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check};}finally{db.close();}}
export function activateProduction(path,approval){
 if(!approval||approval.approved!==true||typeof approval.approvedBy!=='string'||!approval.approvedBy.trim()||!Number.isFinite(Date.parse(approval.approvedAt||''))||Math.abs(Date.now()-Date.parse(approval.approvedAt))>86400000)throw new Error('A current explicit owner approval file is required.');
 const db=existingDatabase(path);try{db.sqlite.exec('BEGIN IMMEDIATE');const row=installation(db,approval.installationId);if(row.phase!=='prepared')throw new Error('Only an unactivated prepared installation can go live. Restores require reconciliation.');emptyFinancial(db);if(db.sqlite.prepare("SELECT COUNT(*) n FROM staff WHERE id LIKE 'demo-%'").get().n)throw new Error('Demo accounts are forbidden.');
  if(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.sqlite.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Database integrity checks failed.');
  const events=db.sqlite.prepare('SELECT * FROM events').all(),people=db.sqlite.prepare('SELECT * FROM staff WHERE disabled=0').all();
  if(events.length!==1||events[0].status!=='open')throw new Error('Fresh activation requires one open event.');
  if(!people.some(p=>p.role==='manager'&&!p.event_id)||people.some(p=>!/^pbkdf2-sha256\$600000\$[^$]+\$[a-f0-9]{64}$/.test(p.pin_hash)))throw new Error('Active production accounts require strong verifiers and a global manager.');
  const devices=db.sqlite.prepare('SELECT * FROM trusted_devices WHERE revoked_at IS NULL AND expires_at>? AND (token_hash IS NOT NULL OR registration_expires_at>?)').all(Date.now(),Date.now());
  if(!devices.some(d=>d.kind==='management'&&!d.event_id))throw new Error('A current management device or invitation is required.');
  for(let n=1;n<=events[0].till_count;n++)if(!people.some(p=>p.role==='cashier'&&p.event_id===events[0].id&&p.till_number===n&&p.pin_cipher)||!devices.some(d=>d.kind==='register'&&d.event_id===events[0].id&&d.till_number===n))throw new Error('Every till needs an active cashier and current device invitation.');
  db.sqlite.prepare("UPDATE installation SET phase='live',activated_at=? WHERE id=1 AND phase='prepared'").run(now());db.sqlite.prepare('UPDATE instance_state SET writes_paused=0 WHERE id=1').run();db.sqlite.exec('COMMIT');return {installationId:row.installation_id,phase:'live'};
 }catch(error){try{db.sqlite.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
}
export async function recoverManager(path,id,password){
 if(!validProductionCredential('manager',password))throw new Error('A 15–128 character manager password is required.');const hash=await productionVerifier(password),db=existingDatabase(path);
 try{installation(db);const person=db.sqlite.prepare("SELECT id FROM staff WHERE id=? AND role='manager'").get(id);if(!person)throw new Error('Manager not found.');db.sqlite.exec('BEGIN IMMEDIATE');if(db.sqlite.prepare("UPDATE staff SET pin_hash=?,pin_cipher=NULL,disabled=0,auth_version=auth_version+1 WHERE id=? AND role='manager'").run(hash,id).changes!==1)throw new Error('Manager role changed; retry recovery.');db.sqlite.prepare('DELETE FROM sessions WHERE staff_id=?').run(id);db.sqlite.prepare('DELETE FROM login_limits WHERE id=?').run('account:'+id);db.sqlite.exec('COMMIT');return {managerRecovered:true,sessionsRevoked:true};}finally{db.close();}
}
export function revokeDevice(path,id){const db=existingDatabase(path);try{installation(db);db.sqlite.exec('BEGIN IMMEDIATE');if(db.sqlite.prepare('UPDATE trusted_devices SET revoked_at=? WHERE id=?').run(Date.now(),id).changes!==1)throw new Error('Device not found.');db.sqlite.prepare('DELETE FROM sessions WHERE device_id=?').run(id);db.sqlite.exec('COMMIT');return {deviceRevoked:true};}catch(error){try{db.sqlite.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}}
export async function inviteDevice(path,options,output){if(existsSync(output))throw new Error('Private output already exists.');const db=existingDatabase(path);try{const row=installation(db);if(!['register','management'].includes(options.kind)||typeof options.label!=='string'||options.label.length<2||options.label.length>60)throw new Error('Valid device label/kind required.');if(options.kind==='register'){const event=db.sqlite.prepare('SELECT till_count FROM events WHERE id=?').get(options.eventId);if(!event||!Number.isInteger(options.tillNumber)||options.tillNumber<1||options.tillNumber>event.till_count)throw new Error('Invalid event/till scope.');}const invite=await insertDevice(db,options);privateFile(output,{installationId:row.installation_id,...invite});return {deviceId:invite.id,privateInvitationWritten:true};}finally{db.close();}}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const [command,...args]=process.argv.slice(2),flags={};for(let n=0;n<args.length;n+=2){if(!args[n]?.startsWith('--')||args[n+1]===undefined)throw new Error('Use named file/path arguments.');flags[args[n].slice(2)]=args[n+1];}
 const read=path=>{if(!path)throw new Error('Required private input file missing.');if((statSync(path).mode&0o077)!==0)throw new Error('Private input files must use mode 0600.');return JSON.parse(readFileSync(path,'utf8'));};
 let result;if(!flags.database)throw new Error('--database required.');
 if(command==='prepare')result=await prepareProduction(resolve(flags.database),read(flags.config),resolve(flags.handover));
 else if(command==='inspect')result=inspectProduction(resolve(flags.database));
 else if(command==='activate')result=activateProduction(resolve(flags.database),read(flags.approval));
 else if(command==='recover-manager')result=await recoverManager(resolve(flags.database),flags.manager,read(flags.credentials).password);
 else if(command==='revoke-device')result=revokeDevice(resolve(flags.database),flags.device);
 else if(command==='invite-device')result=await inviteDevice(resolve(flags.database),read(flags.config),resolve(flags.output));
 else throw new Error('Use prepare, inspect, activate, recover-manager, invite-device or revoke-device.');
 console.log(JSON.stringify(result,null,2));
}

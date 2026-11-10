import {database} from './database';
import type {Person} from './domain';
import {sellerSummaries,tillBalance,validateItems,money,saleTotal} from './domain';
import {ApiError, operationStatus, unwrapOperation, requestHash} from './operations';
export {ApiError, operationStatus} from './operations';
import {readCommandState,assertWriteEpoch} from './queries';
export {readRegisterState} from './queries';
import {prepareTeamChange} from './team';
import {assertEventAccess,assertTillAccess,currentPerson} from './access';
export {bootstrap,auth,login,logout} from './auth';
export {readState} from './full-state';
export {readTeam} from './team';
const db=database;
const uuid=()=>crypto.randomUUID();const now=()=>new Date().toISOString();
function requireManager(user:Person){if(user.role!=='manager')throw new ApiError('Diese Aktion ist der Kassenleitung vorbehalten.',403)}
function int(value:unknown,min:number,max:number,label:string){if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)throw new ApiError(label);return Number(value)}
function text(value:unknown,min:number,max:number,label:string){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new ApiError(label);return value.trim()}
export async function mutate(action:string,p:any,user:Person){
 await assertWriteEpoch(p);
 user=await currentPerson(user);
 assertEventAccess(user,p.eventId);
 const op=text(p.operationId,8,100,'Die Vorgangskennung fehlt.');
 const hash=await requestHash(action,p);
 const replay=unwrapOperation(await operationStatus(action,p,user));if(replay)return replay;

 if(action==='createEvent') {
   requireManager(user);
   if(user.event_id)throw new ApiError('Neue Basare können nur mit dem zentralen Verwaltungszugang angelegt werden.',403);
   const id=op;
   try {
     const name=text(p.name,3,100,'Bitte einen Veranstaltungsnamen eingeben.');
     if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date)))throw new ApiError('Bitte ein gültiges Datum wählen.');
     const commission=int(p.commission,0,10000,'Der Vereinsanteil muss zwischen 0 und 100 % liegen.');
     const min=int(p.sellerMin,1,99999,'Ungültige erste Verkäufernummer.');
     const max=int(p.sellerMax,min,99999,'Ungültige letzte Verkäufernummer.');
     const count=int(p.tillCount,1,20,'Es sind 1 bis 20 Kassen möglich.');
     const result={eventId:id};
     await db().batch([
       db().prepare('INSERT INTO events(id,name,date,commission,seller_min,seller_max,till_count,status,version,created_at,settlement_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,name,p.date,commission,min,max,count,'open',0,now(),'pool'),
       db().prepare('INSERT INTO audit(id,event_id,action,detail,staff_name,created_at) VALUES(?,?,?,?,?,?)').bind(uuid(),id,'Veranstaltung angelegt',name,user.name,now()),
       db().prepare('INSERT INTO operations(id,event_id,staff_id,action,result,created_at,request_hash) VALUES(?,?,?,?,?,?,?)').bind(op,p.eventId,user.id,action,JSON.stringify(result),now(),hash),
     ]);
     return result;
   } catch(error) {
     const done=unwrapOperation(await operationStatus(action,p,user));if(done)return done;
     if(!(error instanceof ApiError))throw error;
     const failure={error:error.message,status:error.status,code:error.code};
     try {
       await db().prepare("INSERT INTO operations(id,event_id,staff_id,action,result,created_at,request_hash,outcome) VALUES(?,?,?,?,?,?,?,'rejected')").bind(op,p.eventId,user.id,action,JSON.stringify(failure),now(),hash).run();
     } catch(storageError) {
       const concurrent=unwrapOperation(await operationStatus(action,p,user));if(concurrent)return concurrent;throw storageError;
     }
     throw new ApiError(error.message,error.status,error.code,true);
   }
 }
 for(let attempt=0;attempt<12;attempt++){user=await currentPerson(user);assertEventAccess(user,p.eventId);const replay2=unwrapOperation(await operationStatus(action,p,user));if(replay2)return replay2;const state=await readCommandState(action,p);if(state.event.id!==p.eventId)throw new ApiError('Die Veranstaltung wurde nicht gefunden.',404);const e=state.event;const time=now();const commands:{sql:string;params:unknown[]}[]=[];let result:Record<string,unknown>={};let detail='',auditAction='';const add=(sql:string,...params:unknown[])=>commands.push({sql,params});
 let rejection:ApiError|null=null;try{
 const till=()=>{const t=state.tills.find(t=>t.id===p.tillId);if(!t||t.closed_at)throw new ApiError('Diese Kasse ist geschlossen. Bitte eine offene Kasse wählen.');assertTillAccess(user,t.number);return t};
 if(action==='openTill'){assertTillAccess(user,p.number);if(e.settlement_mode==='pool'&&e.status!=='open')throw new ApiError('Nach Verkaufsende kann keine Kasse mehr geöffnet werden.');if(e.status==='closed')throw new ApiError('Die Veranstaltung ist bereits abgeschlossen.');const number=int(p.number,1,e.till_count,'Ungültige Kassennummer.');if(state.tills.some(t=>t.number===number&&!t.closed_at))throw new ApiError('Diese Kasse ist bereits geöffnet.');const opening=int(p.opening,0,10000000,'Ungültiges Anfangswechselgeld.');const id=uuid();add('INSERT INTO till_sessions(id,event_id,number,opening,opened_at,opened_by) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',id,e.id,number,opening,time,user.name,e.id,op);result={tillId:id};auditAction='Kasse geöffnet';detail=`Kasse ${number}, Wechselgeld ${money(opening)}`;
 }else if(action==='sale'){if(e.status!=='open')throw new ApiError('Die Verkaufsphase ist beendet.');const t=till();let total:number;try{total=validateItems(p.items,e,state.payouts)}catch(error){throw new ApiError((error as Error).message)}const donation=int(p.donation??0,0,1000000,'Die Aufrundung muss ein positiver Centbetrag bis 10.000 € sein.');const payable=total+donation;const received=int(p.received,payable,10000000,'Der erhaltene Betrag ist kleiner als der Zahlbetrag einschließlich Aufrundung.');const id=uuid();const number=state.nextSaleNumber;add('INSERT INTO sales(id,event_id,till_id,staff_id,staff_name,number,items,total,donation,received,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',id,e.id,t.id,user.id,user.name,number,JSON.stringify(p.items),total,donation,received,time,e.id,op);result={saleId:id,number,total,donation,payable,received,change:received-payable};auditAction='Verkauf';detail=`Verkauf #${String(number).padStart(4,'0')} · ${p.items.length} Positionen${donation?` · Aufrundung für den Verein: ${money(donation)}`:""}`;
 }else if(action==='void'){requireManager(user);const s=state.sales.find(s=>s.id===p.saleId);if(!s||s.voided_at)throw new ApiError('Dieser Verkauf wurde bereits storniert oder existiert nicht.');const originalTill=state.tills.find(t=>t.id===s.till_id);if(!originalTill||originalTill.closed_at)throw new ApiError('Die ursprüngliche Kasse ist bereits abgeschlossen.');if(tillBalance(state,originalTill)<saleTotal(s))throw new ApiError('Der Kassenbestand reicht für die Rückzahlung nicht aus. Bitte zuerst eine Bargeldeinlage buchen.');if(s.items.some(i=>state.payouts.some(p=>p.seller===i.seller)))throw new ApiError('Ein beteiligter Verkäufer wurde bereits ausgezahlt.');const reason=text(p.reason,3,200,'Bitte einen Stornogrund mit mindestens 3 Zeichen angeben.');add('UPDATE sales SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',time,user.name,reason,s.id,e.id,op);auditAction='Verkauf storniert';detail=`Verkauf #${String(s.number).padStart(4,'0')}: ${reason}`;
 }else if(action==='movement'){requireManager(user);const t=till();const amount=int(p.amount,-10000000,10000000,'Ungültiger Betrag.');if(amount===0)throw new ApiError('Der Betrag darf nicht null sein.');if(tillBalance(state,t)+amount<0)throw new ApiError('Der erwartete Kassenbestand reicht für diese Entnahme nicht aus.');const reason=text(p.reason,3,200,'Bitte einen Grund angeben.');add('INSERT INTO movements(id,event_id,till_id,amount,reason,staff_name,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',uuid(),e.id,t.id,amount,reason,user.name,time,e.id,op);auditAction=amount>0?'Bargeldeinlage':'Bargeldentnahme';detail=`Kasse ${t.number}: ${reason}`;
 }else if(action==='poolMovement'){
   requireManager(user);
   if(e.settlement_mode!=='pool'||e.status!=='settlement')throw new ApiError('Geldbewegungen im Auszahlungstopf sind nur während der Abrechnung möglich.');
   if(state.tills.some(t=>!t.closed_at))throw new ApiError('Bitte zuerst alle Kassen zählen und schließen.');
   const amount=int(p.amount,-10000000,10000000,'Ungültiger Betrag.');
   if(!amount)throw new ApiError('Der Betrag darf nicht null sein.');
   if(state.pool.balance+amount<0)throw new ApiError('Der Auszahlungstopf enthält nicht genügend Bargeld.');
   const reason=text(p.reason,3,200,'Bitte einen Grund angeben.');
   add("INSERT INTO pool_entries(id,event_id,kind,amount,reason,staff_id,staff_name,created_at) SELECT ?,?,'movement',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)",uuid(),e.id,amount,reason,user.id,user.name,time,e.id,op);
   auditAction=amount>0?'Einlage in Auszahlungstopf':'Entnahme aus Auszahlungstopf';detail=money(amount)+': '+reason;
 }else if(action==='payout'){
   requireManager(user);
   if(e.status==='open')throw new ApiError('Bitte zuerst die Verkaufsphase beenden. Danach sind Verkäuferauszahlungen möglich.');
   if(e.status==='closed')throw new ApiError('Die Veranstaltung ist bereits abgeschlossen.');
   const pooled=e.settlement_mode==='pool';
   const t=pooled?null:till();
   if(pooled&&(!state.tills.length||state.tills.some(t=>!t.closed_at)))throw new ApiError('Bitte zuerst alle Kassen zählen und schließen. Danach wird aus dem Auszahlungstopf ausgezahlt.');
   const seller=int(p.seller,e.seller_min,e.seller_max,'Ungültige Verkäufernummer.');
   const row=sellerSummaries(state).find(row=>row.seller===seller);
   if(!row||row.payout)throw new ApiError('Keine offene Auszahlung für diese Verkäufernummer.');
   if((pooled?state.pool.balance:tillBalance(state,t!))<row.net)throw new ApiError('Der verfügbare Bargeldbestand reicht für diese Auszahlung nicht aus.');
   add('INSERT INTO payouts(id,event_id,seller,gross,commission,net,rounding,funding,till_id,staff_name,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',uuid(),e.id,seller,row.gross,row.commission,row.net,row.rounding??0,pooled?'pool':'till',t?.id??null,user.name,time,e.id,op);
   auditAction='Verkäufer ausgezahlt';detail=`Verkäufer ${seller}: ${money(row.net)} ${pooled?'aus Auszahlungstopf':'aus Kasse '+t!.number}${row.rounding?' · Abrundung für Basar: '+money(row.rounding):''}`;
 }else if(action==='closeTill'){
   requireManager(user);const t=till();
   if(e.settlement_mode==='pool'&&e.status==='open')throw new ApiError('Bitte zuerst die Verkaufsphase beenden.');
   const counted=int(p.counted,0,10000000,'Bitte einen gültigen gezählten Bestand eingeben.');
   const expected=tillBalance(state,t),note=typeof p.note==='string'?p.note.trim().slice(0,300):'';
   if(counted!==expected&&note.length<3)throw new ApiError('Bitte die Kassendifferenz mit einer Notiz erläutern.');
   add('UPDATE till_sessions SET closed_at=?,closed_by=?,counted=?,expected=?,note=? WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',time,user.name,counted,expected,note,t.id,e.id,op);
   if(e.settlement_mode==='pool')add("INSERT INTO pool_entries(id,event_id,till_id,kind,amount,reason,staff_id,staff_name,created_at) SELECT ?,?,?,'till',?,'Gezählter Kasseninhalt',?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)",uuid(),e.id,t.id,counted,user.id,user.name,time,e.id,op);
   auditAction='Kassenabschluss';detail=`Kasse ${t.number}, Differenz ${money(counted-expected)}${e.settlement_mode==='pool'?', im Auszahlungstopf: '+money(counted):''}`;result={difference:counted-expected};
 }else if(action==='addStaff'||action==='updateStaff'){
   const change=await prepareTeamChange(action,p,user,e,op);commands.push(...change.commands);result=change.result;
   auditAction=action==='addStaff'?'Teammitglied hinzugefügt':'Teammitglied bearbeitet';detail=change.detail;
 }else if(action==='updateEvent'){requireManager(user);if(state.saleCount||state.tills.length)throw new ApiError('Nach Öffnung einer Kasse sind die Veranstaltungseinstellungen gesperrt.');const name=text(p.name,3,100,'Bitte einen Namen eingeben.');const commission=int(p.commission,0,10000,'Ungültiger Vereinsanteil.');const min=int(p.sellerMin,1,99999,'Ungültige Verkäufernummer.');const max=int(p.sellerMax,min,99999,'Ungültige Verkäufernummer.');const count=int(p.tillCount,1,20,'Ungültige Kassenanzahl.');if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||Number.isNaN(Date.parse(p.date)))throw new ApiError('Ungültiges Datum.');add('UPDATE events SET name=?,date=?,commission=?,seller_min=?,seller_max=?,till_count=? WHERE id=? AND last_op=?',name,p.date,commission,min,max,count,e.id,op);auditAction='Veranstaltung bearbeitet';detail=name;
 }else if(action==='eventStatus'){requireManager(user);if(p.status==='settlement'&&e.status==='open'){add('UPDATE events SET status=? WHERE id=? AND last_op=?','settlement',e.id,op);auditAction='Verkauf beendet';detail='Verkäufe gesperrt. Verkäuferabrechnung freigegeben.'}else if(p.status==='closed'&&e.status==='settlement'){if(state.tills.some(t=>!t.closed_at))throw new ApiError('Bitte zuerst alle Kassen abschließen.');if(sellerSummaries(state).some(r=>!r.payout))throw new ApiError('Es sind noch Verkäuferauszahlungen offen.');add('UPDATE events SET status=? WHERE id=? AND last_op=?','closed',e.id,op);auditAction='Veranstaltung abgeschlossen';detail='Alle Kassen geschlossen und Verkäufer ausgezahlt.'}else throw new ApiError('Dieser Statuswechsel ist nicht möglich.');
 }else throw new ApiError('Unbekannte Aktion.');
 }catch(error){if(!(error instanceof ApiError)||error.status>=500)throw error;rejection=error;commands.length=0;result={error:error.message,status:error.status,code:error.code};}

 const st=[db().prepare('UPDATE events SET version=version+1,last_op=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM staff WHERE id=? AND auth_version=? AND disabled=0)').bind(op,e.id,e.version,user.id,user.auth_version??0),...commands.map(c=>db().prepare(c.sql).bind(...c.params)),...(!rejection?[db().prepare('INSERT INTO audit(id,event_id,action,detail,staff_name,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)').bind(uuid(),e.id,auditAction,detail,user.name,time,e.id,op)]:[]),db().prepare('INSERT INTO operations(id,event_id,staff_id,action,result,created_at,request_hash,outcome) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)').bind(op,e.id,user.id,action,JSON.stringify(result),time,hash,rejection?'rejected':'committed',e.id,op)];try{const r=await db().batch(st);if(r[0].meta.changes){if(rejection)throw new ApiError(rejection.message,rejection.status,rejection.code,true);return result}}catch(error){const done=unwrapOperation(await operationStatus(action,p,user));if(done)return done;throw error}
 await new Promise(resolve=>setTimeout(resolve,Math.min(80,5*(attempt+1))+Math.floor(Math.random()*10)));
 }throw new ApiError('Eine andere Kasse hat gleichzeitig gebucht. Bitte erneut versuchen.',409,'CONCURRENT_WRITE')
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyRegister,loadRegister,saveRegister,confirmedRegister,registerKey,canResubmitPending} from '../lib/basar/register.ts';
const key=registerKey('');
const command={entryFormat:'tenths-v1',action:'sale',operationId:'operation-123',eventId:'event-123',staffId:'cashier-123',tillId:'till-123',items:[{id:'item-123',seller:42,price:650}],received:1000,donation:50};
const receipt={saleId:'sale-123',number:1,total:650,donation:50,received:1000,change:300,payable:700};
const storage=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};};
test('crash before or after the single acknowledgement write recovers either pending command or receipt, never a stale cart',()=>{
 const s=storage();const before={...emptyRegister(),eventId:command.eventId,items:command.items,received:'10',roundTo:'7',pending:command};
 saveRegister(s,key,before);
 const completed=confirmedRegister(before,command,receipt);
 assert.deepEqual(loadRegister(s,key).pending,command); // Crash before acknowledgement write.
 saveRegister(s,key,completed);
 const recovered=loadRegister(s,key);assert.equal(recovered.pending,null);assert.deepEqual(recovered.items,[]);assert.deepEqual(recovered.lastSale,receipt);
});
test('storage failure preserves the original command and receipt transition can be repeated',()=>{
 const s=storage();const before={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};saveRegister(s,key,before);
 assert.throws(()=>saveRegister({...s,setItem:()=>{throw new Error('QuotaExceededError');}},key,confirmedRegister(before,command,receipt)),/Quota/);
 assert.deepEqual(loadRegister(s,key).pending,command);
});
test('migration keeps an old uncertain sale ID and old evidence intact',()=>{
 const s=storage();s.setItem('basar-device-v1',JSON.stringify({eventId:command.eventId,tillId:'till-123'}));s.setItem('basar-draft-v1',JSON.stringify({eventId:command.eventId,items:command.items,received:'10'}));s.setItem('basar-pending-v1',JSON.stringify(command));
 const migrated=loadRegister(s,key);assert.deepEqual(migrated.pending,command);assert.deepEqual(migrated.items,command.items);assert.ok(s.getItem('basar-pending-v1'));
});
test('malformed storage fails closed rather than returning a fresh register',()=>{
 const s=storage();s.setItem(key,'{');assert.throws(()=>loadRegister(s,key));s.setItem(key,'{}');assert.throws(()=>loadRegister(s,key),/beschädigt/);
});
test('an acknowledgement for a different operation cannot clear the current command',()=>{
 assert.throws(()=>confirmedRegister({...emptyRegister(),pending:command},{...command,operationId:'another-command'},receipt),/geändert/);
});
test('a mismatched receipt cannot clear the original basket or pending command',()=>{
 const record={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};
 assert.throws(()=>confirmedRegister(record,command,{...receipt,total:700}),/stimmt nicht/);
 assert.equal(record.pending.operationId,command.operationId);assert.equal(record.items.length,1);
});
test('legacy pending sale wins over a stale previous receipt and draft',()=>{
 const s=storage();s.setItem('basar-device-v1',JSON.stringify({eventId:command.eventId}));s.setItem('basar-draft-v1',JSON.stringify({eventId:command.eventId,lastSale:receipt,items:[]}));s.setItem('basar-pending-v1',JSON.stringify(command));
 const migrated=loadRegister(s,key);assert.equal(migrated.lastSale,null);assert.deepEqual(migrated.items,command.items);assert.equal(migrated.received,'10.00');
});

test('existing v2 register records acquire only an empty remembered identity and retain all financial recovery evidence',()=>{
 const s=storage();const record={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};
 const {lastStaffId,...legacy}=record;s.setItem(key,JSON.stringify(legacy));
 assert.deepEqual(loadRegister(s,key),{...legacy,lastStaffId:''});
});

test('legacy euro price drafts migrate once to tenths without changing basket cents, command or receipt identity',()=>{
 for(const [old,expected] of [['25','250'],['6,50','65'],['0,29','2.9']]){
  const s=storage(),record={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command,price:old};
  const {priceUnit,...legacy}=record;s.setItem(key,JSON.stringify(legacy));
  const upgraded=loadRegister(s,key);assert.equal(upgraded.price,expected);assert.equal(upgraded.priceUnit,'tenths');assert.deepEqual(upgraded.pending,command);assert.deepEqual(upgraded.items,command.items);
  assert.equal(loadRegister(s,key).price,expected);assert.equal(JSON.parse(s.getItem(key)!).pending.operationId,command.operationId);
 }
});

test('failure persisting the input-format upgrade keeps old evidence intact and prevents adopting a new register',()=>{
 const s=storage(),{priceUnit,...legacy}={...emptyRegister(),price:'25'};s.setItem(key,JSON.stringify(legacy));
 assert.throws(()=>loadRegister({...s,setItem:()=>{throw new Error('QuotaExceededError')}},key),/Quota/);
 assert.equal(JSON.parse(s.getItem(key)!).price,'25');assert.equal(JSON.parse(s.getItem(key)!).priceUnit,undefined);
});

test('an original legacy pending command gets separate provenance without changing its immutable financial payload',()=>{
 const s=storage(),{entryFormat,...legacyCommand}=command;
 const {priceUnit,...legacy}={...emptyRegister(),eventId:command.eventId,pending:legacyCommand,items:command.items,price:'25'};
 s.setItem(key,JSON.stringify(legacy));const loaded=loadRegister(s,key);
 assert.deepEqual(loaded.pending,legacyCommand);assert.equal(loaded.validatedPendingId,command.operationId);assert.equal(canResubmitPending(loaded),true);
 assert.equal(canResubmitPending(loadRegister(s,key)),true);
});

test('an obsolete client cannot make an unmarked or changed-ID command eligible for blind resubmission after the input upgrade',()=>{
 const {entryFormat,...oldCommand}=command,record={...emptyRegister(),eventId:command.eventId,pending:oldCommand,items:command.items};
 const s=storage();saveRegister(s,key,record);assert.equal(canResubmitPending(loadRegister(s,key)),false);assert.equal(JSON.parse(s.getItem(key)!).validatedPendingId,undefined);
 assert.equal(canResubmitPending(record),false);assert.equal(canResubmitPending({...record,validatedPendingId:'other-operation'}),false);
 assert.equal(canResubmitPending({...record,pending:{...oldCommand,entryFormat:'unknown-future-version'},validatedPendingId:command.operationId}),false);
 assert.equal(canResubmitPending({...record,pending:command}),true);
});
